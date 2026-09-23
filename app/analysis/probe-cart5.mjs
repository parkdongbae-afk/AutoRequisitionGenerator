// 네이버 장바구니: 2번째 product 카드 전체 덤프 — 상품명 요소의 실제 위치 확인
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

// svg 노이즈 제거 후 info_area 덤프
function clean(x) { return $(x).html().replace(/<svg[\s\S]*?<\/svg>/g, '[SVG]').replace(/\s+/g, ' ') }
const prods = $('div[class^=product--]')
out.infoArea2 = clean(prods.eq(1).find('[class^=info_area--]').first()).slice(0, 2500)
out.titleFull2 = prods.eq(1).find('[class^=title--]').first().text().replace(/\s+/g, ' ').trim()
out.titleFull3 = prods.eq(2).find('[class^=title--]').first().text().replace(/\s+/g, ' ').trim()

// title-- 내부의 직계 자식 텍스트 분해 (1번 상품)
const parts = []
prods.eq(0).find('[class^=title--]').first().contents().each((_, el) => {
  if (el.type === 'text') parts.push({ kind: 'text', val: ($(el).text() || '').trim().slice(0, 40) })
  else parts.push({ kind: 'el', tag: el.tagName, cls: ((el.attribs || {}).class || '').slice(0, 50), val: $(el).text().replace(/\s+/g, ' ').trim().slice(0, 60) })
})
out.titleChildren1 = parts.filter(p => p.val)

// 각 product의 title-- 모든 요소(다중 매치 확인)
out.allTitlePerProduct = []
prods.each((i, el) => {
  const ts = []
  $(el).find('[class^=title--]').each((_, t) => ts.push({ cls: ((t.attribs || {}).class || '').slice(0, 40), txt: $(t).text().replace(/\s+/g, ' ').trim().slice(0, 50) }))
  out.allTitlePerProduct.push(ts)
})

fs.writeFileSync(path.join(here, 'probe-cart5.json'), JSON.stringify(out, null, 2), 'utf-8')
console.log('written')
