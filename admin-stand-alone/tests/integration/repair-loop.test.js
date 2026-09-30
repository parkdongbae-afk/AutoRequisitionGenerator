// §11.3 자가 수정 루프 — 다중 회차·동일 JSON 중단·수정 이력 검증
import { generateAndVerifyRule } from '../../src/main/services/generate-and-verify.js'

let fail = 0
function eq(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (ok ? '' : ` actual=${JSON.stringify(actual)}`))
  if (!ok) fail++
}

const samples = [{ label: '장바구니', html: '<table><tr class="i"><td class="n">상품 A</td><td class="q"><input value="2"></td><td class="p">20,000</td></tr></table>' }]
const expected = { items: [{ name: '상품 A', qty: 2, unitPrice: 10000 }] }
const goodRuleJson = JSON.stringify({ match: ['example.com'], rowSelector: 'tr.i', priceIs: 'lineTotal', checkedOnly: { sel: 'input' }, fields: { name: { sel: 'td.n' }, qty: { sel: '.q input', attr: 'value' }, price: { sel: 'td.p', regex: '([\\d,]+)' } } })
const badRuleJson = JSON.stringify({ match: ['example.com'], rowSelector: 'tr.wrong', checkedOnly: { sel: 'input' }, fields: { name: { sel: 'td.x' }, price: { sel: 'td.y', regex: '([\\\\d,]+)' } } })
const jevApprove = async () => ({ answers: { selector_stable: { probability: 0.95 }, deployment_ready: { value: 'approve', confidence: 0.95 } } })

// 1. 2회차 만에 성공 — repairHistory에 회차별 판정이 남는다
{
  let calls = 0
  const res = await generateAndVerifyRule({
    mallName: '테스트몰', kind: 'cart', ruleId: 'r1-cart', samples, expected,
    count: 1, repairRounds: 3,
    callAi: async ({ prompt }) => {
      calls++
      if (calls === 1) return badRuleJson
      if (calls === 2) return badRuleJson.replace('tr.wrong', 'tr.almost')
      return goodRuleJson
    },
    callJev: jevApprove
  })
  eq('2회차 만에 수정 성공', res.status, 'repaired')
  eq('수정 이력 2건', res.repairHistory.length, 2)
  eq('최종 행 선택자', res.rule.rowSelector, 'tr.i')
  eq('AI 호출 3회', calls, 3)
}

// 2. 동일 JSON 반복 반환 시 즉시 중단(§11.3 무한 반복 방지)
{
  let calls = 0
  const res = await generateAndVerifyRule({
    mallName: '테스트몰', kind: 'cart', ruleId: 'r2-cart', samples, expected,
    count: 1, repairRounds: 3,
    callAi: async () => { calls++; return badRuleJson },
    callJev: async () => ({ answers: {} })
  })
  eq('동일 JSON 중단 → human_review', res.status, 'human_review')
  eq('AI 호출 2회(후보+수정 1회) 후 중단', calls, 2)
  eq('stalled 기록', res.repairHistory.some(h => h.action === 'stalled'), true)
}

// 3. 수정분이 로컬 검증을 통과해도 Jev가 reject면 추가 수정 없이 중단(§13 게이트)
{
  let calls = 0
  const res = await generateAndVerifyRule({
    mallName: '테스트몰', kind: 'cart', ruleId: 'r3-cart', samples, expected,
    count: 1, repairRounds: 3,
    callAi: async () => {
      calls++
      return calls === 1 ? badRuleJson : goodRuleJson
    },
    callJev: async ({ rule }) => rule.rowSelector === 'tr.i'
      ? { answers: { selector_stable: { probability: 0.9 }, deployment_ready: { value: 'reject', confidence: 0.95 } } }
      : { answers: {} }
  })
  eq('Jev reject 후 중단 → human_review', res.status, 'human_review')
  eq('reject 이력 존재', res.repairHistory.some(h => h.action === 'reject'), true)
  eq('AI 호출 2회 후 중단', calls, 2)
}

// 4. 수정분도 정답 불일치 3회 → human_review + 이력 3건
{
  let calls = 0
  const res = await generateAndVerifyRule({
    mallName: '테스트몰', kind: 'cart', ruleId: 'r4-cart', samples, expected,
    count: 1, repairRounds: 3,
    callAi: async () => {
      calls++
      return badRuleJson.replace('tr.wrong', 'tr.wrong' + calls)
    },
    callJev: async () => ({ answers: {} })
  })
  eq('3회 모두 실패 → human_review', res.status, 'human_review')
  eq('수정 이력 3건', res.repairHistory.length, 3)
}

console.log(fail === 0 ? 'ALL PASS' : `FAIL ${fail}건`)
process.exit(fail ? 1 : 0)
