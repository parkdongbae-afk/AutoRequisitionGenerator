// 롯데마트 2차: ① CSS 파트 정체(Content-Location vs Content-ID) ② 상품 행 DOM ③ 정답 xls
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { parseMhtml, decodeHtml } from '../src/main/lib/mhtml.js'
import * as cheerio from 'cheerio'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const here = path.dirname(fileURLToPath(import.meta.url))
const dir = path.join(here, '..', '..', 'test_OK', '롯데마트')
const buf = fs.readFileSync(path.join(dir, '장바구니ㅣ롯데마트 제타 온라인 신선 장보기 몰.mhtml'))
const parsed = parseMhtml(buf)
const html = decodeHtml(parsed.rootHtml)
const $ = cheerio.load(html)
const out = {}

// ① CSS 파트 정체
out.cssParts = parsed.parts.filter(p => p.contentType === 'text/css').map((p, i) => ({
  idx: parsed.parts.indexOf(p),
  cid: p.cid || null,
  hasContentLocation: !!p.contentLocation,
  contentLocation: (p.contentLocation || '').slice(0, 80),
  size: p.data.length
}))

// ② 가격 요소 주변 구조 덤프
function chain(el, depth) {
  const parts = []
  let n = el
  for (let i = 0; i < depth && n && n.tagName && !/^html$/i.test(n.tagName); i++) {
    const cls = (n.attribs && n.attribs.class) || ''
    parts.push(n.tagName + (cls ? '.' + cls.split(/\s+/).slice(0, 3).join('.') : ''))
    n = n.parent
  }
  return parts.join(' < ')
}
out.priceChains = []
$('*').each((_, el) => {
  const t = $(el)
  const txt = (t.text() || '').trim()
  if ((/^\d{1,3}(,\d{3})*원$/.test(txt) || txt === '무료배송') && t.children().length === 0 && out.priceChains.length < 10) {
    out.priceChains.push({ txt, chain: chain(el, 8) })
  }
})

// 상품명 후보: 롯데 구조 단서 탐색 (salt- 컴포넌트, a[href*=product], input 수량)
out.anchors = []
$('a[href]').each((_, el) => {
  const href = el.attribs.href || ''
  if (/product|goods|item/i.test(href) && out.anchors.length < 8) {
    out.anchors.push({ href: href.slice(0, 70), text: $(el).text().replace(/\s+/g, ' ').trim().slice(0, 50), chain: chain(el, 5).slice(0, 120) })
  }
})
out.qtyInputs = []
$('input').each((_, el) => {
  const t = (el.attribs.type || '').toLowerCase()
  if ((t === 'number' || t === 'text') && /qty|quantity|count|amount|수량/i.test((el.attribs.class || '') + (el.attribs.name || '') + (el.attribs.title || '') + (el.attribs.ariaLabel || ''))) {
    out.qtyInputs.push({ type: t, cls: (el.attribs.class || '').slice(0, 60), value: el.attribs.value, title: el.attribs.title })
  }
})
out.qtyTexts = []
$('*').each((_, el) => {
  if (el.children && el.children.length) return
  const txt = ($(el).text() || '').trim()
  if (/^\d+개$|^\d+\s*$/i.test(txt) && out.qtyTexts.length < 8) {
    out.qtyTexts.push({ txt, cls: ((el.attribs || {}).class || '').slice(0, 60), tag: el.tagName, chain: chain(el, 4).slice(0, 100) })
  }
})

// ③ 정답 xls
try {
  const wb = XLSX.readFile(path.join(dir, '품목내역(통합).xls'))
  const ws = wb.Sheets[wb.SheetNames[0]]
  out.answer = XLSX.utils.sheet_to_json(ws, { header: 1 }).slice(0, 12).map(r => (r || []).slice(0, 6).map(v => (v == null ? '' : String(v).slice(0, 30))))
} catch (e) { out.answerError = String(e.message) }

fs.writeFileSync(path.join(here, 'probe-lotte2.json'), JSON.stringify(out, null, 2), 'utf-8')
console.log('written')
