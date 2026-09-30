import test from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createPlan, previewTransaction, validatePlan, applyTransaction,
  listTransactions, rollbackTransaction
} from '../../src/main/services/transaction-service.js'

function setup() {
  const userData = mkdtempSync(join(tmpdir(), 'mgr-tx-u-'))
  const repo = mkdtempSync(join(tmpdir(), 'mgr-tx-r-'))
  return { userData, repo }
}

test('적용 — 신규 파일 생성과 이력 기록', () => {
  const { userData, repo } = setup()
  try {
    const target = join(repo, 'app', 'src', 'main', 'lib', 'rules', 'newmall.json')
    const plan = createPlan([{ path: target, content: '{"id":"newmall"}\n' }])
    const res = applyTransaction(userData, plan)
    assert.equal(res.ok, true)
    assert.equal(readFileSync(target, 'utf-8'), '{"id":"newmall"}\n')
    const list = listTransactions(userData)
    assert.equal(list.length, 1)
    assert.equal(list[0].status, 'applied')
  } finally { rmSync(userData, { recursive: true, force: true }); rmSync(repo, { recursive: true, force: true }) }
})

test('검증 차단 — 깨진 JSON은 파일을 건드리지 않는다(§13.2 5단계)', () => {
  const { userData, repo } = setup()
  try {
    const existing = join(repo, 'exist.json')
    writeFileSync(existing, '{"id":"exist"}', 'utf-8')
    const plan = createPlan([
      { path: existing, content: '{"id": broken' },
      { path: join(repo, 'other.json'), content: 'ok' }
    ])
    const res = applyTransaction(userData, plan)
    assert.equal(res.ok, false)
    assert.equal(res.status, 'validation_blocked')
    assert.equal(readFileSync(existing, 'utf-8'), '{"id":"exist"}')
    assert.equal(existsSync(join(repo, 'other.json')), false)
  } finally { rmSync(userData, { recursive: true, force: true }); rmSync(repo, { recursive: true, force: true }) }
})

test('쓰기 실패 후 자동 롤백 — 두 번째 파일 실패 시 첫 파일 복구(§13.2 11단계)', () => {
  const { userData, repo } = setup()
  try {
    const first = join(repo, 'first.json')
    writeFileSync(first, '{"v":1}', 'utf-8')
    const blockedDir = join(repo, 'blocked')
    mkdirSync(blockedDir)
    const second = join(blockedDir, 'second.json')
    const plan = createPlan([
      { path: first, content: '{"v":2}' },
      { path: second, content: '{"a":1}' }
    ])
    const res = applyTransaction(userData, plan, {
      postValidate: () => { throw new Error('의도된 적용 후 검증 실패') }
    })
    assert.equal(res.ok, false)
    assert.equal(res.status, 'rolled_back')
    assert.equal(readFileSync(first, 'utf-8'), '{"v":1}')
    assert.equal(existsSync(second), false)
  } finally { rmSync(userData, { recursive: true, force: true }); rmSync(repo, { recursive: true, force: true }) }
})

test('되돌리기 — 수정은 원본 복원, 생성은 삭제(§29.3)', () => {
  const { userData, repo } = setup()
  try {
    const modified = join(repo, 'mod.json')
    writeFileSync(modified, '{"v":1}', 'utf-8')
    const created = join(repo, 'new.json')
    const res1 = applyTransaction(userData, createPlan([
      { path: modified, content: '{"v":2}' },
      { path: created, content: '{}' }
    ]))
    assert.equal(res1.ok, true)
    const rb = rollbackTransaction(userData, res1.id)
    assert.equal(rb.ok, true)
    assert.equal(readFileSync(modified, 'utf-8'), '{"v":1}')
    assert.equal(existsSync(created), false)
    assert.equal(rollbackTransaction(userData, res1.id).ok, false, '이미 되돌린 트랜잭션은 재되돌리기 불가')
  } finally { rmSync(userData, { recursive: true, force: true }); rmSync(repo, { recursive: true, force: true }) }
})

test('preview·validate — 순수 조회는 파일을 변경하지 않는다', () => {
  const { userData, repo } = setup()
  try {
    const existing = join(repo, 'p.json')
    writeFileSync(existing, '{}', 'utf-8')
    const plan = createPlan([
      { path: existing, content: '{"a":1}' },
      { path: join(repo, 'x.json'), content: null }
    ])
    const pv = previewTransaction(plan)
    assert.deepEqual(pv.map(p => p.action), ['modify', 'delete'])
    assert.equal(validatePlan(plan).ok, true)
    assert.equal(existsSync(existing), true)
    assert.equal(existsSync(join(repo, 'x.json')), false)
    assert.throws(() => createPlan([]), /변경 항목/)
  } finally { rmSync(userData, { recursive: true, force: true }); rmSync(repo, { recursive: true, force: true }) }
})
