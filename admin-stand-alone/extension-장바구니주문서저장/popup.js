const PORTS = [57340, 57341, 57342, 57343, 57344, 57345]
const SHIP_LABEL = { free: '무료', paid: '유료', unknown: '미확인' }
const KIND_LABEL = { cart: '장바구니', order: '주문서' }

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

function render(st) {
  document.getElementById('mall').textContent = st.mallName || '-'
  const kindEl = document.getElementById('kind')
  const shipEl = document.getElementById('ship')
  if (!st.kind) { kindEl.textContent = '판별 실패'; kindEl.className = 'val err' }
  else { kindEl.textContent = KIND_LABEL[st.kind] || st.kind; kindEl.className = 'val ok' }
  shipEl.textContent = SHIP_LABEL[st.ship] + (st.shippingFee > 0 ? ` (${st.shippingFee.toLocaleString('ko-KR')}원)` : '')
  shipEl.className = 'val ' + (st.ship === 'paid' ? 'ok' : st.ship === 'free' ? 'ok' : 'warn')
  document.getElementById('cnt').textContent = st.itemCount ?? '-'
  document.getElementById('tot').textContent = st.pageTotal != null ? st.pageTotal.toLocaleString('ko-KR') + '원' : '-'
  const send = document.getElementById('send')
  send.disabled = !st.kind || st.kind !== 'cart' && st.kind !== 'order'
  if (send.disabled) msg('장바구니·주문서 화면이 아닙니다')
}

let current = null
let serverPort = null

async function init() {
  const port = await findServer()
  serverPort = port
  setSrv(port ? `관리자 앱 연결됨 (포트 ${port})` : '관리자 앱 미실행 — 쇼핑몰 규칙 관리자를 먼저 실행하세요')
  document.getElementById('send').disabled = !port

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab || !tab.id || /^chrome|^edge|^about/i.test(tab.url || '')) {
    render({ kind: null, ship: 'unknown' })
    return
  }
  try {
    current = await detect(tab.id)
    current.tabId = tab.id
    render(current)
  } catch (e) {
    render({ kind: null, ship: 'unknown' })
    msg('페이지 분석 실패: ' + String(e.message || e).slice(0, 80))
  }
}

document.getElementById('send').addEventListener('click', async () => {
  if (!current || !serverPort) return
  const send = document.getElementById('send')
  send.disabled = true
  msg('캡처 생성 중…')
  try {
    const dataUrl = await chrome.pageCapture.captureMHTML({ tabId: current.tabId })
    const b64 = String(dataUrl).split(',').pop()
    const body = {
      kind: current.kind,
      ship: current.ship,
      meta: { itemCount: current.itemCount, shippingFee: current.shippingFee, pageTotal: current.pageTotal, url: current.url, mallName: current.mallName },
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
