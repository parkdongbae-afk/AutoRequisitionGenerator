import test from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  loadSettings, saveSettings, storeTypesafeKey, loadTypesafeKey, clearTypesafeKey,
  shadowStats, autoApproveAllowed, DEFAULT_SETTINGS
} from '../../src/main/services/settings-service.js'

test('기본 설정 병합 — 부분 저장해 기본값 유지', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mgr-set-'))
  try {
    saveSettings(dir, { generation: { model: 'test-model' } })
    const s = loadSettings(dir)
    assert.equal(s.generation.model, 'test-model')
    assert.equal(s.jev.shadowMode, true)
    assert.equal(s.jev.autoApproveEnabled, false)
    assert.deepEqual(s.privacy, DEFAULT_SETTINGS.privacy)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('TYPESAFE Key — encryptFn 없으면 저장 거부(평문 금지)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mgr-key-'))
  try {
    const r = storeTypesafeKey(dir, 'secret', {})
    assert.equal(r.ok, false)
    assert.equal(loadTypesafeKey(dir, { decryptFn: () => Buffer.from('') }), null)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('TYPESAFE Key — safeStorage 왕복과 삭제', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mgr-key2-'))
  try {
    const r = storeTypesafeKey(dir, 'secret-abc', { encryptFn: k => Buffer.from(`enc:${k}`, 'utf-8') })
    assert.equal(r.ok, true)
    const back = loadTypesafeKey(dir, { decryptFn: buf => Buffer.from(`dec:${buf.toString('utf-8')}`) })
    assert.equal(back, 'dec:enc:secret-abc')
    assert.equal(loadTypesafeKey(dir, {}), null)
    clearTypesafeKey(dir)
    assert.equal(loadTypesafeKey(dir, { decryptFn: b => b }), null)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('Shadow 통계 — 비교 가능한 레코드만 일치율 계산', () => {
  const recs = [
    { localDecision: 'pass', jevDecision: 'approve', adminDecision: 'approve' },
    { localDecision: 'pass', jevDecision: 'approve', adminDecision: 'approve' },
    { localDecision: 'pass', jevDecision: 'repair', adminDecision: 'repair' },
    { localDecision: 'pass', jevDecision: 'approve', adminDecision: 'human_review' },
    { localDecision: 'fail', jevDecision: 'approve', adminDecision: 'approve' },
    { localDecision: 'pass', jevDecision: 'approve', adminDecision: '' }
  ]
  const s = shadowStats(recs)
  assert.equal(s.records, 6)
  assert.equal(s.judged, 6)
  assert.equal(s.compared, 5)
  assert.equal(s.agreed, 3, '로컬 실패를 관리자가 승인한 건은 불일치')
  assert.ok(Math.abs(s.agreement - 0.6) < 1e-9)
})

test('자동 승인 게이트 — 50건+ 일치율 충족 전에는 항상 금지', () => {
  const base = { jev: { shadowMode: false, autoApproveEnabled: true, minShadowRecords: 50, minAgreement: 0.8 } }
  const weak = shadowStats([{ localDecision: 'pass', jevDecision: 'approve', adminDecision: 'approve' }])
  assert.equal(autoApproveAllowed(base, weak).allowed, false)

  const strong = shadowStats(Array.from({ length: 50 }, () => ({ localDecision: 'pass', jevDecision: 'approve', adminDecision: 'approve' })))
  assert.equal(autoApproveAllowed(base, strong).allowed, true)

  assert.equal(autoApproveAllowed({ ...base, jev: { ...base.jev, shadowMode: true } }, strong).allowed, false)
  assert.equal(autoApproveAllowed({ ...base, jev: { ...base.jev, autoApproveEnabled: false } }, strong).allowed, false)
})
