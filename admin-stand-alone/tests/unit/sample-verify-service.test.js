import test from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import XLSX from 'xlsx'
import { verifySamples, matchRule } from '../../src/main/services/sample-verify-service.js'

const CAPTURE = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>테스트몰 장바구니</title></head>
<body data-url="https://www.testmall.com/cart">
<ul class="goods">
<li class="item"><span class="t">상품A</span><input class="cnt" value="2"><span class="pr">10,000원</span><input type="checkbox" checked></li>
<li class="item"><span class="t">상품B</span><input class="cnt" value="1"><span class="pr">3,000원</span><input type="checkbox" checked></li>
</ul></body></html>`

const RULE = {
  id: 'testmall-cart', name: '테스트몰 장바구니', match: ['testmall.com'],
  rowSelector: 'li.item', priceIs: 'unit',
  checkedOnly: { sel: 'input[type=checkbox]' },
  fields: {
    name: { sel: '.t' },
    qty: { sel: '.cnt', attr: 'value', regex: '(\\d+)' },
    price: { sel: '.pr', regex: '([\\d,]+)원' }
  }
}

function setup() {
  const repo = mkdtempSync(join(tmpdir(), 'mgr-sv-repo-'))
  const cap = mkdtempSync(join(tmpdir(), 'mgr-sv-cap-'))
  const rulesDir = join(repo, 'app', 'src', 'main', 'lib', 'rules')
  mkdirSync(rulesDir, { recursive: true })
  writeFileSync(join(rulesDir, 'testmall-cart.json'), JSON.stringify(RULE, null, 2), 'utf-8')
  return { repo, cap }
}

test('matchRule — URL cart 힌트로 -cart 규칙 우선', () => {
  const cart = RULE
  const order = { ...RULE, id: 'testmall', match: ['testmall.com'] }
  const hit = matchRule([order, cart], 'https://www.testmall.com/cart', '')
  assert.equal(hit.id, 'testmall-cart')
  assert.equal(matchRule([order, cart], 'https://www.testmall.com/order/confirm', '').id, 'testmall')
  assert.equal(matchRule([order, cart], 'https://other.com/x', ''), null)
})

test('샘플 검증 — 정답 일치 PASS', () => {
  const { repo, cap } = setup()
  try {
    const cartDir = join(cap, 'testmall')
    mkdirSync(cartDir)
    writeFileSync(join(cartDir, '장바구니.html'), CAPTURE, 'utf-8')
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['품목명', '수량', '단가'],
      ['상품A', 2, 10000],
      ['상품B', 1, 3000]
    ]), 'Sheet1')
    XLSX.writeFile(wb, join(cartDir, '정답.xlsx'))
    const r = verifySamples(repo, cap)
    assert.equal(r.scanned, 1)
    assert.equal(r.results[0].verdict, 'PASS')
    assert.equal(r.results[0].ruleId, 'testmall-cart')
    assert.equal(r.results[0].itemCount, 2)
    assert.equal(r.summary.ok, true)
  } finally { rmSync(repo, { recursive: true, force: true }); rmSync(cap, { recursive: true, force: true }) }
})

test('샘플 검증 — 정답 불일치 ERROR·정답 없음 INFO·미매칭 INFO', () => {
  const { repo, cap } = setup()
  try {
    const d1 = join(cap, 'bad')
    mkdirSync(d1)
    writeFileSync(join(d1, '장바구니.html'), CAPTURE, 'utf-8')
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['품목명', '수량', '단가'], ['상품A', 1, 10000], ['상품B', 1, 3000], ['상품C', 1, 500]]), 'Sheet1')
    XLSX.writeFile(wb, join(d1, '정답.xlsx'))
    const d2 = join(cap, 'noanswer')
    mkdirSync(d2)
    writeFileSync(join(d2, '장바구니.html'), CAPTURE, 'utf-8')
    mkdirSync(join(cap, 'unknown'), { recursive: true })
    writeFileSync(join(cap, 'unknown', '페이지.html'), '<html data-url="https://unknown.shop/x"></html>', 'utf-8')
    const r = verifySamples(repo, cap)
    assert.equal(r.scanned, 3)
    const bad = r.results.find(x => x.verdict === 'ERROR')
    assert.ok(bad, '건수 불일치 ERROR 존재')
    assert.ok(/건수 불일치/.test(bad.problems.join('')))
    assert.ok(r.results.some(x => x.verdict === 'INFO' && /정답 Excel 없음/.test(x.problems.join(''))), '정답 없음 INFO')
    assert.ok(r.results.some(x => x.verdict === 'INFO' && /매칭 규칙 없음/.test(x.problems.join(''))), '미매칭 INFO')
    assert.equal(r.summary.ok, false)
  } finally { rmSync(repo, { recursive: true, force: true }); rmSync(cap, { recursive: true, force: true }) }
})
