/*
 * 최종 승인 게이트 (JEV.MD §13) — 순수 함수, node 테스트 가능.
 * 로컬(코드) 검증이 실패하면 Jev 결과와 무관하게 배포하지 않는다(§27).
 */
export function decideRuleAction({ deterministic, jev }) {
  if (!deterministic.schemaValid) return { action: 'reject', reason: 'JSON 스키마 오류' }
  if (!deterministic.extractionSucceeded) return { action: 'repair', reason: '규칙 실행 오류' }
  if (deterministic.itemCount === 0) return { action: 'repair', reason: '추출 결과 0건' }
  if (!deterministic.countMatches) return { action: 'repair', reason: '정답 품목 수 불일치' }
  if (!deterministic.totalWithinTolerance) return { action: 'repair', reason: '정답 총액 불일치' }
  if (!deterministic.checkedOnlyValid) return { action: 'repair', reason: '선택하지 않은 상품 포함' }
  if (!deterministic.optionRowsValid) return { action: 'repair', reason: '옵션 행 추출 오류' }

  const j = (jev && jev.answers) || {}
  const selectorStable = j.selector_stable ? j.selector_stable.probability : 0
  const semanticDecision = j.deployment_ready ? j.deployment_ready.value : ''
  const semanticConfidence = j.deployment_ready ? j.deployment_ready.confidence : 0

  if (selectorStable >= 0.85 && semanticDecision === 'approve' && semanticConfidence >= 0.8) {
    return { action: 'approve', reason: '정확 검증 및 의미 검증 통과' }
  }
  if (semanticDecision === 'repair' && semanticConfidence >= 0.7) {
    return { action: 'repair', reason: (j.failure_cause && j.failure_cause.value) || '의미적 품질 문제' }
  }
  if (semanticDecision === 'reject') {
    return { action: 'reject', reason: '규칙 구조가 의미적으로 부적합' }
  }
  return { action: 'human_review', reason: 'Jev 판단 신뢰도 부족' }
}
