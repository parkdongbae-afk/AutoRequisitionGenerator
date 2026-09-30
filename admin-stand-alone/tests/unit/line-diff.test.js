import test from 'node:test'
import assert from 'node:assert'
import { diffLines, diffSummary } from '../../src/shared/line-diff.js'

test('diff — 추가·삭제·같음 판정과 요약', () => {
  const before = '{"a":1,\n"b":2,\n"c":3}'
  const after = '{"a":1,\n"b":22,\n"d":4}'
  const lines = diffLines(before, after, { context: 0 })
  const s = diffSummary(lines)
  assert.equal(s.added, 2)
  assert.equal(s.removed, 2)
  assert.equal(s.changed, true)
  assert.ok(lines.some(l => l.type === 'add' && l.text === '"d":4}'))
  assert.ok(lines.some(l => l.type === 'del' && l.text === '"b":2,'))
})

test('diff — 변경 없음', () => {
  const t = '{"id":"x"}'
  assert.equal(diffSummary(diffLines(t, t)).changed, false)
  assert.equal(diffLines(t, t).every(l => l.type === 'same'), true)
})

test('diff — CRLF 혼용도 동일 라인으로 취급', () => {
  const lines = diffLines('a\r\nb', 'a\nb')
  assert.equal(diffSummary(lines).changed, false)
})

test('diff — 긴 파일은 context 밖 같은 줄을 접는다', () => {
  const before = Array.from({ length: 60 }, (_, i) => `line${i}`).join('\n')
  const after = before.replace('line30', 'CHANGED')
  const lines = diffLines(before, after, { context: 2 })
  assert.ok(lines.some(l => l.type === 'gap'), '접힘 표시가 있어야 한다')
  assert.ok(lines.length < 40, '전체 60줄 이상을 다 출력하지 않는다')
  assert.equal(diffSummary(lines).added, 1)
  assert.equal(diffSummary(lines).removed, 1)
})
