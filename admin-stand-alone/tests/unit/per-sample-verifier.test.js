import test from 'node:test'
import assert from 'node:assert'
import { verifyRule } from '../../src/main/services/rule-verifier.js'

const RULE = {
  id: 'mall-cart', name: '몰 장바구니', match: ['mall.com'],
  rowSelector: 'li.item', priceIs: 'unit',
  checkedOnly: { sel: 'input[type=checkbox]' },
  fields: { name: { sel: '.t' }, qty: { sel: '.cnt', attr: 'value', regex: '(\\d+)' }, price: { sel: '.pr', regex: '([\\d,]+)원' } }
}

const cap = (name, qty, price) =>
  `<ul><li class="item"><span class="t">${name}</span><input class="cnt" value="${qty}"><span class="pr">${price.toLocaleString('ko-KR')}원</span><input type="checkbox" checked></li></ul>`

test('캡처별 정답 — 서로 다른 두 캡처가 각자 정답과 일치하면 통과(§10-A.8)', () => {
  const r = verifyRule({
    rule: RULE,
    samples: [
      { label: '배송비 무료', html: cap('상품A', 2, 10000), expected: { items: [{ name: '상품A', qty: 2, unitPrice: 10000 }] } },
      { label: '배송비 발생', html: cap('상품B', 1, 3000), expected: { items: [{ name: '상품B', qty: 1, unitPrice: 3000 }] } }
    ],
    expected: {}
  })
  assert.equal(r.countMatches, true)
  assert.equal(r.totalWithinTolerance, true)
  assert.equal(r.perSample.length, 2)
  assert.ok(r.perSample.every(p => p.countOk && p.totalOk))
})

test('캡처별 정답 — 한 캡처라도 불일치면 실패', () => {
  const r = verifyRule({
    rule: RULE,
    samples: [
      { label: '무료', html: cap('상품A', 2, 10000), expected: { items: [{ name: '상품A', qty: 2, unitPrice: 10000 }] } },
      { label: '발생', html: cap('상품B', 1, 3000), expected: { items: [{ name: '상품B', qty: 1, unitPrice: 5000 }] } }
    ],
    expected: {}
  })
  assert.equal(r.countMatches, false)
  assert.equal(r.perSample[1].countOk, true)
  assert.equal(r.perSample[1].totalOk, false)
})

test('기존 계약 유지 — 전역 정답(sum) 방식은 그대로 동작', () => {
  const r = verifyRule({
    rule: RULE,
    samples: [
      { label: 's1', html: cap('상품A', 1, 5000) },
      { label: 's2', html: cap('상품B', 1, 5000) }
    ],
    expected: { items: [{ name: '상품A', qty: 1, unitPrice: 5000 }, { name: '상품B', qty: 1, unitPrice: 5000 }] }
  })
  assert.equal(r.countMatches, true, '두 샘플 합 2건 = 정답 2건')
  assert.equal(r.perSample.length, 0)
})
