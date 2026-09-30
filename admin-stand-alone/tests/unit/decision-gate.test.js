// decision-gate 단위 테스트 (JEV.MD §13·§24.1 최종 게이트)
const { decideRuleAction } = require('../../src/main/services/decision-gate.js')

let fail = 0
function eq(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (ok ? '' : ` actual=${JSON.stringify(actual)}`))
  if (!ok) fail++
}
const det = (over = {}) => Object.assign({ schemaValid: true, extractionSucceeded: true, itemCount: 5, countMatches: true, totalWithinTolerance: true, checkedOnlyValid: true, optionRowsValid: true }, over)
const jev = (over = {}) => ({ answers: Object.assign({ selector_stable: { probability: 0.9 }, name_quality: { value: 3 }, failure_cause: { value: 'no_semantic_problem' }, deployment_ready: { value: 'approve', confidence: 0.9 } }, over) })

eq('로컬 성공 + Jev 승인 → approve', decideRuleAction({ deterministic: det(), jev: jev() }).action, 'approve')
eq('로컬 실패(0건) + Jev 승인 → repair', decideRuleAction({ deterministic: det({ itemCount: 0 }), jev: jev() }), { action: 'repair', reason: '추출 결과 0건' })
eq('스키마 오류 + Jev 승인 → reject', decideRuleAction({ deterministic: det({ schemaValid: false }), jev: jev() }).action, 'reject')
eq('총액 불일치 + Jev 승인 → repair', decideRuleAction({ deterministic: det({ totalWithinTolerance: false }), jev: jev() }).reason, '정답 총액 불일치')
eq('checkedOnly 오류 + Jev 승인 → repair', decideRuleAction({ deterministic: det({ checkedOnlyValid: false }), jev: jev() }).action, 'repair')
eq('로컬 성공 + Jev 낮은 신뢰도 → human_review', decideRuleAction({ deterministic: det(), jev: jev({ deployment_ready: { value: 'approve', confidence: 0.5 } }) }).action, 'human_review')
eq('로컬 성공 + Jev repair → repair', decideRuleAction({ deterministic: det(), jev: jev({ deployment_ready: { value: 'repair', confidence: 0.8 }, failure_cause: { value: 'price_selector' } }) }), { action: 'repair', reason: 'price_selector' })
eq('Jev reject → reject', decideRuleAction({ deterministic: det(), jev: jev({ deployment_ready: { value: 'reject', confidence: 0.9 } }) }).action, 'reject')
eq('selector 불안정 + approve → human_review', decideRuleAction({ deterministic: det(), jev: jev({ selector_stable: { probability: 0.5 } }) }).action, 'human_review')
eq('Jev 없음 → human_review', decideRuleAction({ deterministic: det(), jev: null }).action, 'human_review')

console.log(fail === 0 ? 'ALL PASS' : `FAIL ${fail}건`)
process.exit(fail ? 1 : 0)
