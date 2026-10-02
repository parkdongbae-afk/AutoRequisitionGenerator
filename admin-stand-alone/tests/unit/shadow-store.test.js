import test from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendShadowRecord, readShadowRecords, resolveAdminDecision } from '../../src/main/services/shadow-store.js'
import { shadowStats } from '../../src/main/services/settings-service.js'

test('관리자 판정 확정 — 대기 레코드만 갱신, 확정분은 보존(§19)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mgr-res-'))
  try {
    appendShadowRecord(dir, { ruleId: 'mall-cart', localDecision: 'pass', jevDecision: 'approve', adminDecision: '', notes: '실사용 생성' })
    appendShadowRecord(dir, { ruleId: 'mall-cart', localDecision: 'pass', jevDecision: 'approve', adminDecision: 'approve', notes: '실사용 생성' })
    const r = resolveAdminDecision(dir, 'mall-cart', 'approve')
    assert.equal(r.updated, 1, '대기 중 1건만 확정')
    const recs = readShadowRecords(dir).filter(x => x.ruleId === 'mall-cart')
    assert.equal(recs.filter(x => x.adminDecision === 'approve').length, 2)
    assert.equal(resolveAdminDecision(dir, 'mall-cart', '스팸').updated, 0, '판정 값 검증')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('e2e 스모크 기록은 Shadow 통계에서 제외된다', () => {
  const recs = [
    { localDecision: 'pass', jevDecision: 'approve', adminDecision: 'approve', notes: '실사용 생성' },
    { localDecision: 'pass', jevDecision: 'approve', adminDecision: 'approve', notes: 'e2e smoke' }
  ]
  const s = shadowStats(recs)
  assert.equal(s.compared, 1, 'e2e 기록은 비교 대상 제외')
})
