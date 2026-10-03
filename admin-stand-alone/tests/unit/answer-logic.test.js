import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveSpec, answerUnit, mergeShippingRows } from '../../src/shared/answer-logic.js'

test('deriveSpec — 옵션 원문에서 규격 토큰 추출(app/spec.js 방식)', () => {
  const s = deriveSpec('새우깡', '90g, 20개입 1상자')
  assert.ok(/20개입/.test(s), '개입 토큰 포함: ' + s)
  assert.ok(/1상자/.test(s), '상자 토큰 포함: ' + s)
})

test('deriveSpec — 용량 토큰', () => {
  const s = deriveSpec('생수', '500ml x 20개입')
  assert.ok(/500ml/.test(s), 'ml 토큰 포함: ' + s)
})

test('deriveSpec — 용지 규격 토큰도 추출', () => {
  assert.equal(deriveSpec('A4용지', ''), 'A4')
})

test('deriveSpec — 토큰 없는 품목은 빈 문자열', () => {
  assert.equal(deriveSpec('포스트잇', ''), '')
})

test('answerUnit — 배송비 식, 품목 개(docstore 방식)', () => {
  assert.equal(answerUnit(true), '식')
  assert.equal(answerUnit(false), '개')
})

test('mergeShippingRows — 같은 단가만 합산', () => {
  const merged = mergeShippingRows([
    { qty: 1, unitPrice: 3000 },
    { qty: 1, unitPrice: 3000 },
    { qty: 1, unitPrice: 2500 }
  ])
  assert.deepEqual(merged, [
    { qty: 1, unitPrice: 2500 },
    { qty: 2, unitPrice: 3000 }
  ])
})

test('mergeShippingRows — 빈 입력', () => {
  assert.deepEqual(mergeShippingRows([]), [])
  assert.deepEqual(mergeShippingRows(null), [])
})
