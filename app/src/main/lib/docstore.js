import fs from 'node:fs'
import crypto from 'node:crypto'
import iconv from 'iconv-lite'
import { parseMhtml, decodeHtml, smartDecode } from './mhtml.js'
import { extractItems, roundUpToTen } from './extract.js'
import { deriveSpec } from './spec.js'
import { matchRule, ruleById } from './rules.js'

const docs = new Map()

export function stripScripts(html) {
  return html
    .replace(/<script\b[^>]*\/>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<meta[^>]+http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi, '')
}

function rewriteUrls(html, docId, parts) {
  let out = html
  for (let i = 0; i < parts.length; i++) {
    const loc = parts[i].contentLocation
    if (!loc || loc.length < 8) continue
    const target = `app-mhtml://${docId}/${i}`
    // HTML 속성의 URL은 &가 &amp;로 이스케이프되어 파트 헤더의 raw URL과 불일치 → 두 형태 모두 치환
    const entity = loc.replace(/&/g, '&amp;')
    if (entity !== loc) out = out.split(entity).join(target)
    out = out.split(loc).join(target)
  }
  return out
}

export function findPartIndex(parts, absUrl) {
  if (!absUrl) return -1
  for (let i = 0; i < parts.length; i++) {
    const loc = parts[i].contentLocation
    if (!loc) continue
    if (loc === absUrl) return i
    try {
      if (decodeURIComponent(loc) === decodeURIComponent(absUrl)) return i
    } catch {}
  }
  return -1
}

export function rewriteCssUrls(css, docId, parts, cssBase) {
  const resolve = (ref) => {
    if (!ref || /^(data:|about:|#|app-mhtml:)/i.test(ref)) return null
    let abs = null
    try { abs = new URL(ref, cssBase || 'about:blank').href } catch { return null }
    const idx = findPartIndex(parts, abs)
    return idx >= 0 ? `app-mhtml://${docId}/${idx}` : abs
  }
  let out = css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, q, ref) => {
    const r = resolve(ref.trim())
    return r ? `url("${r}")` : m
  })
  out = out.replace(/@import\s+(['"])([^'"]+)\1/gi, (m, q, ref) => {
    const r = resolve(ref.trim())
    return r ? `@import "${r}"` : m
  })
  return out
}

function fixLazyImagesBuffer(buf) {
  const html = smartDecode(buf, null);
  return iconv.encode(fixLazyImages(html), 'utf-8');
}

function fixLazyImages(html) {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const srcM = /\ssrc\s*=\s*"([^"]*)"|\ssrc\s*=\s*'([^']*)'/i.exec(tag)
    const cur = srcM ? (srcM[1] || srcM[2] || '') : ''
    const placeholder = !cur || cur.length < 9 || /^data:image\//i.test(cur) || /blank|dummy|placeholder|loading|spinner|transparent|no_img/i.test(cur)
    if (!placeholder) return tag
    const dsM = /\sdata-(?:src|original|lazy)\s*=\s*"([^"]*)"|\sdata-(?:src|original|lazy)\s*=\s*'([^']*)'/i.exec(tag)
    if (!dsM) return tag
    const url = dsM[1] || dsM[2]
    if (!url) return tag
    if (srcM) return tag.replace(srcM[0], ` src="${url}"`)
    return tag.replace(/^<img/i, `<img src="${url}"`)
  })
}

