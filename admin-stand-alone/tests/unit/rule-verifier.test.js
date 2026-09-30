// rule-verifier 단위 테스트 (JEV.MD §12 결과 계약)
const { verifyRule } = require('../../src/main/services/rule-verifier.js')

let fail = 0
function eq(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (ok ? '' : ` actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`))
  if (!ok) fail++
}

const html = `<table>
<tr class="item"><td class="n">상품 A</td><td class="q"><input value="2"></td><td class="p">20,000</td></tr>
<tr class="item"><td class="n">상품 B</td><td class="q"><input value="1"></td><td class="p">32,000</td></tr>
</table>`
const samples = [{ label: '주문서 화면', html }]
const expected = { items: [{ name: '상품 A', qty: 2, unitPrice: 10000 }, { name: '상품 B', qty: 1, unitPrice: 32000 }] }
const rule = {
  id: 'test-cart', name: '테스트 장바구니', match: ['example.com'], rowSelector: 'tr.item', priceIs: 'lineTotal',
  checkedOnly: { sel: 'input' },
  fields: { name: { sel: 'td.n' }, qty: { sel: '.q input', attr: 'value' }, price: { sel: 'td.p', regex: '([\\d,]+)' } },
  shipping: { mode: 'none' }
}

const v = verifyRule({ rule, samples, expected })
eq('schemaValid', v.schemaValid, true)
eq('extractionSucceeded', v.extractionSucceeded, true)
eq('itemCount', v.itemCount, 2)
eq('itemCountExpected', v.itemCountExpected, 2)
eq('countMatches', v.countMatches, true)
eq('subtotal (20,000+32,000)', v.subtotal, 52000)
eq('subtotalExpected', v.subtotalExpected, 52000)
eq('totalWithinTolerance', v.totalWithinTolerance, true)
eq('checkedOnlyValid (cart+checkedOnly)', v.checkedOnlyValid, true)
eq('diagnostics.rowSelector 매칭', v.diagnostics.selectorMatchCounts.rowSelector, 2)

// 총액 불일치 케이스
const v2 = verifyRule({ rule, samples, expected: { items: [{ name: '상품 A', qty: 2, unitPrice: 99999 }, { name: '상품 B', qty: 1, unitPrice: 99999 }] } })
eq('총액 불일치 → totalWithinTolerance false', v2.totalWithinTolerance, false)

// 스키마 오류 케이스
const v3 = verifyRule({ rule: { id: 'x' }, samples, expected })
eq('스키마 오류 → schemaValid false', v3.schemaValid, false)
eq('스키마 오류 → errors 있음', v3.errors.length > 0, true)

// 장바구니 규칙에 checkedOnly 누락 → checkedOnlyValid false
const { checkedOnly, ...noChecked } = rule
const v4 = verifyRule({ rule: noChecked, samples, expected })
eq('cart 규칙 checkedOnly 누락 → false', v4.checkedOnlyValid, false)
check('checkedOnly 경고 존재', v4.warnings.some(w => w.includes('checkedOnly')))

function check(name, cond) {
  const ok = !!cond
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name)
  if (!ok) fail++
}

console.log(fail === 0 ? 'ALL PASS' : `FAIL ${fail}건`)
process.exit(fail ? 1 : 0)
