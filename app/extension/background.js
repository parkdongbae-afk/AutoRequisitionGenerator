const PORTS = [57330, 57331, 57332, 57333, 57334, 57335]
const ext = globalThis.chrome ?? globalThis.whale ?? globalThis.browser

async function fetchBookmarkInfo() {
  for (const port of PORTS) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/bookmark-info`)
      if (res.ok) {
        const data = await res.json()
        if (data && data.url && data.name) return data
      }
    } catch (e) {}
  }
  return null
}

async function getBookmarkBarId() {
  const [root] = await ext.bookmarks.getTree()
  const bar = (root.children || []).find(
    n => n.folderType === 'bookmarks-bar' ||
      /bookmarks?\s*bar|북마크바|즐겨찾기 모음|즐겨찾기 바|북마크 바/i.test(n.title ?? '')
  )
  return bar?.id ?? (root.children || [])[0]?.id ?? '1'
}

// 회로차단기: 북마크 이벤트가 폭주하면(루프 의심) 이 세션의 heal을 영구 중단
const HEAL_MAX_PER_MINUTE = 8
let healTimes = []
let healDisabled = false

function healRateAllows() {
  if (healDisabled) return false
  const now = Date.now()
  healTimes = healTimes.filter(t => now - t < 60000)
  if (healTimes.length >= HEAL_MAX_PER_MINUTE) {
    healDisabled = true
    return false
  }
  healTimes.push(now)
  return true
}

// 북마크 생성은 절대 하지 않는다(이동·중복제거만) — 북마크릿 URL은 Chromium가 저장 시
// 정규화해 생성 결과가 검색과 어긋났고, 2026-09-17 생성→못찾음→재생성 루프로
// 북마크 361개가 만들어졌다. 생성은 앱의 [북마크바 추가](파일 기록)만 담당.
async function ensureBookmarkAtFront() {
  try {
    if (!ext || !ext.bookmarks) return
    if (!healRateAllows()) return
    const info = await fetchBookmarkInfo()
    if (!info) return
    const parentId = await getBookmarkBarId()
    const children = await ext.bookmarks.getChildren(parentId)
    const isSame = (b) => b.url === info.url && b.title === info.name
    const barMatches = children.filter(isSame)
    if (!barMatches.length) return

    for (let i = 1; i < barMatches.length; i++) {
      try { await ext.bookmarks.remove(barMatches[i].id) } catch (e) {}
    }
    const keep = barMatches[0]
    if (children[0] && children[0].id === keep.id) return
    await ext.bookmarks.move(keep.id, { parentId, index: 0 })
  } catch (e) {}
}

let healTimer = null
function scheduleHeal() {
  if (healTimer) clearTimeout(healTimer)
  healTimer = setTimeout(() => {
    healTimer = null
    ensureBookmarkAtFront()
  }, 800)
}

function startupHeal() {
  ensureBookmarkAtFront()
  setTimeout(ensureBookmarkAtFront, 5000)
}

async function postMhtml(blob, filename) {
  for (const port of PORTS) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/mhtml`, {
        method: 'POST',
        headers: {
          'Content-Type': 'multipart/related',
          'X-Filename': encodeURIComponent(filename)
        },
        body: blob
      })
      const data = await res.json()
      if (data.ok) return true
    } catch (e) {}
  }
  return false
}

// saveAsMHTML은 CSSOM으로 주입된 스타일(adoptedStyleSheets, shadow DOM 스타일)을 누락한다 —
// 캡처 직전 DOM <style>로 박제해 MHTML에 들어가게 한다 (롯데마트 제타 세로 나열 현상)
function materializeAdoptedStyles() {
  try {
    const texts = []
    const collect = (doc) => {
      try {
        for (const sheet of (doc.adoptedStyleSheets || [])) {
          try { for (const rule of sheet.cssRules) texts.push(rule.cssText) } catch (e) {}
        }
      } catch (e) {}
    }
    collect(document)
    try {
      for (const el of document.querySelectorAll('*')) {
        if (el.shadowRoot) collect(el.shadowRoot)
      }
    } catch (e) {}
    if (!texts.length) return
    if (document.querySelector('style[data-arge-adopted]')) return
    const style = document.createElement('style')
    style.setAttribute('data-arge-adopted', '1')
    style.textContent = texts.join('\n')
    ;(document.head || document.documentElement).appendChild(style)
  } catch (e) {}
}