// 캡처 채널이 박제한 data-arge-checked 스탬프를 checked 속성으로 반영해
// mhtml 뷰에서도 V체크가 화면에 보이게 한다 (추출 결과와 뷰어 상태 일치)
export function reflectCheckStates(html) {
  return html.replace(/<input\b[^>]*>/gi, (tag) => {
    const m = /\sdata-arge-checked="(true|false)"/i.exec(tag)
    if (!m) return tag
    const bare = tag.replace(/\sdata-arge-checked="(?:true|false)"/i, '')
    const checkedAttrRe = /\schecked(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?(?=[\s/>])/
    const has = checkedAttrRe.test(bare)
    if (m[1] === 'true') return has ? tag : bare.replace(/\/?>$/, (gt) => ` checked${gt}`)
    return has ? bare.replace(checkedAttrRe, '') : tag
  })
}

export function loadDocument(filePath, { preferRuleId = null, sourceUrl = null } = {}) {
  const buf = fs.readFileSync(filePath)
  let parts
  let rootHtml
  const isMhtml = /\.mhtml?$/i.test(filePath) || /multipart\/related/i.test(buf.subarray(0, 2048).toString('latin1'))
  if (isMhtml) {
    const parsed = parseMhtml(buf)
    parts = parsed.parts
    rootHtml = parsed.rootHtml
  } else {
    parts = []
    rootHtml = { buf: fixLazyImagesBuffer(buf), charset: null, location: '' }
  }
  const rawHtml = decodeHtml(rootHtml)
  // URL hostname은 대문자를 소문자로 강제 변환하므로 id에 대문자가 있으면
  // app-mhtml:// 조회가 무작위로 실패한다 — 반드시 소문자로 생성
  const id = crypto.randomUUID().slice(0, 8).toLowerCase()
  let effectiveUrl = rootHtml.location || ''
  if (!effectiveUrl && sourceUrl) effectiveUrl = sourceUrl
  if (!effectiveUrl) {
    try {
      const sidecar = filePath.replace(/\.(mhtml|html|htm)$/i, '') + '.url.txt'
      if (fs.existsSync(sidecar)) effectiveUrl = fs.readFileSync(sidecar, 'utf-8').trim()
    } catch {}
  }
  const rule = preferRuleId ? ruleById(preferRuleId) : matchRule(effectiveUrl)

  let items = []
  let shippingFee = null
  let checkedFallback = false
  let error = null
  let appliedRuleId = null
  let mallName = null
  let injectedHtml = null
  if (rule) {
    try {
      const res = extractItems(rawHtml, rule)
      items = res.items
      shippingFee = res.shippingFee
      checkedFallback = !!res.checkedFallback
      injectedHtml = res.html || null
      appliedRuleId = rule.id
      mallName = rule.name
    } catch (e) {
      error = `규칙 실행 오류: ${e.message}`
    }
  }

  const rows = items.map(it => ({
    docId: id,
    name: it.name,
    spec: it.isShipping ? '' : deriveSpec(it.name, it.option),
    unit: it.isShipping ? '식' : '개',
    qty: it.qty,
    unitPrice: it.unitPrice,
    roundedPrice: roundUpToTen(it.unitPrice),
    isShipping: !!it.isShipping
  }))
  if (shippingFee && shippingFee > 0) {
    rows.push({
      docId: id,
      name: '배송비',
      spec: '',
      unit: '식',
      qty: 1,
      unitPrice: shippingFee,
      roundedPrice: roundUpToTen(shippingFee),
      isShipping: true
    })
  }

  const rewritten = reflectCheckStates(rewriteUrls(stripScripts(injectedHtml || rawHtml), id, parts))

  const doc = {
    id,
    filePath,
    fileName: filePath.split(/[\\/]/).pop(),
    sourceUrl: effectiveUrl,
    mallName: mallName || '미지원 쇼핑몰',
    ruleId: appliedRuleId,
    itemCount: items.length,
    shippingFee,
    checkedFallback,
    rows,
    error,
    rawHtml,
    html: rewritten,
    parts,
    size: buf.length
  }
  docs.set(id, doc)
  return summarize(doc)
}

export function summarize(doc) {
  return {
    id: doc.id,
    fileName: doc.fileName,
    sourceUrl: doc.sourceUrl,
    mallName: doc.mallName,
    ruleId: doc.ruleId,
    itemCount: doc.itemCount,
    shippingFee: doc.shippingFee,
    checkedFallback: !!doc.checkedFallback,
    rows: doc.rows,
    error: doc.error,
    size: doc.size
  }
}

export function reextract(id, rule) {
  const doc = docs.get(id)
  if (!doc) return null
  const res = extractItems(doc.rawHtml, rule)
  doc.rows = res.items.map(it => ({
    docId: id,
    name: it.name,
    spec: it.isShipping ? '' : deriveSpec(it.name, it.option),
    unit: it.isShipping ? '식' : '개',
    qty: it.qty,
    unitPrice: it.unitPrice,
    roundedPrice: roundUpToTen(it.unitPrice),
    isShipping: !!it.isShipping
  }))
  if (res.shippingFee && res.shippingFee > 0) {
    doc.rows.push({
      docId: id,
      name: '배송비',
      spec: '',
      unit: '식',
      qty: 1,
      unitPrice: res.shippingFee,
      roundedPrice: roundUpToTen(res.shippingFee),
      isShipping: true
    })
  }
  doc.itemCount = res.items.length
  doc.shippingFee = res.shippingFee
  doc.checkedFallback = !!res.checkedFallback
  doc.mallName = rule.name
  doc.ruleId = rule.id
  doc.error = null
  return summarize(doc)
}

export function updateRows(id, rows) {
  const doc = docs.get(id)
  if (!doc) return null
  doc.rows = rows
  return summarize(doc)
}

export function getDoc(id) {
  return docs.get(id) || null
}

export function listDocIds() {
  return [...docs.keys()]
}

export function removeDoc(id) {
  return docs.delete(id)
}
