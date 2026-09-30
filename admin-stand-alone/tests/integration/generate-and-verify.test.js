// generate-and-verify 파이프라인 테스트 — AI·Jev를 mock으로 주입해 §14 흐름을 검증한다(JEV.MD §24.2)
import { generateAndVerifyRule, extractJson } from '../../src/main/services/generate-and-verify.js'

let fail = 0
function eq(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (ok ? '' : ` actual=${JSON.stringify(actual)}`))
  if (!ok) fail++
}

const samples = [{ label: '장바구니', html: '<table><tr class="i"><td class="n">상품 A</td><td class="q"><input value="2"></td><td class="p">20,000</td></tr></table>' }]
const expected = { items: [{ name: '상품 A', qty: 2, unitPrice: 10000 }] }
const goodRuleJson = JSON.stringify({ match: ['example.com'], rowSelector: 'tr.i', priceIs: 'lineTotal', checkedOnly: { sel: 'input' }, fields: { name: { sel: 'td.n' }, qty: { sel: '.q input', attr: 'value' }, price: { sel: 'td.p', regex: '([\\d,]+)' } } })

// 1. 후보 1개가 정답 일치 + Jev 승인 → approved
{
  const res = await generateAndVerifyRule({
    mallName: '테스트몰', kind: 'cart', ruleId: 't-cart', samples, expected,
    count: 1, callAi: async () => goodRuleJson,
    callJev: async () => ({ answers: { selector_stable: { probability: 0.95 }, deployment_ready: { value: 'approve', confidence: 0.9 } } })
  })
  eq('정답 일치 + Jev 승인 → approved', res.status, 'approved')
  eq('승인 규칙 id', res.rule.id, 't-cart')
}

// 2. 로컬 검증 실패 후보 → GLM repair 1회 → 재검증 통과 → repaired
{
  const badThenGood = [JSON.stringify({ match: ['example.com'], rowSelector: 'tr.wrong', checkedOnly: { sel: 'input' }, fields: { name: { sel: 'td.x' }, price: { sel: 'td.y', regex: '([\\\\d,]+)' } } }), goodRuleJson]
  let calls = 0
  const res = await generateAndVerifyRule({
    mallName: '테스트몰', kind: 'cart', ruleId: 't2-cart', samples, expected,
    count: 1, repairRounds: 1,
    callAi: async ({ prompt }) => (calls++ === 0 ? badThenGood[0] : (prompt.includes('수정된 규칙 JSON') ? badThenGood[1] : badThenGood[0])),
    callJev: async () => ({ answers: { selector_stable: { probability: 0.9 }, deployment_ready: { value: 'approve', confidence: 0.9 } } })
  })
  eq('실패 후 수정 → repaired', res.status, 'repaired')
  eq('수정 규칙 행 선택자', res.rule.rowSelector, 'tr.i')
}

// 3. 후보 3개 중 승인 1개 선택(§14 승인 우선)
{
  const res = await generateAndVerifyRule({
    mallName: '테스트몰', kind: 'cart', ruleId: 't3-cart', samples, expected,
    count: 3,
    callAi: async ({ prompt }) => prompt.includes('#3') ? goodRuleJson : JSON.stringify({ match: ['example.com'], rowSelector: 'tr.wrong', checkedOnly: { sel: 'input' }, fields: { name: { sel: 'td.x' }, price: { sel: 'td.y', regex: '([\\\\d,]+)' } } }),
    callJev: async () => ({ answers: { selector_stable: { probability: 0.95 }, deployment_ready: { value: 'approve', confidence: 0.95 } } })
  })
  eq('후보 3개 중 승인 선택', res.status, 'approved')
}

// 4. 모두 실패 → human_review
{
  const res = await generateAndVerifyRule({
    mallName: '테스트몰', kind: 'cart', ruleId: 't4-cart', samples, expected,
    count: 2, repairRounds: 0,
    callAi: async () => JSON.stringify({ match: ['example.com'], rowSelector: 'tr.wrong', checkedOnly: { sel: 'input' }, fields: { name: { sel: 'td.x' }, price: { sel: 'td.y', regex: '([\\\\d,]+)' } } }),
    callJev: async () => ({ answers: {} })
  })
  eq('모두 실패 → human_review', res.status, 'human_review')
}

// 5. extractJson — 코드펜스 제거
eq('extractJson: 코드펜스', extractJson('```json\n{"a":1}\n```').a, 1)

console.log(fail === 0 ? 'ALL PASS' : `FAIL ${fail}건`)
process.exit(fail ? 1 : 0)
