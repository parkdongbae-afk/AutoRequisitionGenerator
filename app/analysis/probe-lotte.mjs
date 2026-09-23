// 롯데마트 샘플 분석: ① 문서 구조(규칙용) ② CSS/리소스 참조 매칭률(스타일 누락 진단) ③ 정답 xls
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseMhtml, decodeHtml } from '../src/main/lib/mhtml.js'
import * as cheerio from 'cheerio'
import * as XLSX from 'xlsx'

const here = path.dirname(fileURLToPath(import.meta.url))
const dir = path.join(here, '..', '..', 'test_OK', '롯데마트')
const mhtmlFile = path.join(dir, '장바구니ㅣ롯데마트 제타 온라인 신선 장보기 몰.mhtml')
const out = {}

const buf = fs.readFileSync(mhtmlFile)
const parsed = parseMhtml(buf)
const html = decodeHtml(parsed.rootHtml)
const $ = cheerio.load(html)

// ── ① 문서 구조
out.doc = {
  location: parsed.rootHtml.location,
  charset: parsed.rootHtml.charset,
  parts: parsed.parts.length,
  hangul: (html.match(/[\uac00-\ud7a3]/g) || []).length,
  title: $('title').first().text().trim().slice(0, 60)
}

// ── ② CSS 참조 매칭 진단 (rewriteUrls는 content-location 문자열 exact 매칭)
const parts = parsed.parts
const locs = new Set(parts.map(p => p.contentLocation).filter(Boolean))
const entityLocs = new Set([...locs].map(l => l.replace(/&/g, '&amp;')))
const matchRef = (ref) => {
  if (!ref) return 'empty'
  if (/^(data:|about:|#)/i.test(ref)) return 'inline'
  if (ref.startsWith('cid:')) {
    const c = ref.slice(4)
    return parts.some(p => p.cid && ref.includes(p.cid)) ? 'cid-ok' : 'cid-miss'
  }
  if (locs.has(ref) || entityLocs.has(ref)) return 'matched'
  try {
    const dec = decodeURIComponent(ref)
    if (locs.has(dec) || entityLocs.has(dec)) return 'matched-dec'
  } catch {}
  if (/^https?:|^\/\//i.test(ref)) return 'unmatched-abs'
  if (/^\//.test(ref)) return 'unmatched-rel-root'
  return 'unmatched-rel'
}

const refStats = {}
const addRef = (kind, ref, sample) => {
  const m = matchRef(ref)
  const key = kind + ':' + m
  if (!refStats[key]) refStats[key] = { count: 0, samples: [] }
  refStats[key].count++
  if (refStats[key].samples.length < 4 && ref) refStats[key].samples.push(ref.slice(0, 110))
}
$('link[rel~=stylesheet]').each((_, el) => addRef('css-link', el.attribs.href, 1))
$('link[rel=stylesheet]').each((_, el) => addRef('css-link2', el.attribs.href, 1))
$('img').each((_, el) => addRef('img', el.attribs.src, 1))
$('script[src]').each((_, el) => addRef('script', el.attribs.src, 1))
out.refStats = refStats

// CSS 파트 내부 url()/@import 매칭
let cssUrlTotal = 0, cssUrlMiss = 0
const cssMissSamples = []
for (const p of parts) {
  if (p.contentType !== 'text/css') continue
  const css = p.data.toString('utf-8')
  const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi
  let m
  while ((m = re.exec(css))) {
    const ref = m[2]
    if (/^(data:|about:|#)/i.test(ref)) continue
    cssUrlTotal++
    let abs = ref
    try { abs = new URL(ref, p.contentLocation || 'https://x/').href } catch {}
    if (!locs.has(abs) && !entityLocs.has(abs)) {
      cssUrlMiss++
      if (cssMissSamples.length < 6) cssMissSamples.push(ref.slice(0, 80) + '  =>  ' + abs.slice(0, 90))
    }
  }
}
out.cssInternals = { total: cssUrlTotal, miss: cssUrlMiss, samples: cssMissSamples }

// CSS 파트 개수/종류
out.partTypes = {}
for (const p of parts) out.partTypes[p.contentType] = (out.partTypes[p.contentType] || 0) + 1

// ── ③ 정답 xls
try {
  const wb = XLSX.readFile(path.join(dir, '품목내역(통합).xls'))
  const ws = wb.Sheets[wb.SheetNames[0]]
  out.answer = XLSX.utils.sheet_to_json(ws, { header: 1 }).slice(0, 14).map(r =>
    (r || []).slice(0, 6).map(v => (v == null ? '' : String(v).slice(0, 28)))
  )
} catch (e) { out.answerError = String(e.message) }

// ── ① 추가: 상품 행 후보 탐색 (가격 클래스 히스토그램 + 반복 구조)
const priceHisto = {}
$('*').each((_, el) => {
  const t = $(el)
  const txt = (t.text() || '').trim()
  if (/^\d{1,3}(,\d{3})*원?$/.test(txt) && txt.length <= 12 && t.children().length === 0) {
    const cls = (el.attribs && el.attribs.class) || '(none)'
    const key = cls.replace(/_[a-zA-Z0-9]+/g, '_*').slice(0, 70)
    if (!priceHisto[key]) priceHisto[key] = []
    if (priceHisto[key].length < 4) priceHisto[key].push(txt)
  }
})
out.priceClassHistogram = Object.entries(priceHisto).filter(([, v]) => v.length >= 1)
  .sort((a, b) => b[1].length - a[1].length).slice(0, 18)
  .map(([k, v]) => ({ cls: k, samples: v }))

fs.writeFileSync(path.join(here, 'probe-lotte.json'), JSON.stringify(out, null, 2), 'utf-8')
console.log('written')
