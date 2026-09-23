// 사용자 버그리포트 3건 재현 탐지: ① MHTML charset/깨짐 ② 네이버 장바구니 매칭
// 실행: node analysis/probe-user-report.mjs  (app/ 폴더에서)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseMhtml, decodeHtml } from '../src/main/lib/mhtml.js'
import * as cheerio from 'cheerio'

const here = path.dirname(fileURLToPath(import.meta.url))
const rulesDir = path.join(here, '..', 'src', 'main', 'lib', 'rules')
const rules = fs.readdirSync(rulesDir).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(rulesDir, f), 'utf-8')))

function matchRule(url) {
  for (const r of rules) for (const pat of r.match || []) if (url && url.includes(pat)) return r
  return null
}

const targets = []
const cartDir = path.join(here, '..', '..', 'shoping_cart')
for (const f of fs.readdirSync(cartDir)) {
  if (/\.(mhtml?|html?)$/i.test(f)) targets.push(path.join(cartDir, f))
}
const newDir = path.join(cartDir, 'new')
if (fs.existsSync(newDir)) for (const f of fs.readdirSync(newDir)) if (/\.(mhtml?|html?)$/i.test(f)) targets.push(path.join(newDir, f))

const out = []
for (const file of targets) {
  const rec = { fileName: path.basename(file) }
  try {
    const buf = fs.readFileSync(file)
    const parsed = parseMhtml(buf)
    const rootPart = parsed.parts.find(p => p.contentType === 'text/html')
    rec.rootRawContentType = rootPart ? rootPart.rawContentType : null
    rec.rootCharset = parsed.rootHtml.charset
    rec.contentLocation = parsed.rootHtml.location
    rec.partCount = parsed.parts.length
    rec.firstParts = parsed.parts.slice(0, 3).map(p => ({ ct: p.contentType, loc: (p.contentLocation || '').slice(0, 90), rawCt: (p.rawContentType || '').slice(0, 90) }))
    const html = decodeHtml(parsed.rootHtml)
    rec.htmlLen = html.length
    rec.replacementChars = (html.match(/\ufffd/g) || []).length
    rec.hangulChars = (html.match(/[\uac00-\ud7a3]/g) || []).length
    // UTF-8 바이트를 latin1/euc-kr로 잘못 읽었을 때 전형적인 패턴
    rec.mojibakePattern = (html.match(/[ÃÂ¢â€]/g) || []).length
    const rule = matchRule(parsed.rootHtml.location)
    rec.matchedRule = rule ? `${rule.id} (${rule.name})` : null
    if (rule) {
      const $ = cheerio.load(html)
      const rowCount = $(rule.rowSelector).length
      rec.rowCount = rowCount
      if (rowCount > 0) {
        const first = $(rule.rowSelector).first()
        const sample = {}
        for (const [k, spec] of Object.entries(rule.fields || {})) {
          if (!spec || !spec.sel) continue
          const els = first.find(spec.sel)
          sample[k] = els.length ? (els.first().text() || '').replace(/\s+/g, ' ').trim().slice(0, 60) : null
        }
        rec.fieldSamples = sample
      }
    }
    // 네이버 관련 파일이면 문서 내 단서 출력
    if (/장바구니|네이버/.test(rec.fileName)) {
      rec.htmlHead = html.slice(0, 400).replace(/\s+/g, ' ')
      const $ = cheerio.load(html)
      rec.naverClassHits = {}
      for (const probe of ['ProductItem_article', 'ProductDetail_name', 'ProductOption_amount', 'ProductOrder', 'cart', 'CartPage', 'OrderSheet']) {
        rec.naverClassHits[probe] = $(`[class*="${probe}"]`).length
      }
      // title과 canonical URL 단서
      const t = $('title').first().text().trim()
      rec.pageTitle = t.slice(0, 80)
      const canon = $('link[rel=canonical]').attr('href') || null
      rec.canonical = canon
      const og = $('meta[property="og:url"]').attr('content') || null
      rec.ogUrl = og
    }
  } catch (e) {
    rec.error = String(e && e.message || e)
  }
  out.push(rec)
}

const outFile = path.join(here, 'probe-user-report.json')
fs.writeFileSync(outFile, JSON.stringify(out, null, 2), 'utf-8')
console.log('written: ' + outFile)
