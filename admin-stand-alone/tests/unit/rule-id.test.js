import test from 'node:test'
import assert from 'node:assert'
import { suggestBaseId, ruleIdFor } from '../../src/shared/rule-id.js'

test('base ID 파생 — 영문 정규화와 -cart 접미 제거', () => {
  assert.equal(suggestBaseId('Some Mall'), 'some-mall')
  assert.equal(suggestBaseId('gmarket-cart'), 'gmarket')
  assert.equal(suggestBaseId('11St!! Street'), '11st-street')
})

test('base ID 파생 — 비ASCII 이름은 시계열 폴백', () => {
  const id = suggestBaseId('어떤몰')
  assert.match(id, /^mall-\d+$/)
})

test('종류별 ID — cart는 -cart 접미, order는 base 그대로', () => {
  assert.equal(ruleIdFor('somemall', 'cart'), 'somemall-cart')
  assert.equal(ruleIdFor('somemall', 'order'), 'somemall')
  assert.equal(ruleIdFor('gmarket-cart', 'cart'), 'gmarket-cart')
})
