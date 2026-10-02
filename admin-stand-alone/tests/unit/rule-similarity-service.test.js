import test from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { profileCapture, scoreRuleSimilarity, pickSimilarRules, loadRepoRules } from '../../src/main/services/rule-similarity-service.js'

// 장바구니형 캡처 — 체크박스·리스트·옵션·배송비 텍스트 포함
const CART_CAPTURE = `<html><body data-url="https://www.newmall.com/cart">
<ul class="goods-list"><li class="cart-item">
<span class="product-name">상품A</span><input class="qty" value="2"><span class="price">10,000원</span>
<input type="checkbox" checked><div class="option">사이즈 선택</div>
</li></ul><div class="shipping">배송비 2,500원</div></body></html>`

const RULES = [
  { id: 'gmarket-cart', name: '지마켓 장바구니', rowSelector: 'li.cart-item', checkedOnly: { sel: 'input[type=checkbox]' }, optionRows: { sel: 'tr.option' }, priceIs: 'lineTotal', fields: { name: { sel: '.product-name' }, qty: { sel: '.qty' }, price: { sel: '.price' } }, match: ['gmarket.com'] },
  { id: 'tablemall', name: '테이블몰', rowSelector: 'tr.item', checkedOnly: { sel: 'input.ck' }, fields: { name: { sel: 'td.n' }, price: { sel: 'td.p' } }, match: ['tablemall.com'] },
  { id: 'plain-order', name: '일반 주문서', rowSelector: 'div.order-row', fields: { name: { sel: '.n' }, price: { sel: '.p' } }, match: ['plain.com'] }
]

test('프로파일 — 체크박스·리스트·옵션·배송비 힌트 도출', () => {
  const p = profileCapture(CART_CAPTURE, 'https://www.newmall.com/cart')
  assert.equal(p.hasCheckbox, true)
  assert.equal(p.tableish, false)
  assert.equal(p.listish, true)
  assert.equal(p.optionHint, true)
  assert.equal(p.shippingHint, true)
  assert.equal(p.domain, 'www.newmall.com'.replace(/^www\./, ''))
  assert.ok(p.classes.has('cart-item'))
})

test('점수화 — 장바구니형 규칙이 주문서형·테이블형보다 높다', () => {
  const p = profileCapture(CART_CAPTURE, 'https://www.newmall.com/cart')
  const [gmarket, table, plain] = RULES.map(r => ({ id: r.id, ...scoreRuleSimilarity(r, p) }))
  assert.ok(gmarket.score > table.score, `지마켓 ${gmarket.score} > 테이블 ${table.score}`)
  assert.ok(gmarket.score >= 8, '체크박스+리스트 일치로 임계값 통과')
  assert.ok(gmarket.reasons.some(r => /체크박스/.test(r)))
  assert.ok(plain.score < gmarket.score)
})

test('선정 — 상위 3개 이내·임계값 미달 제외', () => {
  const p = profileCapture(CART_CAPTURE, 'https://www.newmall.com/cart')
  const picked = pickSimilarRules(RULES, p, { limit: 3 })
  assert.equal(picked[0].id, 'gmarket-cart')
  assert.ok(picked.length <= 3)
  assert.ok(picked.every(x => x.score >= 8))
})

test('저장소 규칙 로드 — meta.json 제외·파싱 실패 무시', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mgr-sim-'))
  try {
    const rulesDir = join(dir, 'app', 'src', 'main', 'lib', 'rules')
    mkdirSync(rulesDir, { recursive: true })
    writeFileSync(join(rulesDir, 'a.json'), JSON.stringify(RULES[0]), 'utf-8')
    writeFileSync(join(rulesDir, 'meta.json'), '{}', 'utf-8')
    writeFileSync(join(rulesDir, 'broken.json'), '{', 'utf-8')
    assert.equal(loadRepoRules(dir).length, 1)
    assert.equal(loadRepoRules(null).length, 0)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
