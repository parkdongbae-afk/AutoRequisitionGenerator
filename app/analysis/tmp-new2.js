const fs = require('fs')
const path = require('path')
const { parseMhtml, decodeHtml } = require('../src/main/lib/mhtml')
const { extractItems } = require('../src/main/lib/extract')
const cheerio = require('cheerio')

const base = 'C:/Users/Park/Desktop/Automatic_generation_of_approval_requests_html (1)/Automatic_generation_of_approval_requests_html/shoping_cart/new2'
const out = []

// 1) 네이버 주문서 — 추가상품 구조
const nf = fs.readdirSync(base).find(f => f.includes('네이버') && /\.mhtml$/i.test(f))
const nParsed = parseMhtml(fs.readFileSync(path.join(base, nf)))
const nHtml = decodeHtml(nParsed.rootHtml)
const nRule = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'lib', 'rules', 'naver.json'), 'utf8'))
const nRes = extractItems(nHtml, nRule)
out.push('===== 네이버 주문서 현재 추출 =====')
out.push(`shippingFee=${nRes.shippingFee} items=${nRes.items.length}`)
for (const it of nRes.items) out.push(`  - ${String(it.name).slice(0, 40)} qty=${it.qty} price=${it.unitPrice}${it.isShipping ? ' [배송비]' : ''}`)
const $n = cheerio.load(nHtml)
const rows = $n('[class*=ProductItem_article]')
out.push(`ProductItem_article 행 수=${rows.length}`)
rows.each((i, el) => {
  const cls = ($n(el).attr('class') || '').slice(0, 80)
  const t = $n(el).text().replace(/\s+/g, ' ').trim().slice(0, 300)
  out.push(`--- 행 ${i} (${cls}) ---`)
  out.push(t)
  // 내부 하위 아이템 구조 탐색
  const inner = $n(el).find('[class*=ProductItem], [class*=productItem], li, [class*=add]')
  const innerCls = new Set()
  inner.each((_, x) => { const c = $n(x).attr('class') || ''; if (c) innerCls.add(c.split(' ')[0]) })
  if (innerCls.size) out.push('  내부 클래스: ' + [...innerCls].slice(0, 12).join(', '))
})

// 2) 아이스크림몰 주문서 — 수량 2개 이상
const af = fs.readdirSync(base).find(f => f.includes('아이스크림') && /\.mhtml$/i.test(f))
const aParsed = parseMhtml(fs.readFileSync(path.join(base, af)))
const aHtml = decodeHtml(aParsed.rootHtml)
const aRule = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'lib', 'rules', 'icecreammall.json'), 'utf8'))
const aRes = extractItems(aHtml, aRule)
out.push('\n===== 아이스크림몰 주문서 현재 추출 =====')
out.push(`shippingFee=${aRes.shippingFee} items=${aRes.items.length}`)
for (const it of aRes.items) out.push(`  - ${String(it.name).slice(0, 40)} qty=${it.qty} price=${it.unitPrice}${it.isShipping ? ' [배송비]' : ''}`)
const $a = cheerio.load(aHtml)
const aRows = $a('div.relative.flex.items-start.border-b:has(p.body3)')
out.push(`행 수=${aRows.length}`)
aRows.each((i, el) => {
  const t = $a(el).text().replace(/\s+/g, ' ').trim()
  out.push(`--- 행 ${i} ---`)
  out.push(t.slice(0, 400))
})

fs.writeFileSync('C:/Users/Park/AppData/Local/Temp/opencode/new2-analysis.txt', out.join('\n'), 'utf8')
console.log('done')
