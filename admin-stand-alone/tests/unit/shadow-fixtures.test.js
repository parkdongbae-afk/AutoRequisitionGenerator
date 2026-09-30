import test from 'node:test'
import assert from 'node:assert'
import { buildFixtureCases, runShadowFixtures } from '../../src/main/services/shadow-fixtures.js'
import { shadowStats } from '../../src/main/services/settings-service.js'

test('픽스처 케이스 — 72개·축별 관리자 정답 도출(§19.2)', () => {
  const cases = buildFixtureCases()
  assert.equal(cases.length, 72)
  for (const c of cases) {
    assert.ok(['reject', 'repair', 'human_review', 'approve'].includes(c.adminDecision), `정답 축 오류: ${c.key}`)
    if (c.extraction.items.length === 0) assert.equal(c.adminDecision, 'reject')
    if (c.key.includes('random-match')) assert.equal(c.adminDecision, 'human_review')
    if (c.key.includes('garbage-match') && !c.key.includes('random')) assert.equal(c.adminDecision, 'repair')
    if (c.key.includes('good-match') && c.key.includes('stable')) assert.equal(c.adminDecision, 'approve')
    if (c.kind === 'cart') assert.ok(c.rule.checkedOnly, 'cart 픽스처는 checkedOnly 필수')
  }
})

test('픽스처 실행 — Jev 판정을 §19.1 형식으로 기록하고 통계가 50건+ 게이트를 충족한다', async () => {
  const records = []
  const res = await runShadowFixtures({
    callJev: async ({ rule, extraction, expected, diagnostics }) => {
      // 모의 Jev — 실제 판정기처럼 state 축(selector·이름·추출/정답 대조)에 반응한다
      const random = /css-\w+/.test(rule.rowSelector)
      const names = (extraction.items || []).map(i => i.name)
      const expNames = (expected.items || []).map(i => i.name)
      const empty = names.length === 0
      const garbage = names.length > 0 && names.every(n => /바로구매|담기|관심상품/.test(n))
      const countOk = names.length === expNames.length
      const totalOk = (extraction.items || []).reduce((s, i) => s + i.unitPrice, 0)
        === (expected.items || []).reduce((s, i) => s + i.unitPrice, 0)
      const value = empty ? 'reject' : (!countOk || !totalOk) ? 'repair' : random ? 'human_review' : garbage ? 'repair' : 'approve'
      return { answers: { selector_stable: { probability: random ? 0.2 : 0.9 }, name_quality: { score: garbage ? 1 : 4, confidence: 0.9 }, failure_cause: { value: 'no_semantic_problem', confidence: 0.9 }, deployment_ready: { value, confidence: 0.9 } } }
    },
    persist: rec => records.push(rec)
  })
  assert.equal(res.total, 72)
  assert.equal(res.recorded, 72)
  assert.equal(res.errors, 0)
  assert.equal(records.length, 72)
  for (const r of records) {
    assert.ok(r.ruleId.startsWith('fixture-'))
    assert.ok(['pass', 'fail'].includes(r.localDecision))
    assert.ok(r.adminDecision)
    assert.ok(String(r.notes).includes('§19.2'))
  }
  const stats = shadowStats(records)
  assert.equal(stats.compared, 72, '전 케이스가 관리자 정답과 비교된다')
  assert.ok(stats.agreement >= 0.8, `일치율 ${stats.agreement} — §19.2 임계값 충족 (mismatch×random 4건은 모의 판정기도 놓치는 자연스러운 불일치)`)
})

test('픽스처 실행 — Jev 오류는 기록 없이 오류 수만 집계', async () => {
  const records = []
  const res = await runShadowFixtures({
    callJev: async () => { throw Object.assign(new Error('TYPESAFE_API_KEY가 설정되지 않았습니다'), { code: 'JEV_NOT_CONFIGURED' }) },
    persist: rec => records.push(rec)
  })
  assert.equal(res.recorded, 0)
  assert.equal(res.errors, 72)
  assert.equal(records.length, 0)
})
