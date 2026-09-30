import test from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  openMappingSample, closeSample, buildViewerHtml, serveSampleRequest,
  assembleMappingRule, previewMappingExtraction
} from '../../src/main/services/mapping-service.js'

const FIXTURE = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>매핑테스트</title>
<script src="https://cdn.example.com/evil.js"></script><script>alert(1)</script></head>
<body><ul class="goods">
<li class="item"><span class="t">상품A</span><input class="cnt" value="2"><span class="pr">5,000원</span><input type="checkbox" class="ck"></li>
<li class="item"><span class="t">상품B</span><input class="cnt" value="1"><span class="pr">3,000원</span><input type="checkbox" class="ck"></li>
</ul></body></html>`

function openFixture(dir) {
  const p = join(dir, 'sample.html')
  writeFileSync(p, FIXTURE, 'utf-8')
  return openMappingSample(p)
}

test('뷰어 HTML — 원문 스크립트 제거·CSP 주입·피커만 주입', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mgr-map-'))
  try {
    const opened = openFixture(dir)
    const plain = buildViewerHtml(opened.token, { picker: false })
    assert.ok(!/<script/i.test(plain), '피커 없이는 script 태그가 없어야 한다')
    assert.ok(plain.includes('Content-Security-Policy'))
    const withPicker = buildViewerHtml(opened.token, { picker: true })
    assert.ok(withPicker.includes('picker-select'))
    assert.equal((withPicker.match(/<script/gi) || []).length, 1)
    closeSample(opened.token)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('프로토콜 서빙 — 문서·404', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mgr-map2-'))
  try {
    const opened = openFixture(dir)
    const doc = serveSampleRequest(opened.token, new URL(`admin-sample://${opened.token}/?picker=1`))
    assert.equal(doc.contentType, 'text/html; charset=utf-8')
    assert.ok(doc.data.includes('매핑테스트'))
    const missing = serveSampleRequest('no-such-token', new URL('admin-sample://no-such-token/'))
    assert.equal(missing, null)
    closeSample(opened.token)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('규칙 조립 — 필수 선택 검증과 장바구니 checkedOnly 강제', () => {
  const base = {
    picks: { row: { selector: 'li.item' }, name: { selector: 'span.t' }, price: { selector: 'span.pr' } },
    fieldSamples: {},
    meta: { ruleId: 'testmall', name: '테스트몰', match: 'testmall.com', isCart: false }
  }
  const ok = assembleMappingRule(base)
  assert.ok(ok.rule)
  assert.equal(ok.rule.rowSelector, 'li.item')
  assert.equal(ok.rule.shipping.mode, 'none')
  assert.ok(!ok.rule.checkedOnly)

  const cartNoCheck = assembleMappingRule({ ...base, meta: { ...base.meta, isCart: true } })
  assert.ok(cartNoCheck.error && /checkedOnly/.test(cartNoCheck.error))

  const cartOk = assembleMappingRule({
    ...base,
    picks: { ...base.picks, checkedOnly: { selector: 'input.ck' } },
    meta: { ...base.meta, isCart: true }
  })
  assert.equal(cartOk.rule.checkedOnly.sel, 'input.ck')

  const bad = assembleMappingRule({ ...base, picks: { row: base.picks.row } })
  assert.ok(bad.error)

  const badId = assembleMappingRule({ ...base, meta: { ...base.meta, ruleId: '한글ID!' } })
  assert.ok(badId.error && /ID 형식/.test(badId.error))
})

test('규칙 조립 — 2샘플 공통 선택자 도출(nth 제거)', () => {
  const ok = assembleMappingRule({
    picks: { row: { selector: 'li.item' }, name: { selector: 'span.t' }, price: { selector: 'span.pr' } },
    fieldSamples: { name: [{ selector: 'li:nth-of-type(1) > div > span.t:nth-of-type(1)' }, { selector: 'li:nth-of-type(2) > div > span.t:nth-of-type(1)' }] },
    meta: { ruleId: 'twomall', name: '둘몰', match: 'two.com', isCart: false }
  })
  assert.equal(ok.rule.fields.name.sel, 'li > div > span.t')
})

test('미리보기 추출 — 조립 규칙으로 실제 추출(input qty는 attr:value 자동 지정)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mgr-map3-'))
  try {
    const opened = openFixture(dir)
    const rule = assembleMappingRule({
      picks: {
        row: { selector: 'li.item' }, name: { selector: 'span.t' },
        price: { selector: 'span.pr' }, qty: { selector: 'input.cnt', isInput: true }
      },
      fieldSamples: {},
      meta: { ruleId: 'prevmall', name: '미리몰', match: 'prev.com', isCart: false }
    }).rule
    assert.equal(rule.fields.qty.attr, 'value')
    const res = previewMappingExtraction({ token: opened.token, rule })
    assert.equal(res.count, 2)
    assert.equal(res.items[0].name, '상품A')
    assert.equal(res.items[0].qty, 2)
    closeSample(opened.token)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
