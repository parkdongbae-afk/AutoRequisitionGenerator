// 롯데마트 4차: ① inbox 실시간 캡처의 CSS 링크 로컬화 검증(확장 saveAsMHTML 구조 차이) ② 카드 내부(상품명) ③ 요약 dl 전체
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseMhtml, decodeHtml } from '../src/main/lib/mhtml.js'
import * as cheerio from 'cheerio'

const here = path.dirname(fileURLToPath(import.meta.url))
const out = {}

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

// ① inbox 롯데 실시간 캡처 검증
const inbox = path.join(process.env.APPDATA, '자동 품의 요구 생성기', 'inbox')
const lotteFiles = fs.readdirSync(inbox).filter(f => /롯데마트/.test(f) && /\.mhtml$/i.test(f)).sort()
out.inboxCaptures = []
for (const f of lotteFiles.slice(-3)) {
  try {
    const parsed = parseMhtml(fs.readFileSync(path.join(inbox, f)))
    const html = decodeHtml(parsed.rootHtml)
    const rw = rewriteUrls(html, parsed.parts)
    const $rw = cheerio.load(rw)
    const links = []
    $rw('link[rel~=stylesheet]').each((_, el) => links.push((el.attribs.href || '').slice(0, 60)))
    const cidOnly = parsed.parts.filter(p => !p.contentLocation && p.cid).length
    out.inboxCaptures.push({
      fileName: f.slice(10, 40),
      cssLinks: links,
      unresolvedCss: links.filter(h => !h.startsWith('app-mhtml://')).length,
      partsWithoutLocWithCid: cidOnly,
      unresolvedCidInHtml: (rw.match(/cid:[^"'\s>]+/g) || []).length
    })
  } catch (e) {
    out.inboxCaptures.push({ fileName: f, error: String(e.message) })
  }
}

// ② 카드 내부 (상품명 요소)
const testFile = path.join(here, '..', '..', 'test_OK', '롯데마트', '장바구니ㅣ롯데마트 제타 온라인 신선 장보기 몰.mhtml')
const parsed = parseMhtml(fs.readFileSync(testFile))
const html = decodeHtml(parsed.rootHtml)
const $ = cheerio.load(html)
const card = $('div[class*=product-card-container]').first()
out.cardHtmlHead = card.html().replace(/<svg[\s\S]*?<\/svg>/g, '[SVG]').replace(/\s+/g, ' ').slice(0, 1600)

// ③ 요약 dl 전체 (배송비 블록의 data-test)
const dls = []
$('dl').each((_, el) => {
  const t = $(el).text().replace(/\s+/g, ' ').trim()
  if (/배송비/.test(t) && dls.length < 2) dls.push($(el).html().replace(/\s+/g, ' ').slice(0, 1400))
})
out.summaryDlFull = dls

fs.writeFileSync(path.join(here, 'probe-lotte4.json'), JSON.stringify(out, null, 2), 'utf-8')
console.log('written')
