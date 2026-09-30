// 관리자 규칙 자가 검증 판정부 — electron 의존이 없어 node 테스트가 가능하다(test-admin-verify.js)
import { extractItems } from './extract.js'

/*
 * 생성된 규칙을 샘플로 자가 검증한다(v1.49.9 — 자가 수정 루프의 판정부).
 *  - 각 샘플에서 품목 0건이면 무조건 실패(주문서 추출 불능 등의 핵심 신호)
 *  - 단일 화면 종류만 생성하는 실행(expectAnswer)이면 정답 엑셀의 건수·총액과 대조
 *    (배송비 행 제외, 총액 2% 이내 허용), 두 종류를 동시 생성하면 정답이 어느 화면
 *    기준인지 알 수 없으므로 0건 여부만 판정한다.
 */
export function verifyRuleSamples(rule, samples, answer, expectAnswer) {
  const problems = []
  const details = []
  const expectedItems = (expectAnswer && answer.mode === 'parsed')
    ? answer.items.filter(i => !i.isShipping)
    : null
  const expectedCount = expectedItems ? expectedItems.length : null
  const expectedTotal = expectedItems
    ? expectedItems.reduce((s, i) => s + (Number(i.qty) || 1) * (Number(i.unitPrice) || 0), 0)
    : null
  for (const s of samples) {
    let res
    try {
      res = extractItems(s.html, rule)
    } catch (e) {
      return { ok: false, summary: '추출 중 오류: ' + String(e.message || e), problems: problems.concat(String(e.message || e)), details }
    }
    const count = res.items.length
    const total = res.items.reduce((sum, i) => sum + (Number(i.qty) || 1) * (Number(i.unitPrice) || 0), 0)
    if (count === 0) {
      problems.push(`${s.label}: 품목을 하나도 추출하지 못했습니다 — rowSelector가 실제 품목 행과 일치하지 않는 것이 가장 흔한 원인입니다.`)
    }
    if (expectedCount != null && count !== expectedCount) {
      problems.push(`${s.label}: 추출 ${count}건 vs 정답 ${expectedCount}건 — 상품 수가 다릅니다(옵션·부분 행 누락 또는 불필요한 행 포함).`)
    }
    if (expectedTotal != null && Math.abs(total - expectedTotal) > Math.max(10, expectedTotal * 0.02)) {
      problems.push(`${s.label}: 추출 합계 ${total.toLocaleString()}원 vs 정답 ${expectedTotal.toLocaleString()}원 — 금액이 다릅니다(priceIs:"lineTotal" 여부 또는 금액 선택자 확인).`)
    }
    details.push({
      label: s.label,
      count,
      total,
      names: res.items.map(i => `${i.name} x${i.qty} @${i.unitPrice}`).slice(0, 12)
    })
  }
  const ok = problems.length === 0
  const summary = details.map(d => `${d.label} ${d.count}건/${d.total.toLocaleString()}원`).join(' · ') +
    (expectedCount != null ? ` (정답 ${expectedCount}건/${expectedTotal.toLocaleString()}원)` : '')
  return { ok, summary, problems, details }
}
