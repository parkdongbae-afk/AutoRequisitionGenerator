import test from 'node:test'
import assert from 'node:assert'
import { diagnosePrices, verifyRule } from '../../src/main/services/rule-verifier.js'

test('가격 진단 — 부가세(1.1배) 일관 비율 진단', () => {
  const got = [{ unitPrice: 8000 }, { unitPrice: 8000 }, { unitPrice: 8000 }]
  const ans = [{ unitPrice: 8800 }, { unitPrice: 8800 }, { unitPrice: 8800 }]
  const d = diagnosePrices(got, ans)
  assert.ok(d, '진단이 나와야 한다')
  assert.equal(d.medianRatio, 1.1)
  assert.ok(d.message.includes('정답 Excel'))
})

test('가격 진단 — 정확 일치면 진단 없음', () => {
  const got = [{ unitPrice: 8000 }, { unitPrice: 8000 }]
  const ans = [{ unitPrice: 8000 }, { unitPrice: 8000 }]
  assert.equal(diagnosePrices(got, ans), null)
})

test('가격 진단 — 건수 불일치면 진단하지 않는다', () => {
  assert.equal(diagnosePrices([{ unitPrice: 8000 }], [{ unitPrice: 8000 }, { unitPrice: 8000 }]), null)
})

test('가격 진단 — 단가 0이 섞이면 진단하지 않는다', () => {
  assert.equal(diagnosePrices([{ unitPrice: 0 }, { unitPrice: 8000 }], [{ unitPrice: 8000 }, { unitPrice: 8000 }]), null)
})

test('verifyRule — 건수 일치·총액 1.1배 불일치에 진단 첨부', () => {
  const rule = {
    id: 'mall-cart', name: '몰', match: ['mall.com'], rowSelector: 'li.item', priceIs: 'unit',
    checkedOnly: { sel: 'input' },
    fields: { name: { sel: '.t' }, qty: { sel: '.cnt', attr: 'value', regex: '(\\d+)' }, price: { sel: '.pr', regex: '([\\d,]+)' } }
  }
  const html = '<ul><li class="item"><span class="t">상품</span><input class="cnt" value="2"><span class="pr">17,600원</span><input type="checkbox" checked></li></ul>'
  const r = verifyRule({
    rule, samples: [{ label: '배송비 무료', html }],
    expected: { items: [{ name: '상품', qty: 2, unitPrice: 16000 }] }
  })
  assert.equal(r.countMatches, true)
  assert.equal(r.totalWithinTolerance, false, '1.1배 총액 불일치')
  assert.ok(r.priceDiagnosis, '진단이 첨부된다')
  assert.equal(r.priceDiagnosis.medianRatio, 0.91, '정답 = 추출 × 0.91 (약 10% 낮음)')
  assert.ok(r.priceDiagnosis.message.includes('정답 Excel'))
})
