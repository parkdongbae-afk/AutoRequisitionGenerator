const PORTS = [57330, 57331, 57332, 57333, 57334, 57335]
const ext = globalThis.chrome ?? globalThis.whale ?? globalThis.browser

async function fetchBookmarkInfo() {
  for (const port of PORTS) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/bookmark-info`)
      if (res.ok) {
        const data = await res.json()
        // app 마커 검증 — 타 프로세스가 포트를 점유해도 가짜 응답을 수신처로 쓰지 않는다
        if (data && data.app === 'auto-requisition-generator' && data.url && data.name) return data
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
      if (data.ok && data.app === 'auto-requisition-generator') return true
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
    // 채널 표식 — captureLiveHtml보다 먼저 실행되므로 여기에 심으면 executeScript 전체가
    // 실패해 saveAsMHTML 폴백으로 저장될 때도 문서에 남는다
    try {
      document.querySelectorAll('meta[name="arge-channel"],meta[name="arge-ext-version"]').forEach(e => e.remove())
      ;(document.head || document.documentElement).insertAdjacentHTML('afterbegin', '<meta name="arge-channel" content="extension"><meta name="arge-ext-version" content="1.6.3">')
    } catch (e) {}
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

// 네이버 장바구니(창 가상화+노드 재활용)는 캡처 전 화면을 순간 25% 축소하면 뷰포트 안에
// 모든 행이 렌더된다 — 축소로 해결한다. 과거 병행하던 "자동 스크롤 + 체크박스 앵커 행 수집·
// 스티치(data-arge-rows)"는 사용자 요구(2026-09-25)로 전 몰에서 제거했다 — 장바구니 화면이
// 스스로 아래로 내려가는 것이 사용자에게 보였고, 축소만으로 행 누락이 없어 불필요해졌다.
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
  // 채널 표식은 가장 먼저 심는다 — 저장 중 예외로 폴백·saveAsMHTML 경로로 저장돼도
  // 앱이 확장 캡처임을 알게 한다(2026-09-25 네이버 장바구니 오탐 거부 사고 대응).
  // 버전 번호는 manifest.json과 함께 갱신한다.
  const channelMeta = () => {
    try {
      document.querySelectorAll('meta[name="arge-channel"],meta[name="arge-ext-version"]').forEach(e => e.remove())
      ;(document.head || document.documentElement).insertAdjacentHTML('afterbegin', '<meta name="arge-channel" content="extension"><meta name="arge-ext-version" content="1.6.3">')
    } catch (e) {}
  }
  channelMeta()
  // 25% 축소는 네이버 장바구니(shopping.naver.com/cart) 전용 — 다른 몰·주문서는 원래 배율 유지.
  // !important 스타일 태그로 적용하고 1000ms 대기(가상화 목록 전체 렌더 대기) 후
  // 축소 상태 그대로 outerHTML을 찍은 뒤 사용자의 원래 화면 비율로 즉시 되돌린다.
  const naverCart = (() => {
    try { return /(^|\.)shopping\.naver\.com$/i.test(location.hostname) && /^\/cart\b/.test(location.pathname) } catch (e) { return false }
  })()
  let zoomTag = null
  if (naverCart) {
    try {
      zoomTag = document.createElement('style')
      zoomTag.setAttribute('data-arge-zoom', '1')
      zoomTag.textContent = 'html{zoom:0.25!important}'
      ;(document.head || document.documentElement).appendChild(zoomTag)
    } catch (e) {}
    await sleep(1000)
  }
  let capturedHtml = null
  try {
    // lazy 이미지가 미로딩 상태면 뷰어에서 문서 하단이 잘려 보인다 — src를 실제 값으로 교체
    try {
      for (const im of document.images) {
        const ds = im.getAttribute('data-src') || im.getAttribute('data-original') || im.getAttribute('data-lazy')
        if (ds && (im.naturalWidth === 0 || !im.src || im.src.indexOf('data:') === 0 || /blank|dummy|placeholder|loading|spinner|transparent|no_img/i.test(im.src))) im.src = ds
      }
    } catch (e) {}
    stampAll()
    // 축소 리렌더로 head가 교체됐을 수 있으므로 저장 직전에 표식을 다시 심는다
    channelMeta()
    // 축소 상태에서 저장 (사용자 요구: 축소 후 1000ms — 축소 상태로 mhtml 저장)
    capturedHtml = document.documentElement.outerHTML
  } catch (e) {
    try { stampAll() } catch (e2) {}
    channelMeta()
  }
  // 사용자 화면을 즉시 원래 배율로 복원
  try { if (zoomTag) zoomTag.remove() } catch (e) {}
  try { document.documentElement.style.zoom = '' } catch (e) {}
  // 캡처 본문에는 축소 스타일 태그를 그대로 남긴다(사용자 실측 2026-09-25) — 네이버 장바구니는
  // 태그를 제거하면 뷰어에서 레이아웃이 무너지고, 축소 상태 그대로 저장하면 뷰어(휠 줌)에서
  // 정확히 보인다. 줌 태그는 네이버 장바구니 캡처에만 존재하므로 다른 몰에 영향 없다.
  const html = capturedHtml || document.documentElement.outerHTML
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
      // app 마커 검증 — 가짜 수신처(포트 점유 프로세스)에 보내고 성공으로 끝내지 않는다
      if (data.ok && data.app === 'auto-requisition-generator') return true
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
    const title = (tab.title || 'capture').replace(/\.mhtml?$/i, '')
    // 네이버 장바구니는 사용자가 검증한 플로우(브라우저 확대/축소 25% → Chrome MHTML 저장)를 그대로
    // 따른다(2026-09-25) — setZoom으로 가상화 목록 전체를 렌더시킨 뒤 saveAsMHTML로 저장하면
    // 뷰어에서도 행 누락·레이아웃 붕괴 없이 표시된다. 쿠팡은 CSS를 Referer 검사 없이 포함하는
    // Chrome MHTML이 뷰어 렌더링에 검증됐다(사용자 지정 2026-09-25).
    const url = tab.url || ''
    const isNaverCart = (() => { try { return /(^|\.)shopping\.naver\.com$/i.test(new URL(url).hostname) && /^\/cart\b/.test(new URL(url).pathname) } catch (e) { return false } })()
    const isCoupang = (() => { try { return /(^|\.)coupang\.com$/i.test(new URL(url).hostname) } catch (e) { return false } })()
    if (isNaverCart || isCoupang) {
      let prevZoom = null
      try {
        if (isNaverCart) {
          prevZoom = await chrome.tabs.getZoom(tab.id)
          await chrome.tabs.setZoom(tab.id, 0.25)
          await new Promise(r => setTimeout(r, 1000))
        }
        // saveAsMHTML이 간헐적으로 실패(빈 blob/예외)한다 — 2026-09-25 실측으로 재시도 추가
        let blob = null
        for (let attempt = 0; attempt < 3; attempt++) {
          try { blob = await chrome.pageCapture.saveAsMHTML({ tabId: tab.id }) } catch (e) {}
          if (blob && blob.size > 0) break
          await new Promise(r => setTimeout(r, 500))
        }
        if (blob && blob.size > 0) {
          const ok = await postMhtml(blob, `${title}.mhtml`)
          if (ok) {
            badge('전송', '#16a34a')
            return
          }
        }
      } catch (e) {} finally {
        if (prevZoom != null) { try { await chrome.tabs.setZoom(tab.id, prevZoom) } catch (e) {} }
      }
      // saveAsMHTML 실패 시 아래 기존 라이브 캡처 경로로 계속 진행한다
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
