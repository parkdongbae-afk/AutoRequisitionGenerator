import test from 'node:test'
import assert from 'node:assert'
import { createLogStore, maskSecrets, LOG_MAX } from '../../src/main/services/log-service.js'

test('링 버퍼 — max 초과 시 오래된 항목부터 버린다(§7.9)', () => {
  const store = createLogStore({ max: 5 })
  for (let i = 0; i < 8; i++) store.append({ message: `m${i}`, level: 'info', step: 'test' })
  const all = store.all()
  assert.equal(all.length, 5)
  assert.equal(all[0].message, 'm3')
  assert.equal(all[4].message, 'm7')
  assert.ok(LOG_MAX >= 500)
})

test('레벨 필터·카운트·내보내기 형식', () => {
  const store = createLogStore()
  store.append({ level: 'info', step: 'generate', message: '후보 생성' })
  store.append({ level: 'warn', step: 'git', message: 'push 실패' })
  store.append({ level: 'error', step: 'delete', message: '삭제 실패' })
  assert.equal(store.list({ level: 'warn' }).length, 1)
  assert.equal(store.list({ level: 'ALL' }).length, 3)
  assert.equal(store.counts().error, 1)
  assert.equal(store.counts().warn, 1)
  const text = store.exportText({ level: 'error' })
  assert.match(text, /\[ERROR\] \(delete\) 삭제 실패/)
  assert.equal(store.exportText({ level: 'info' }).includes('push 실패'), false)
})

test('maskSecrets — Authorization·Key 흔적 마스킹(§7.9 이중 방어)', () => {
  const masked = maskSecrets('Authorization: Bearer sk-abcdef12345678901234 응답')
  assert.ok(!masked.includes('sk-abcdef12345678901234'))
  assert.ok(masked.includes('[마스킹]'))
  assert.equal(maskSecrets('정상 메시지'), '정상 메시지')
})