// 체크박스의 checked 프로퍼티(사용자 클릭 상태)는 직렬화에 그대로 남지 않는다 —
// 캡처 직전 프로퍼티를 ① 표준 checked 속성(뷰어·수동 저장 호환)과
// ② data-arge-checked 스탬프(앱 규칙 엔진의 checkedOnly가 읽음)로 동기화해 박제한다
function syncCheckStates() {
  try {
    document.querySelectorAll('input[type=checkbox]').forEach(el => {
      el.setAttribute('data-arge-checked', el.checked ? 'true' : 'false')
      if (el.checked) el.setAttribute('checked', 'checked')
      else el.removeAttribute('checked')
    })
    // 네이버 등 role=checkbox 커스텀 컨트롤 — aria-checked 상태를 스탬프화해
    // 뷰어(checked 속성 반영)와 엔진이 확실하게 상태를 읽게 한다
    document.querySelectorAll('[role=checkbox]').forEach(el => {
      const v = el.getAttribute('aria-checked')
      if (v === 'true' || v === 'false') el.setAttribute('data-arge-checked', v)
    })
  } catch (e) {}
}

// 장바구니는 목록을 창(window) 단위로만 DOM에 유지하고 노드까지 재활용하는 가상화 몰이 있다
// — 네이버 실측(2026-09-23, 실제 장바구니 라이브 검증): 뷰포트에 ~2행만 존재하고 스크롤 시
// 같은 노드에 다른 상품을 그려 넣으며 조상 컨테이너 노드까지 매번 재생성된다.
// 대책: 캡처 전 스크롤 구간마다 "체크박스 앵커"로 행(가격 요소를 포함하는 최소 조상)을
// 수집하고, 캡처 직전 현재 DOM에 없는 행을 문서 끝 숨김 컨테이너(data-arge-rows)에
// 추가한 뒤 스탬프를 다시 찍어 outerHTML을 뜬다 — 앱 엔진은 문서 전체에서 rowSelector를
// 찾으므로 숨김 컨테이너의 행도 그대로 추출된다(cheerio 파싱, CSS 무관).
async function captureLiveHtml() {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms))
  const adopt = () => {
    try {
      const texts = []
      const collect = (doc) => {
        try {
          for (const sheet of (doc.adoptedStyleSheets || [])) {
            try { for (const rule of sheet.cssRules) texts.push(rule.cssText) } catch (e) {}
          }
        } catch (e) {}
      }
      collect(document)
      try { for (const el of document.querySelectorAll('*')) { if (el.shadowRoot) collect(el.shadowRoot) } } catch (e) {}
      if (texts.length && !document.querySelector('style[data-arge-adopted]')) {
        const style = document.createElement('style')
        style.setAttribute('data-arge-adopted', '1')
        style.textContent = texts.join('\n')
        ;(document.head || document.documentElement).appendChild(style)
      }
    } catch (e) {}
  }
  const rowKeyOf = (row) => {
    try {
      const a = row.querySelector('a[href]')
      if (a) { const h = a.getAttribute('href'); if (h) return h }
    } catch (e) {}
    return (row.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120)
  }
  // 체크박스 앵커 수집 — 행은 항상 체크 컨트롤을 포함하므로 체크박스에서 위로 올라가
  // "텍스트 40자 이상 + 가격 요소 포함" 조건을 만족하는 가장 가까운 조상을 행으로 삼는다.
  // 노드 재활용(같은 노드에 다른 상품 렌더)은 텍스트 키로 서로 다른 행으로 수집된다.
  const collectFrom = (store) => {
    try {
      const boxes = document.querySelectorAll('input[type=checkbox], [role=checkbox]')
      for (const box of boxes) {
        let node = box.parentElement
        for (let depth = 0; node && depth < 8; depth++) {
          const text = (node.textContent || '').replace(/\s+/g, ' ').trim()
          if (text.length >= 40 && node.querySelector('[class*=price], [class*=amount], [class*=cost]')) {
            const cls = typeof node.className === 'string' ? node.className.trim().split(/\s+/)[0] : ''
            const sig = node.tagName + '|' + cls
            let m = store.get(sig)
            if (!m) { m = new Map(); store.set(sig, m) }
            if (m.size > 400) continue
            m.set(rowKeyOf(node), node.outerHTML)
            break
          }
          node = node.parentElement
        }
      }
    } catch (e) {}
  }
  const stampAll = () => {
    try {
      document.querySelectorAll('input[type=checkbox]').forEach(el => {
        el.setAttribute('data-arge-checked', el.checked ? 'true' : 'false')
        if (el.checked) el.setAttribute('checked', 'checked')
        else el.removeAttribute('checked')
      })
      document.querySelectorAll('[role=checkbox]').forEach(el => {
        const v = el.getAttribute('aria-checked')
        if (v === 'true' || v === 'false') el.setAttribute('data-arge-checked', v)
      })
    } catch (e) {}
  }
  try { adopt() } catch (e) {}
  // 화면을 순간적으로 25%로 축소하면 가상화 목록(창 단위 렌더)이 뷰포트 안에 모든 행을 렌더한다 —
  // !important 스타일 태그로 적용(인라인보다 확실)하고 1000ms 대기 후 수집하며,
  // outerHTML까지 축소 상태에서 찍은 뒤 사용자의 원래 화면 비율로 즉시 되돌린다.
  let zoomTag = null
  try {
    zoomTag = document.createElement('style')
    zoomTag.setAttribute('data-arge-zoom', '1')
    zoomTag.textContent = 'html{zoom:0.25!important}'
    ;(document.head || document.documentElement).appendChild(zoomTag)
  } catch (e) {}
  await sleep(1000)
  const store = new Map()
  let capturedHtml = null
  try {
    // lazy 이미지가 미로딩 상태면 뷰어에서 문서 하단이 잘려 보인다 — src를 실제 값으로 교체
    try {
      for (const im of document.images) {
        const ds = im.getAttribute('data-src') || im.getAttribute('data-original') || im.getAttribute('data-lazy')
        if (ds && (im.naturalWidth === 0 || !im.src || im.src.indexOf('data:') === 0 || /blank|dummy|placeholder|loading|spinner|transparent|no_img/i.test(im.src))) im.src = ds
      }
    } catch (e) {}
    collectFrom(store)
    const de = document.documentElement
    const step = Math.max(300, Math.round(window.innerHeight * 0.9))
    let lastY = -1
    for (let i = 0; i < 80; i++) {
      window.scrollBy(0, step)
      await sleep(120)
      collectFrom(store)
      const y = window.scrollY
      if (y === lastY && y + window.innerHeight >= de.scrollHeight - 2) break
      lastY = y
    }
    // 저장이 너무 빠르면 늦게 렌더링된 행이 수집을 빠져나간다 — 마지막 수집 후 500ms
    // 안정화하고 다시 수집한 뒤 스티치·스탬프한다
    await sleep(500)
    collectFrom(store)
    // 그룹 간 중첩 제거: 어떤 그룹의 행이 더 짧은 다른 그룹의 행에 포함되면(래퍼/컨테이너) 버리고
    // 가장 안쪽(카드) 그룹만 남긴다 — 같은 상품이 여러 레벨로 중복 수집되는 것을 막는다
    const groups = [...store.entries()].map(([sig, keyMap]) => ({ sig, keyMap, sample: [...keyMap.values()][0] || '' }))
    const innermost = groups.filter(b => !groups.some(a => a !== b && a.sample.length < b.sample.length && b.sample.includes(a.sample.slice(0, 300))))
    document.querySelectorAll('[data-arge-rows]').forEach(e => e.remove())
    const container = document.createElement('div')
    container.setAttribute('data-arge-rows', '1')
    container.style.display = 'none'
    let appended = 0
    for (const g of innermost) {
      const sep = g.sig.indexOf('|')
      const tag = g.sig.slice(0, sep)
      const cls = g.sig.slice(sep + 1)
      let liveKeys = new Set()
      try {
        const sel = cls ? tag + '.' + cls : tag
        liveKeys = new Set([...document.querySelectorAll(sel)].map(rowKeyOf))
      } catch (e) {}
      for (const [key, html] of g.keyMap) {
        if (!liveKeys.has(key)) {
          container.insertAdjacentHTML('beforeend', html)
          appended++
        }
      }
    }
    if (appended) document.body.appendChild(container)
    // 최상단에서 캡처하면 일부 몰에서 문서 꼬리(lazy 콘텐츠)가 잘려 보인다 —
    // 사용자가 알아차리지 못할 정도로 살짝 내린 상태에서 캡처한다
    try { window.scrollBy(0, Math.max(100, Math.round(window.innerHeight * 0.15))) } catch (e) {}
    await sleep(150)
    stampAll()
    // 채널 표식 — 앱이 확장 캡처(지원 채널)임을 구분하는 데 사용 (예: 네이버 장바구니)
    try { (document.head || document.documentElement).insertAdjacentHTML('afterbegin', '<meta name="arge-channel" content="extension">') } catch (e) {}
    // 축소 상태에서 저장 (사용자 요구: 축소 후 1000ms — 축소 상태로 mhtml 저장)
    capturedHtml = de.outerHTML
  } catch (e) {}
  // 사용자 화면을 즉시 원래 배율로 복원 — 직후 복원이므로 축소 과정은 보이지 않는다
  try { if (zoomTag) zoomTag.remove() } catch (e) {}
  try { document.documentElement.style.zoom = '' } catch (e) {}
  let html = capturedHtml || document.documentElement.outerHTML
  // 캡처 본문에서 축소 흔적(줌 스타일 태그) 제거 — 뷰어는 원래 크기로 표시
  html = html.replace(/<style[^>]*data-arge-zoom[^>]*>[\s\S]*?<\/style>/i, '')
  return {
    html,
    href: location.href,
    title: document.title
  }
}

