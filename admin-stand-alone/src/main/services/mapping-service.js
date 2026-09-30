/*
 * 클릭 매핑 서비스 (ADMIN_SATAD_ALONE.MD §12)
 * - 로컬 HTML/MHTML만 메모리로 읽어 토큰에 바인딩하고 admin-sample:// 프로토콜로
 *   스크립트 제거본을 서빙한다(외부 네트워크 차단, 피커 스크립트만 제한 주입 §12.2).
 * - 규칙 조립은 사용자용 앱 store.js의 deriveSelector 계약을 그대로 이식한다(§4.1 권장안 A).
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseMhtml, decodeHtml, smartDecode } from '../../../../app/src/main/lib/mhtml.js'
import { extractItems } from '../../../../app/src/main/lib/extract.js'
import { PICKER_SCRIPT } from '../../../../app/src/main/lib/picker.js'
import { randomBytes } from 'node:crypto'

// 공용 피커 스크립트(사용자 앱과 동일 계약)에 tagName 수집만 추가한다 — 사용자 앱 원본은 건드리지 않는다
const PICKER_SCRIPT_TAGGED = PICKER_SCRIPT.replace(
  "lastSel.sampleText = (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 60)",
  "lastSel.sampleText = (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 60); lastSel.tagName = (el.tagName || '').toUpperCase(); lastSel.isInput = /^(INPUT|SELECT)$/.test((el.tagName || '').toUpperCase())"
)

const samples = new Map()
const SAMPLE_TTL_MS = 6 * 60 * 60 * 1000

export function getSample(token) {
  const s = samples.get(String(token))
  if (!s) return null
  if (Date.now() - s.openedAt > SAMPLE_TTL_MS) {
    samples.delete(String(token))
    return null
  }
  return s
}

export function closeSample(token) {
  samples.delete(String(token))
}

/*
 * 샘플 파일 열기 — MHTML이면 루트 text/html 파트와 서브리소스 파트를 모두 보관한다.
 * 반환: { token, location, title, kind: 'mhtml'|'html', bytes }
 */
export function openMappingSample(filePath) {
  const buf = fs.readFileSync(filePath)
  const head = buf.subarray(0, 400).toString('latin1')
  const isMhtml = /\.mhtml?$/i.test(filePath) || head.includes('MIME-Version')
  let html, location = '', title = '', parts = []
  if (isMhtml) {
    const parsed = parseMhtml(buf)
    html = decodeHtml(parsed.rootHtml)
    location = parsed.rootHtml.location || ''
    parts = parsed.parts.map(p => ({
      url: normalizePartUrl(p.contentLocation || p.cid),
      contentType: p.contentType,
      data: p.data
    })).filter(p => p.url)
  } else {
    html = smartDecode(buf, null)
  }
  const tm = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (tm) title = tm[1].replace(/\s+/g, ' ').trim().slice(0, 120)
  const token = randomBytes(8).toString('hex')
  samples.set(token, { html, location, title, parts, openedAt: Date.now(), sourcePath: String(filePath) })
  pruneSamples()
  return { token, location, title, kind: isMhtml ? 'mhtml' : 'html', bytes: buf.length }
}

function normalizePartUrl(u) {
  const s = String(u || '').trim()
  if (!s) return ''
  return s.replace(/^cid:/i, 'cid:')
}

function pruneSamples() {
  const now = Date.now()
  for (const [k, v] of samples) {
    if (now - v.openedAt > SAMPLE_TTL_MS) samples.delete(k)
  }
}

const CSP_META = '<meta http-equiv="Content-Security-Policy" content="default-src \'self\' admin-sample: data:; script-src \'unsafe-inline\'; style-src \'unsafe-inline\' \'self\' admin-sample: data:; img-src \'self\' admin-sample: data:; connect-src \'none\'; frame-src \'none\'">'
const SCRIPT_BLOCK_RE = /<script[\s\S]*?<\/script\s*>/gi

/*
 * 안전 뷰어 HTML (§12.2) — 원문 스크립트 전부 제거, CSP 주입, picker=1일 때만 피커 주입.
 * 외부 리소스는 CSP와 프로토콜 핸들러가 함께 차단한다.
 */
