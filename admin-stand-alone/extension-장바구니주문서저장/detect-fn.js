// 페이지 상태 판별 — 캡처 페이지에 주입되어 DOM에서 종류·배송비·상품 수·총액을 읽는다.
// chrome API가 없는 순수 함수이므로 확장 popup에서 chrome.scripting.executeScript로 실행한다.
function detectPageState() {
  const url = location.href
  const low = url.toLowerCase()
  const text = (document.body && document.body.innerText || '').replace(/\s+/g, ' ')

  let kind = null
  if (/cart|basket|jangbaguni|장바구니/i.test(low) || /장바구니/.test(text.slice(0, 3000))) kind = 'cart'
  if (/order|pay|checkout|주문|결제/i.test(low)) kind = 'order'
  if (!kind) {
    const cartHits = (text.match(/장바구니/g) || []).length
    const orderHits = (text.match(/주문서|주문하기|결제하기|구매하기/g) || []).length
    if (cartHits && !orderHits) kind = 'cart'
    else if (orderHits) kind = 'order'
  }

  let shippingFee = null
  let shipFree = false
  const feeRe = /(?:배송비|배송료)\s*[:]?\s*(무료|[\d,]+)\s*원?/g
  let m
  while ((m = feeRe.exec(text))) {
    if (m[1] === '무료') { shipFree = true; continue }
    const n = Number(m[1].replace(/,/g, ''))
    if (n > 0 && (shippingFee == null || n > shippingFee)) shippingFee = n
  }
  if (/무료배송/.test(text)) shipFree = true
  let ship = shippingFee > 0 ? 'paid' : shipFree ? 'free' : 'unknown'

  const rowSel = 'li[class*="cart"], li[class*="item"], tr[class*="item"], div[class*="product"], li[class*="list-item"]'
  let itemCount = document.querySelectorAll(rowSel).length
  if (!itemCount) itemCount = document.querySelectorAll('input[type=checkbox]').length

  let pageTotal = null
  const totalRe = /(?:총\s*(?:결제|주문|상품)?\s*금액|결제\s*예정\s*금액|총\s*주문)\s*[:]?\s*([\d,]+)\s*원/g
  while ((m = totalRe.exec(text))) {
    const n = Number(m[1].replace(/,/g, ''))
    if (n > 0 && (pageTotal == null || n > pageTotal)) pageTotal = n
  }

  return { kind, ship, shippingFee, itemCount, pageTotal, url, mallName: mallName() }
}

function mallName() {
  const og = document.querySelector('meta[property="og:site_name"]')
  if (og && og.content && og.content.trim()) return og.content.trim().slice(0, 40)
  const app = document.querySelector('meta[name="application-name"]')
  if (app && app.content && app.content.trim()) return app.content.trim().slice(0, 40)
  try {
    const t = (document.title || '').split(/[-|_–]/)[0].trim()
    if (t) return t.slice(0, 40)
  } catch {}
  return location.hostname.replace(/^www\./, '').split('.')[0]
}
