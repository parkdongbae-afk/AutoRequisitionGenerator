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

// saveAsMHTML은 체크박스의 checked 프로퍼티(사용자 클릭 상태)를 직렬화하지 않는다 —
// V체크한 장바구니 항목만 추출하려면 캡처 직전 프로퍼티를 data-arge-checked 속성으로
// 박제해 MHTML에 들어가게 한다 (앱 규칙 엔진의 checkedOnly가 이 값을 읽음)
function stampCheckStates() {
  try {
    document.querySelectorAll('input[type=checkbox]').forEach(el => {
      el.setAttribute('data-arge-checked', el.checked ? 'true' : 'false')
    })
  } catch (e) {}
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
      await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: stampCheckStates })
    } catch (e) {
      try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: stampCheckStates }) } catch (e2) {}
    }
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