export function buildViewerHtml(token, { picker = false } = {}) {
  const s = getSample(token)
  if (!s) return null
  let html = String(s.html)
  html = html.replace(SCRIPT_BLOCK_RE, '<!--script removed-->')
  html = html.replace(/<meta[^>]+http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '')
  const inject = CSP_META + (picker ? `<script>${PICKER_SCRIPT_TAGGED}</script>` : '')
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>${inject}`)
  } else {
    html = inject + html
  }
  return html
}

/*
 * admin-sample:// 프로토콜 핸들러 콜백 — URL 형식:
 *   admin-sample://<token>/                     문서(피커 여부는 query)
 *   admin-sample://<token>/<resource-path>      MHTML 서브리소스
 * 반환: Buffer|null 과 contentType. 외부 URL은 절대 fetch하지 않는다.
 */
export function serveSampleRequest(token, urlObj) {
  const s = getSample(token)
  if (!s) return null
  const picker = urlObj.searchParams.get('picker') === '1'
  if (!urlObj.pathname || urlObj.pathname === '/' || urlObj.pathname === '') {
    return { data: Buffer.from(buildViewerHtml(token, { picker }), 'utf-8'), contentType: 'text/html; charset=utf-8' }
  }
  const wanted = decodeURIComponent(urlObj.pathname).replace(/^\//, '')
  const hit = s.parts.find(p => p.url.endsWith(wanted) || wanted.endsWith(p.url))
  if (hit) return { data: hit.data, contentType: hit.contentType || 'application/octet-stream' }
  return { data: Buffer.alloc(0), contentType: 'text/plain', status: 404 }
}

/*
 * 피커 결과 → 규칙 조립 (§12.3~§12.7)
 * picks: { row, name, qty, price, shipping, checkedOnly, optionRow }
 * 각 pick: { selector, sampleText } 또는 null. fieldSamples: { kind: [{selector}] }
 */
export function assembleMappingRule({ picks, fieldSamples = {}, meta }) {
  const rowSel = picks.row && picks.row.selector
  if (!rowSel) return { error: '상품 행(rowSelector)이 필요합니다' }
  if (!picks.name || !picks.price) return { error: '상품명과 단가 선택은 필수입니다' }

  const deriveSelector = (kindKey, fallback) => {
    const arr = fieldSamples[kindKey] || []
    if (arr.length < 2) return fallback
    const stripped = arr.map(s => String(s.selector || '').replace(/:nth-of-type\(\d+\)/g, '').replace(/:nth-child\(\d+\)/g, ''))
    const uniq = [...new Set(stripped)]
    if (uniq.length === 1) return uniq[0]
    const segs = stripped.map(s => s.split(/\s*>\s*/).filter(Boolean))
    let common = segs[0]
    for (const seg of segs.slice(1)) {
      let k = 0
      while (k < common.length && k < seg.length && common[common.length - 1 - k] === seg[seg.length - 1 - k]) k++
      common = common.slice(common.length - k)
    }
    return common.length ? common.join(' > ') : stripped[stripped.length - 1]
  }

  const nameSel = deriveSelector('name', picks.name.selector)
  const qtySel = deriveSelector('qty', picks.qty && picks.qty.selector)
  const priceSel = deriveSelector('price', picks.price.selector)
  const shipSel = deriveSelector('shipping', picks.shipping && picks.shipping.selector)
  const checkedSel = picks.checkedOnly && picks.checkedOnly.selector
  const optionSel = picks.optionRow && picks.optionRow.selector
  const qtyIsInput = !!(picks.qty && picks.qty.isInput)
  const baseId = String(meta.baseId || '').toLowerCase().replace(/-cart$/, '')
  const isCart = !!meta.isCart || /-cart$/.test(String(meta.ruleId || ''))
  const ruleId = String(meta.ruleId || (isCart ? `${baseId}-cart` : baseId))
  if (!/^[a-z0-9][a-z0-9-]*$/.test(ruleId)) return { error: `규칙 ID 형식 오류: ${ruleId}` }

  const rule = {
    id: ruleId,
    name: meta.name || ruleId,
    match: [meta.match].filter(Boolean),
    rowSelector: rowSel,
    priceIs: meta.priceIs === 'unit' ? 'unit' : 'lineTotal',
    ...(optionSel ? { optionRows: { sel: optionSel } } : {}),
    ...(checkedSel ? { checkedOnly: { sel: checkedSel } } : {}),
    fields: {
      name: { sel: nameSel },
      ...(qtySel ? { qty: { sel: qtySel, ...(qtyIsInput ? { attr: 'value' } : {}), regex: '(\\d+)' } } : {}),
      price: { sel: priceSel, regex: '([\\d,]+)' }
    },
    shipping: shipSel ? { mode: 'selector', sel: shipSel, regex: '([\\d,]+)' } : { mode: 'none' },
    user: true,
    notes: `관리자 도구 클릭 매핑으로 생성됨 (${new Date().toISOString().slice(0, 10)})`
  }
  if (isCart && !rule.checkedOnly) {
    return { error: '장바구니 규칙에는 checkedOnly(체크박스) 선택이 필요합니다', rule }
  }
  return { rule }
}

/*
 * 매핑 미리보기 추출 (§12.3 — 첫 N개 추출값)
 */
export function previewMappingExtraction({ token, rule, limit = 5 }) {
  const s = getSample(token)
  if (!s) return { error: '샘플이 만료되었습니다 — 파일을 다시 여세요' }
  try {
    const res = extractItems(s.html, rule)
    return {
      count: res.items.length,
      items: res.items.slice(0, limit),
      location: s.location
    }
  } catch (e) {
    return { error: String(e.message || e) }
  }
}

export function sampleSourcePath(token) {
  const s = getSample(token)
  return s ? s.sourcePath : ''
}

export function isSampleFile(filePath) {
  return /\.(html?|mhtml?|mht)$/i.test(path.extname(String(filePath)))
}
