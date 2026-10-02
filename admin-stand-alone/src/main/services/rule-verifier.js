/*
 * 로컬 규칙 검증기 (JEV.MD §11·§12) — 정확한 수치·스키마 판정은 Jev가 아니라 이 코드가 담당한다.
 * admin-verify.js의 정답 대조와 extract.js의 추출 엔진을 재사용해 §12 결과 계약을 만든다.
 */
import { load as cheerioLoad } from 'cheerio'
// 권장안 A(§4.1) — 기존 앱의 순수 모듈을 직접 재사용한다(동일 로직 복제 금지)
import { extractItems } from '../../../../app/src/main/lib/extract.js'

/*
 * 가격 진단 — 건수는 일치하는데 총액만 틀릴 때, 추출 단가 vs 정답 단가의 비율이
 * 일정하면(±6%) 정답 Excel 자체가 의심(부가세 포함·다른 시점 파일)으로 판정한다.
 * AI 자가 수정으로는 해결할 수 없는 원인이므로, 관리자에게 정답 파일 확인을 요구한다(토큰 낭비 차단).
 */
export function diagnosePrices(gotItems, ansItems, tolPct = 0.06) {
  if (!Array.isArray(gotItems) || !Array.isArray(ansItems)) return null
  if (!gotItems.length || gotItems.length !== ansItems.length) return null
  const pairs = gotItems.map((g, i) => {
    const gotU = Number(g.unitPrice) || 0
    const gotQ = Number(g.qty) || 1
    const ansU = Number(ansItems[i].unitPrice) || 0
    const ansQ = Number(ansItems[i].qty) || 1
    return { gotU, ansU, ratio: gotU > 0 && gotQ > 0 && ansQ > 0 ? (ansU * ansQ) / (gotU * gotQ) : 0 }
  })
  if (pairs.some(p => !(p.gotU > 0) || !(p.ratio > 0))) return null
  const sorted = [...pairs.map(p => p.ratio)].sort((a, b) => a - b)
  const med = sorted[Math.floor(sorted.length / 2)]
  if (Math.abs(med - 1) <= 0.02) return null
  const consistent = pairs.every(p => Math.abs(p.ratio - med) <= med * tolPct)
  if (!consistent) return null
  return {
    medianRatio: Math.round(med * 100) / 100,
    message: `정답 Excel 단가가 화면(추출) 단가의 약 ${Math.round(med * 100)}%입니다 — 부가세 포함가이거나 다른 시점의 정답 파일로 보입니다. 정답 Excel을 확인하세요. (AI 자가 수정으로는 해결되지 않아 중단합니다)`
  }
}

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
  const perSample = []
  const answerPairs = []
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

    // 캡처별 정답 — 샘플에 expected가 있으면 그 샘플만의 건수·총액을 대조한다(§10-A.8 교차 검증)
    const sampleExpectedItems = s.expected && Array.isArray(s.expected.items)
      ? s.expected.items.filter(i => !i.isShipping)
      : null
    if (sampleExpectedItems) {
      const cnt = res.items.length
      const expCnt = sampleExpectedItems.length
      const tot = res.items.reduce((sum, i) => sum + (Number(i.qty) || 1) * (Number(i.unitPrice) || 0), 0)
      const expTot = sampleExpectedItems.reduce((sum, i) => sum + (Number(i.qty) || 1) * (Number(i.unitPrice) || 0), 0)
      perSample.push({
        label: s.label || '샘플',
        count: cnt,
        expectedCount: expCnt,
        subtotal: tot,
        expectedSubtotal: expTot,
        countOk: cnt === expCnt,
        totalOk: Math.abs(tot - expTot) <= Math.max(10, expTot * 0.02),
        got: res.items
      })
      answerPairs.push({ got: res.items, ans: sampleExpectedItems })
    }
    if (!sampleExpectedItems && expectedItems) {
      answerPairs.push({ got: res.items, ans: expectedItems.filter(i => !i.isShipping) })
    }
  }

  const hasPerSample = perSample.length > 0
  const judgedAllOk = perSample.every(p => p.countOk && p.totalOk)

  // 가격 진단(§11.1 보강) — 건수 일치·총액 불일치인 샘플에서 단가 비율이 일정하면
  // 정답 Excel 문제(부가세 등)로 판정해 결과에 첨부한다.
  let priceDiagnosis = null
  if (!hasPerSample && expectedItems) {
    answerPairs.push({ got: allItems, ans: expectedItems.filter(i => !i.isShipping) })
  }
  for (const pair of answerPairs) {
    if (pair.got.length !== pair.ans.length) continue
    const d = diagnosePrices(pair.got, pair.ans)
    if (d) { priceDiagnosis = d; break }
  }

  const countMatches = hasPerSample
    ? itemCount > 0 && judgedAllOk
    : itemCountExpected == null ? itemCount > 0 : itemCount === itemCountExpected
  const totalWithinTolerance = hasPerSample
    ? itemCount > 0 && judgedAllOk
    : subtotalExpected == null
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
    perSample,
    priceDiagnosis,
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
