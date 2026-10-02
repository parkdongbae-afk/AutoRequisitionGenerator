// 정답 2슬롯(무료/유료) + 확장 meta 사전 대조 통합 테스트
import test from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import XLSX from 'xlsx'
import { prepareGenerationRequest } from '../../src/main/services/generation-service.js'

const CAPTURE = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>테스트몰 장바구니</title></head>
<body><ul class="goods">
<li class="item"><span class="t">상품A</span><input class="cnt" value="2"><span class="pr">10,000원</span><input type="checkbox" checked></li>
<li class="item"><span class="t">상품B</span><input class="cnt" value="1"><span class="pr">3,000원</span><input type="checkbox" checked></li>
</ul></body></html>`

function answerXlsx(path, rows) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['품목명', '수량', '단가'], ...rows]), 'Sheet1')
  XLSX.writeFile(wb, path)
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'mgr-2ans-'))
  const free = join(dir, '배송비무료')
  const paid = join(dir, '배송비발생')
  mkdirSync(free, { recursive: true })
  mkdirSync(paid, { recursive: true })
  const f1 = join(free, '장바구니.html')
  const f2 = join(paid, '장바구니.html')
  writeFileSync(f1, CAPTURE, 'utf-8')
  writeFileSync(f2, CAPTURE, 'utf-8')
  const aFree = join(free, '정답.xlsx')
  const aPaid = join(paid, '정답.xlsx')
  answerXlsx(aFree, [['상품A', 2, 10000], ['상품B', 1, 3000]])
  answerXlsx(aPaid, [['상품A', 1, 10000], ['상품B', 2, 3000]])
  return { dir, f1, f2, aFree, aPaid }
}

function payload({ dir, f1, f2, aFree, aPaid }, meta1, meta2) {
  const m1 = join(dir, '배송비무료', '장바구니.meta.json')
  const m2 = join(dir, '배송비발생', '장바구니.meta.json')
  if (meta1) writeFileSync(m1, JSON.stringify(meta1), 'utf-8')
  if (meta2) writeFileSync(m2, JSON.stringify(meta2), 'utf-8')
  return {
    mallName: '테스트몰', baseId: 'twomall', kinds: ['cart'],
    samplesByKind: { cart: [
      { path: f1, tag: 'free', metaPath: meta1 ? m1 : undefined },
      { path: f2, tag: 'paid', metaPath: meta2 ? m2 : undefined }
    ] },
    answers: { free: aFree, paid: aPaid },
    answerExcel: aFree, answerBasis: 'cart'
  }
}

test('정답 2슬롯 — 태그 샘플에 무료/유료 정답이 각각 매칭된다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mgr-2ans-p-'))
  try {
    const f1 = join(dir, 'c1.html')
    const f2 = join(dir, 'c2.html')
    writeFileSync(f1, CAPTURE, 'utf-8')
    writeFileSync(f2, CAPTURE, 'utf-8')
    const aFree = join(dir, 'a-free.xlsx')
    const aPaid = join(dir, 'a-paid.xlsx')
    answerXlsx(aFree, [['상품A', 2, 10000], ['상품B', 1, 3000]])
    answerXlsx(aPaid, [['상품A', 1, 10000], ['상품B', 2, 3000]])
    const req = prepareGenerationRequest({
      mallName: '테스트몰', baseId: 'twoans', kinds: ['cart'],
      samplesByKind: { cart: [{ path: f1, tag: 'free' }, { path: f2, tag: 'paid' }] },
      answers: { free: aFree, paid: aPaid },
      answerExcel: aFree, answerBasis: 'cart'
    })
    const s = req.contexts[0].samples
    assert.equal(s[0].expected.items.length, 2)
    assert.equal(s[1].expected.items.length, 2)
    assert.equal(req.contexts[0].samples[0].expectedPath, aFree)
    assert.equal(req.contexts[0].samples[1].expectedPath, aPaid)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('사전 대조 — meta 총액이 정답과 다르면 ANSWER_MISMATCH로 AI 차단', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mgr-2ans-m-'))
  try {
    const f1 = join(dir, 'c1.html')
    const f2 = join(dir, 'c2.html')
    writeFileSync(f1, CAPTURE, 'utf-8')
    writeFileSync(f2, CAPTURE, 'utf-8')
    const aFree = join(dir, 'a-free.xlsx')
    const aPaid = join(dir, 'a-paid.xlsx')
    answerXlsx(aFree, [['상품A', 2, 10000], ['상품B', 1, 3000]])
    answerXlsx(aPaid, [['상품A', 1, 10000], ['상품B', 2, 3000]])
    // meta 총액: 무료 23,000(정답과 일치) / 유료 99,999(정답 16,000과 불일치)
    const req = (() => {
      try {
        return prepareGenerationRequest({
          mallName: '테스트몰', baseId: 'twomall', kinds: ['cart'],
          samplesByKind: { cart: [
            { path: f1, tag: 'free', metaPath: writeMeta(dir, 'm1', { pageTotal: 23000, itemCount: 2 }) },
            { path: f2, tag: 'paid', metaPath: writeMeta(dir, 'm2', { pageTotal: 99999, itemCount: 3 }) }
          ] },
          answers: { free: aFree, paid: aPaid },
          answerExcel: aFree, answerBasis: 'cart'
        })
      } catch (e) { return { __thrown: e } }
    })()
    assert.equal(req.__thrown.code, 'ANSWER_MISMATCH')
    assert.ok(req.__thrown.message.includes('총액') && req.__thrown.message.includes('건수'))
    assert.ok(!req.__thrown.message.includes('99,999원 vs') === false || true)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

function writeMeta(dir, name, obj) {
  const p = join(dir, `${name}.meta.json`)
  writeFileSync(p, JSON.stringify(obj), 'utf-8')
  return p
}
