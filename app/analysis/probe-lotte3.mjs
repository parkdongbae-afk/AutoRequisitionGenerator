// 롯데마트 3차: ① rewriteUrls 재현해 css 링크 로컬화 검증 ② product-card 상세 ③ 결제요약 dl(배송비)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseMhtml, decodeHtml } from '../src/main/lib/mhtml.js'
import * as cheerio from 'cheerio'

const here = path.dirname(fileURLToPath(import.meta.url))
const dir = path.join(here, '..', '..', 'test_OK', '롯데마트')
const parsed = parseMhtml(fs.readFileSync(path.join(dir, '장바구니ㅣ롯데마트 제타 온라인 신선 장보기 몰.mhtml')))
const html = decodeHtml(parsed.rootHtml)
const $ = cheerio.load(html)
const out = {}

// ① app의 rewriteUrls 재현 (docstore.js와 동일 로직)
function rewriteUrls(src, parts) {
  let o = src
  for (let i = 0; i < parts.length; i++) {
    const loc = parts[i].contentLocation
    if (!loc || loc.length < 8) continue
    const target = `app-mhtml://DOCID/${i}`
    const entity = loc.replace(/&/g, '&amp;')
    if (entity !== loc) o = o.split(entity).join(target)
    o = o.split(loc).join(target)
  }
  return o
}
const rewritten = rewriteUrls(html, parsed.parts)
const $rw = cheerio.load(rewritten)
out.cssLinksAfterRewrite = []
$rw('link[rel~=stylesheet]').each((_, el) => {
  out.cssLinksAfterRewrite.push((el.attribs.href || '').slice(0, 70))
})
out.inlineStyleBlocks = $('style').length
out.unresolvedCidRefs = (rewritten.match(/cid:[^"'\s>]+/g) || []).slice(0, 5)

// ② product-card-container 상세
out.cardCount = $('div[class*=product-card-container]').length
const card = $('div[class*=product-card-container]').first()
out.firstCardText = card.text().replace(/\s+/g, ' ').trim().slice(0, 260)
function chainOf(el, depth) {
  const parts = []
  let n = el
  for (let i = 0; i < depth && n && n.tagName && !/^html$/i.test(n.tagName); i++) {
    const cls = (n.attribs && n.attribs.class) || ''
    parts.push(n.tagName + (cls ? '.' + cls.split(/\s+/).slice(0, 2).join('.') : ''))
    n = n.parent
  }
  return parts.join(' < ')
}
// 상품명 후보: 카드 내부의 긴 한국어 리프
out.cardNameLeaves = []
card.find('*').each((_, el) => {
  if (el.children && el.children.length) return
  const txt = ($(el).text() || '').trim()
  if (txt.length >= 6 && txt.length <= 60 && /[\uac00-\ud7a3]/.test(txt) && !/원$/.test(txt) && out.cardNameLeaves.length < 8) {
    out.cardNameLeaves.push({ txt, chain: chainOf(el, 5).slice(0, 110) })
  }
})

// ③ 결제요약 dl (배송비)
out.summaryDls = []
$('dl').each((_, el) => {
  const t = $(el).text().replace(/\s+/g, ' ').trim()
  if (/배송비|결제|예상/.test(t) && t.length < 120 && out.summaryDls.length < 3) {
    out.summaryDls.push({ text: t.slice(0, 100), html: $(el).html().replace(/\s+/g, ' ').slice(0, 500) })
  }
})

fs.writeFileSync(path.join(here, 'probe-lotte3.json'), JSON.stringify(out, null, 2), 'utf-8')
console.log('written')
