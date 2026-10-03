// MHTML 기초자료 수집 popup — 화면 분석은 참고값 제공만 하고 사용자 입력을 우선한다.
const PORTS = [57340, 57341, 57342, 57343, 57344, 57345]

const msg = m => { document.getElementById('msg').textContent = m }
const setSrv = t => { document.getElementById('srv').textContent = t }

async function findServer() {
  for (const p of PORTS) {
    try {
      const r = await fetch(`http://127.0.0.1:${p}/ping`, { signal: AbortSignal.timeout(1200) })
      if (r.ok) return p
    } catch {}
  }
  return null
}

async function detect(tabId) {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    func: detectPageState
  })
  return res && res.result
}

function fillSuggestion(st) {
  if (!st) return
  const mall = document.getElementById('mall')
  if (st.mallName && !mall.value) mall.value = st.mallName
  const kind = document.getElementById('kind')
  if ((st.kind === 'cart' || st.kind === 'order') && !kind.value) kind.value = st.kind
  const ship = document.getElementById('ship')
  if ((st.ship === 'free' || st.ship === 'paid') && !ship.value) ship.value = st.ship
  const cnt = document.getElementById('cnt')
  if (st.itemCount > 0 && !cnt.value) cnt.value = String(st.itemCount)
}

function validate() {
  const kind = document.getElementById('kind').value
  return !!kind
}

function refreshSend(port) {
  document.getElementById('send').disabled = !port || !validate()
  if (port && !validate()) msg('화면 종류를 선택하세요')
}

let currentTabId = null
let serverPort = null

async function init() {
  const port = await findServer()
  serverPort = port
  setSrv(port ? `관리자 앱 연결됨 (포트 ${port})` : '관리자 앱 미실행 — 쇼핑몰 규칙 관리자를 먼저 실행하세요')

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab && tab.id && !/^chrome|^edge|^about/i.test(tab.url || '')) {
    currentTabId = tab.id
    try {
      fillSuggestion(await detect(tab.id))
    } catch (e) {
      msg('자동 감지 실패 — 값을 직접 입력하세요')
    }
  }
  refreshSend(serverPort)
}

for (const id of ['mall', 'kind', 'ship', 'cnt']) {
  document.getElementById(id).addEventListener('change', () => refreshSend(serverPort))
  document.getElementById(id).addEventListener('input', () => refreshSend(serverPort))
}
document.getElementById('mallClear').addEventListener('click', () => {
  document.getElementById('mall').value = ''
})

document.getElementById('send').addEventListener('click', async () => {
  if (!currentTabId || !serverPort) return
  const send = document.getElementById('send')
  send.disabled = true
  msg('MHTML 생성 중…')
  try {
    const dataUrl = await chrome.pageCapture.captureMHTML({ tabId: currentTabId })
    const b64 = String(dataUrl).split(',').pop()
    const body = {
      kind: document.getElementById('kind').value,
      ship: document.getElementById('ship').value || 'unknown',
      meta: {
        mallName: document.getElementById('mall').value.trim(),
        itemCount: Number(document.getElementById('cnt').value) || 0,
        source: 'manual-entry'
      },
      mhtml: b64
    }
    const r = await fetch(`http://127.0.0.1:${serverPort}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    const j = await r.json()
    msg('✓ 전송 완료 — 관리자 앱에 반영됨: ' + j.filename)
  } catch (e) {
    msg('전송 실패: ' + String(e.message || e).slice(0, 120))
    send.disabled = false
  }
})

init()
