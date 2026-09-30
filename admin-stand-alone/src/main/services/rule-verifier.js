/*
 * 로컬 규칙 검증기 (JEV.MD §11·§12) — 정확한 수치·스키마 판정은 Jev가 아니라 이 코드가 담당한다.
 * admin-verify.js의 정답 대조와 extract.js의 추출 엔진을 재사용해 §12 결과 계약을 만든다.
 */
import { load as cheerioLoad } from 'cheerio'
// 권장안 A(§4.1) — 기존 앱의 순수 모듈을 직접 재사용한다(동일 로직 복제 금지)
import { extractItems } from '../../../../app/src/main/lib/extract.js'

// 스키마 검사(§11.1) — admin.js validateRule과 동일한 최소 계약
// orientation:'column'(열 구조) 규칙은 rowSelector·fields.name/price 대신 nameRow·priceRow를 쓴다.
export function checkSchema(rule) {
  const errors = []
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
    return { schemaValid: false, errors: ['JSON이 객체가 아님'] }
  }
  const isColumn = rule.orientation === 'column'
  if (!rule.id || !/^[a-z0-9][a-z0-9-]*$/i.test(String(rule.id))) errors.push('id가 영문 식별자 형식이 아님')
  if (!rule.name) errors.push('name 없음')
  if (!Array.isArray(rule.match) || !rule.match.length) errors.push('match 배열 없음')
  if (!rule.rowSelector && !isColumn) errors.push('rowSelector 없음')
  const f = rule.fields || {}
  if (isColumn) {
    if (rule.nameRow == null) errors.push('column 규칙에 nameRow 없음')
    if (rule.priceRow == null) errors.push('column 규칙에 priceRow 없음')
  } else {
    if (!f.name || !f.name.sel) errors.push('fields.name.sel 없음')
    if (!f.price || (!f.price.sel && !f.price.regex)) errors.push('fields.price 없음')
  }
  return { schemaValid: errors.length === 0, errors }
}

// selector 일치 수 + 의심스러운 class 진단(§12 diagnostics) — Jev 전달용 요약
function selectorDiagnostics($, samplesHtml, rule) {
  const counts = {}
  for (const [key, sel] of [
    ['rowSelector', rule.rowSelector],
    ['name', rule.fields && rule.fields.name && rule.fields.name.sel],
    ['qty', rule.fields && rule.fields.qty && rule.fields.qty.sel],
    ['price', rule.fields && rule.fields.price && rule.fields.price.sel]
  ]) {
    try { counts[key] = sel ? $(samplesHtml).find(sel).length : 0 } catch { counts[key] = 0 }
  }
  const suspicious = []
  const classRe = /\bclass=["']([^"']+)["']/g
  let m
  while ((m = classRe.exec(samplesHtml)) && suspicious.length < 8) {
    for (const c of String(m[1]).split(/\s+/)) {
      if (/^css-[a-z0-9]{6,}$/i.test(c) || /^[0-9a-f]{10,}$/i.test(c)) suspicious.push(c)
    }
  }
  return { selectorMatchCounts: counts, suspiciousClassNames: [...new Set(suspicious)] }
}

/*
 * §12 결과 계약 — samples: [{label, html}], expected: {items} 또는 null
 */
export function verifyRule({ rule, samples, expected }) {
  const { schemaValid, errors } = checkSchema(rule)
  if (!schemaValid) {
    return {
      schemaValid: false, extractionSucceeded: false, itemCount: 0, itemCountExpected: null,
      countMatches: false, subtotal: 0, subtotalExpected: null, totalWithinTolerance: false,
      shipping: null, shippingExpected: null, checkedOnlyValid: false, optionRowsValid: false,
      extraction: { items: [] },
      diagnostics: { selectorMatchCounts: {}, suspiciousClassNames: [] },
      errors, warnings: []
    }
  }

  const expectedItems = expected && Array.isArray(expected.items)
    ? expected.items.filter(i => !i.isShipping)
    : null
  const itemCountExpected = expectedItems ? expectedItems.length : null
  const subtotalExpected = expectedItems
    ? expectedItems.reduce((s, i) => s + (Number(i.qty) || 1) * (Number(i.unitPrice) || 0), 0)
    : null

  const errorsOut = []
  const warnings = []
  let extractionSucceeded = true
  let itemCount = 0
  let subtotal = 0
  let namesAllPresent = true
  let pricesPositive = true
  let uncheckedIncluded = false
  const allItems = []
  let diag = { selectorMatchCounts: {}, suspiciousClassNames: [] }

  for (const s of samples) {
    let res
    try {
      res = extractItems(s.html, rule)
    } catch (e) {
      extractionSucceeded = false
      errorsOut.push(`${s.label || '샘플'}: 추출 예외 — ${String(e.message || e)}`)
      continue
    }
    itemCount += res.items.length
    for (const it of res.items) {
      const q = Number(it.qty) || 1
      const p = Number(it.unitPrice) || 0
      subtotal += q * p
      if (!it.name || !String(it.name).trim()) namesAllPresent = false
      if (!(p > 0)) pricesPositive = false
      allItems.push(it)
    }
    if (rule.checkedOnly && res.items.length === 0 && /input/i.test(s.html)) {
      uncheckedIncluded = true // 체크박스가 있는 화면에서 0건 — 전체 미추출 또는 필터 오류
    }
    if (!diag.selectorMatchCounts.rowSelector) {
      try { diag = selectorDiagnostics(cheerioLoad(s.html), s.html, rule) } catch {}
    }
  }

  const countMatches = itemCountExpected == null ? itemCount > 0 : itemCount === itemCountExpected
  const totalWithinTolerance = subtotalExpected == null
    ? itemCount > 0
    : Math.abs(subtotal - subtotalExpected) <= Math.max(10, subtotalExpected * 0.02)

  // 장바구니 규칙은 checkedOnly가 기본 필수(ADMIN_SATAD_ALONE.MD §2.2)
  const isCart = /-cart$/.test(String(rule.id)) || /장바구니/.test(String(rule.name))
  const checkedOnlyValid = isCart ? !!rule.checkedOnly && !uncheckedIncluded : !uncheckedIncluded
  const optionRowsValid = !rule.optionRows || !!rule.optionRows.sel
  const shippingValid = !rule.shipping || !!rule.shipping.mode

  if (uncheckedIncluded) warnings.push('체크박스 화면에서 추출 0건 — checkedOnly 선택자 확인 필요')
  if (!rule.checkedOnly) {
    warnings.push(isCart ? '장바구니 규칙에는 checkedOnly 지정이 필수입니다' : '장바구니 화면이라면 checkedOnly 지정을 권장합니다')
  }

  return {
    schemaValid: true,
    extractionSucceeded,
    itemCount,
    itemCountExpected,
    countMatches,
    subtotal,
    subtotalExpected,
    totalWithinTolerance,
    shipping: null,
    shippingExpected: null,
    checkedOnlyValid,
    optionRowsValid,
    extraction: { items: allItems },
    diagnostics: diag,
    errors: errorsOut,
    warnings
  }
}
