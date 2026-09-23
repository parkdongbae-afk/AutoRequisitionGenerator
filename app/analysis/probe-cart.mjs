// ① 네이버 장바구니(shopping.naver.com/cart) DOM 구조 분석 — 규칙 작성용
// ② root html의 cid: 참조 개수 — 뷰어 렌더링 확인용
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseMhtml, decodeHtml } from '../src/main/lib/mhtml.js'
import * as cheerio from 'cheerio'

const here = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(here, '..', '..', 'shoping_cart', '장바구니.mhtml')
const parsed = parseMhtml(fs.readFileSync(file))
const html = decodeHtml(parsed.rootHtml)
const $ = cheerio.load(html)
const out = {}

// cid: 참조 현황
out.cidRefs = (html.match(/cid:[^"'\s>]+/g) || []).length
out.partsWithCid = parsed.parts.filter(p => p.cid).length
out.partsWithLoc = parsed.parts.filter(p => p.contentLocation).length
// text/css 파트 목록
out.cssParts = parsed.parts.filter(p => p.contentType === 'text/css').slice(0, 5).map(p => ({ cid: p.cid, loc: (p.contentLocation || '').slice(0, 70) }))

// 가격 텍스트를 가진 요소의 클래스 히스토그램
const classCount = {}
$('*').each((_, el) => {
  const t = $(el)
  const txt = (t.text() || '').trim()
  if (/^\d{1,3}(,\d{3})*원?$/.test(txt) && txt.length <= 12) {
    const cls = (el.attribs && el.attribs.class) || '(none)'
    classCount[cls] = (classCount[cls] || []) || []
    if (classCount[cls].length < 3) classCount[cls].push(txt)
  }
})
out.priceClassHistogram = Object.fromEntries(
  Object.entries(classCount).filter(([, v]) => v.length >= 1).map(([k, v]) => [k.slice(0, 100), v])
    .sort((a, b) => b[1].length - a[1].length).slice(0, 25)
)

// 상품 링크(anchor) 구조
const anchors = []
$('a[href]').each((_, el) => {
  const href = el.attribs.href || ''
  if (/\/(p|v)\/|product|smartstore|brand.naver/.test(href)) {
    const t = $(el)
    anchors.push({ href: href.slice(0, 80), text: t.text().replace(/\s+/g, ' ').trim().slice(0, 50), cls: ((el.attribs.class) || '').slice(0, 90) })
  }
})
out.productAnchors = anchors.slice(0, 15)
out.productAnchorCount = anchors.length

// 수량/옵션 단서
const qtyHits = []
$('*').each((_, el) => {
  const txt = ($(el).text() || '').trim()
  if (/^\d+개$/.test(txt) && $(el).children().length === 0) {
    qtyHits.push({ cls: ((el.attribs && el.attribs.class) || '(none)').slice(0, 90), txt })
  }
})
out.qtyLeafClasses = qtyHits.slice(0, 15)

// 배송비 단서
const shipHits = []
$('*').each((_, el) => {
  const txt = ($(el).text() || '').replace(/\s+/g, ' ').trim()
  if (/배송비|무료배송|배송비무료/.test(txt) && txt.length < 60 && $(el).children().length <= 2) {
    shipHits.push({ cls: ((el.attribs && el.attribs.class) || '(none)').slice(0, 90), txt: txt.slice(0, 50) })
  }
})
out.shippingTexts = shipHits.slice(0, 15)

// deep dump: 상품명으로 보이는 텍스트가 속한 컨테이너의 클래스 경로
function classPath(el) {
  const parts = []
  let n = el
  for (let i = 0; i < 6 && n && n.tagName !== 'body' && n.tagName !== 'html'; i++) {
    parts.push(n.tagName + (n.attribs && n.attribs.class ? '.' + n.attribs.class.split(/\s+/).slice(0, 3).join('.') : ''))
    n = n.parent
  }
  return parts.join(' < ')
}
const dump = []
for (const a of anchors.slice(0, 4)) {
  // 해당 anchor 요소를 다시 찾기
}
$('a[href]').each((_, el) => {
  const href = el.attribs.href || ''
  if (/brand.naver|\/p\//.test(href)) {
    dump.push(classPath(el))
  }
})
out.classPaths = dump.slice(0, 10)

fs.writeFileSync(path.join(here, 'probe-cart.json'), JSON.stringify(out, null, 2), 'utf-8')
console.log('written')