async function postHtml(text, filename, sourceUrl) {
  for (const port of PORTS) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/html`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/html',
          'X-Filename': encodeURIComponent(filename),
          'X-Source-Url': encodeURIComponent(sourceUrl)
        },
        body: text
      })
      const data = await res.json()
      if (data.ok) return true
    } catch (e) {}
  }
  return false
}

async function sendCurrentTab(tab) {
  const badge = (text, color) => {
    chrome.action.setBadgeText({ text, tabId: tab.id })
    chrome.action.setBadgeBackgroundColor({ color, tabId: tab.id })
    setTimeout(() => chrome.action.setBadgeText({ text: '', tabId: tab.id }), 3000)
  }
  try {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: materializeAdoptedStyles })
    } catch (e) {}
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: syncCheckStates })
    } catch (e) {
      try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: syncCheckStates }) } catch (e2) {}
    }
    // 1순위: 살아있는 DOM outerHTML — 행 누락 없음, checked 속성 동기화 포함
    try {
      const [live] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: captureLiveHtml })
      const r = live && live.result
      if (r && r.html && r.html.length > 100) {
        const t = (r.title || tab.title || 'capture').replace(/\.mhtml?$/i, '')
        const ok = await postHtml(r.html, `${t}.html`, r.href || tab.url || '')
        if (ok) {
          badge('전송', '#16a34a')
          return
        }
      }
    } catch (e) {}
    // 폴백: saveAsMHTML (executeScript 불가 페이지 등)
    const blob = await chrome.pageCapture.saveAsMHTML({ tabId: tab.id })
    if (!blob || blob.size === 0) throw new Error('빈 페이지')
    const title = (tab.title || 'capture').replace(/\.mhtml?$/i, '')
    const ok = await postMhtml(blob, `${title}.mhtml`)
    if (ok) {
      badge('전송', '#16a34a')
    } else {
      throw new Error('앱이 실행 중이 아님')
    }
  } catch (e) {
    badge('실패', '#dc2626')
  }
}

chrome.action.onClicked.addListener(tab => {
  if (!tab || !tab.id) return
  if (!/^https?:/.test(tab.url || '')) return
  sendCurrentTab(tab)
})

if (ext && ext.runtime && ext.runtime.onStartup) ext.runtime.onStartup.addListener(startupHeal)
if (ext && ext.runtime && ext.runtime.onInstalled) ext.runtime.onInstalled.addListener(startupHeal)
if (ext && ext.bookmarks) {
  for (const evName of ['onMoved', 'onChildrenReordered', 'onCreated']) {
    const ev = ext.bookmarks[evName]
    if (ev && ev.addListener) ev.addListener(scheduleHeal)
  }
}
