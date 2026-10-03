// MHTML 캡처는 service worker에서 수행한다 — popup 문맥에는 pageCapture API가
// 노출되지 않는 Chromium 버전이 있다(품의캡처 확장과 동일한 검증된 패턴).
// saveAsMHTML은 promise 기반 Blob을 반환한다(captureMHTML 대체).
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'capture-mhtml' || !msg.tabId) return false
  ;(async () => {
    const blob = await chrome.pageCapture.saveAsMHTML({ tabId: msg.tabId })
    const buf = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    const chunk = 0x8000
    for (let i = 0; i < buf.length; i += chunk) {
      binary += String.fromCharCode.apply(null, buf.subarray(i, i + chunk))
    }
    sendResponse({ ok: true, b64: btoa(binary) })
  })().catch(e => sendResponse({ ok: false, error: String(e && e.message || e) }))
  return true
})
