import test from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verifyProject } from '../../src/main/services/verification-service.js'

const OK_RULE = {
  id: 'okmall', name: '올몰', match: ['okmall.com'],
  rowSelector: 'li.item',
  fields: { name: { sel: '.t' }, price: { sel: '.p', regex: '([\\d,]+)' } }
}

function setupRepo(rules, bundle) {
  const repo = mkdtempSync(join(tmpdir(), 'mgr-verify-'))
  const src = join(repo, 'app', 'src', 'main', 'lib', 'rules')
  mkdirSync(src, { recursive: true })
  for (const [name, rule] of Object.entries(rules)) {
    writeFileSync(join(src, name), JSON.stringify(rule, null, 2) + '\n', 'utf-8')
  }
  if (bundle) {
    writeFileSync(join(repo, 'rules.json'), JSON.stringify({
      version: '1.0.8', generatedAt: '2026-10-01T00:00:00.000Z',
      count: bundle.rules.length, rules: bundle.rules
    }, null, 2), 'utf-8')
  }
  return repo
}

test('정상 저장소 — ERROR 0과 PASS 판정', () => {
  const repo = setupRepo({ 'okmall.json': OK_RULE }, { rules: [OK_RULE] })
  try {
    const { results, summary } = verifyProject(repo)
    assert.equal(summary.ERROR, 0, results.filter(r => r.severity === 'ERROR').map(r => r.message).join('; '))
    assert.ok(summary.PASS > 0)
    assert.ok(results.some(r => r.code === 'BUNDLE_IDS_OK'))
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

test('장바구니 checkedOnly 누락 → ERROR(§9.6)', () => {
  const cart = { id: 'badmall-cart', name: '배드몰 장바구니', match: ['badmall.com'], rowSelector: 'li', fields: { name: { sel: '.t' }, price: { sel: '.p' } } }
  const repo = setupRepo({ 'badmall-cart.json': cart }, { rules: [cart] })
  try {
    const { results } = verifyProject(repo)
    const hit = results.find(r => r.code === 'CART_CHECKEDONLY_MISSING')
    assert.ok(hit, 'checkedOnly 누락 ERROR가 있어야 한다')
    assert.equal(hit.severity, 'ERROR')
    assert.equal(hit.ruleId, 'badmall-cart')
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

test('ID 중복·파일명 불일치·JSON 문법 오류', () => {
  const repo = setupRepo({ 'okmall.json': OK_RULE }, { rules: [OK_RULE] })
  try {
    const src = join(repo, 'app', 'src', 'main', 'lib', 'rules')
    writeFileSync(join(src, 'dupe.json'), JSON.stringify(OK_RULE) + '\n', 'utf-8')
    writeFileSync(join(src, 'other.json'), JSON.stringify({ ...OK_RULE, id: 'othername' }) + '\n', 'utf-8')
    writeFileSync(join(src, 'broken.json'), '{"id": broken', 'utf-8')
    const { results } = verifyProject(repo)
    assert.ok(results.some(r => r.code === 'RULE_ID_DUPLICATE' && r.ruleId === 'okmall'))
    assert.ok(results.some(r => r.code === 'RULE_FILENAME_MISMATCH' && r.ruleId === 'othername'))
    assert.ok(results.some(r => r.code === 'RULE_JSON_INVALID'))
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

test('bundle 불일치·count 필드 오류·cart 우선순위(§15.2)', () => {
  const cart = { id: 'cmall-cart', name: '씨몰 장바구니', match: ['cmall.com'], rowSelector: 'li', checkedOnly: { sel: 'input' }, fields: { name: { sel: '.t' }, price: { sel: '.p' } } }
  const base = { id: 'cmall', name: '씨몰', match: ['cmall.com'], rowSelector: 'li', fields: { name: { sel: '.t' }, price: { sel: '.p' } } }
  const repo = setupRepo({ 'cmall.json': base, 'cmall-cart.json': cart }, { rules: [base, cart] })
  try {
    const { results } = verifyProject(repo)
    const orderHit = results.find(r => r.code === 'CART_ORDER_AFTER_BASE')
    assert.ok(orderHit, 'cart가 base보다 뒤면 경고가 나야 한다')
    assert.equal(orderHit.severity, 'WARNING')
    // bundle에 없는 규칙 추가 → BUNDLE_MISSING_RULES
    const extra = { ...OK_RULE, id: 'extramall' }
    writeFileSync(join(repo, 'app', 'src', 'main', 'lib', 'rules', 'extramall.json'), JSON.stringify(extra) + '\n', 'utf-8')
    const { results: r2 } = verifyProject(repo)
    assert.ok(r2.some(r => r.code === 'BUNDLE_MISSING_RULES' && /extramall/.test(r.message)))
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

test('match 중복 → WARNING', () => {
  const a = { ...OK_RULE, id: 'amall', match: ['shared.com'] }
  const b = { ...OK_RULE, id: 'bmall', match: ['shared.com'] }
  const repo = setupRepo({ 'amall.json': a, 'bmall.json': b }, { rules: [a, b] })
  try {
    const { results } = verifyProject(repo)
    const hit = results.find(r => r.code === 'RULE_MATCH_DUPLICATE')
    assert.ok(hit, 'match 중복 경고가 있어야 한다')
    assert.equal(hit.severity, 'WARNING')
  } finally { rmSync(repo, { recursive: true, force: true }) }
})
