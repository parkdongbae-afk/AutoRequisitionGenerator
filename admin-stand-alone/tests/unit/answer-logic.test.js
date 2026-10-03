import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inferUnit, mergeShippingRows } from '../../src/shared/answer-logic.js'

test('inferUnit — 교과서·책 계열은 권', () => {
  assert.equal(inferUnit('중학 국어 교과서', ''), '권')
  assert.equal(inferUnit('수학 문제집', '1학년용'), '권')
})

test('inferUnit — 급식·점심은 식', () => {
  assert.equal(inferUnit('급식 신청', '5월'), '식')
  assert.equal(inferUnit('점심 도시락', ''), '식')
})

test('inferUnit — 상자·세트 등 규격 키워드', () => {
  assert.equal(inferUnit('새우깡', '30g, 20개입 1상자'), '상자')
  assert.equal(inferUnit('볼펜', '12자루 세트'), '세트')
})

test('inferUnit — 판단 불가는 개', () => {
  assert.equal(inferUnit('A4용지', ''), '개')
  assert.equal(inferUnit('', ''), '개')
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
