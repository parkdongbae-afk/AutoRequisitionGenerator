// 폴더 불러오기 payload — 다중 샘플·캡처별 정답이 prepare와 파이프라인까지 통과하는지 검증
import test from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import XLSX from 'xlsx'
import { prepareGenerationRequest, runGeneration, applyGenerationResult } from '../../src/main/services/generation-service.js'

const CAPTURE = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>테스트몰 장바구니</title></head>
<body><ul class="goods">
<li class="item"><span class="t">상품A</span><input class="cnt" value="2"><span class="pr">10,000원</span><input type="checkbox" checked></li>
<li class="item"><span class="t">상품B</span><input class="cnt" value="1"><span class="pr">3,000원</span><input type="checkbox" checked></li>
</ul></body></html>`

function answerXlsx(path) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['품목명', '수량', '단가'],
    ['상품A', 2, 10000],
    ['상품B', 1, 3000]
  ]), 'Sheet1')
  XLSX.writeFile(wb, path)
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'mgr-folder-'))
  const free = join(dir, '배송비무료')
  const paid = join(dir, '배송비발생')
  mkdirSync(free, { recursive: true })
  mkdirSync(paid, { recursive: true })
  const f1 = join(free, '장바구니.html')
  const f2 = join(paid, '장바구니 2.html')
  writeFileSync(f1, CAPTURE, 'utf-8')
  writeFileSync(f2, CAPTURE, 'utf-8')
  const a1 = join(free, '정답.xlsx')
  const a2 = join(paid, '정답.xlsx')
  answerXlsx(a1)
  answerXlsx(a2)
  const rule = {
    id: 'foldtest-cart', name: '폴더몰 장바구니', match: ['fold.test'],
    rowSelector: 'li.item', priceIs: 'unit', checkedOnly: { sel: 'input[type=checkbox]' },
    fields: { name: { sel: '.t' }, qty: { sel: '.cnt', attr: 'value', regex: '(\\d+)' }, price: { sel: '.pr', regex: '([\\d,]+)원' } },
    shipping: { mode: 'none' }
  }
  return { dir, f1, f2, a1, a2, rule }
}

const mockJev = async () => ({
  answers: {
    selector_stable: { probability: 0.9 },
    name_quality: { score: 4, confidence: 0.9 },
    failure_cause: { value: 'no_semantic_problem', confidence: 0.9 },
    deployment_ready: { value: 'approve', confidence: 0.9 }
  }
})

test('폴더 payload — 캡처별 정답으로 2샘플 교차 검증 승인까지(§10-A.8)', async () => {
  const { dir, f1, f2, a1, a2, rule } = setup()
  try {
    const req = prepareGenerationRequest({
      mallName: '폴더몰', baseId: 'foldtest', kinds: ['cart'],
      samplesByKind: { cart: [{ path: f1, answerPath: a1, tag: 'free' }, { path: f2, answerPath: a2, tag: 'paid' }] },
      answerExcel: a1, answerBasis: 'cart'
    })
    const ctx = req.contexts[0]
    assert.equal(ctx.samples.length, 2)
    assert.equal(ctx.samples[0].label, '샘플1 (배송비 무료)')
    assert.equal(ctx.samples[1].label, '샘플2 (배송비 발생)')
    assert.ok(ctx.samples[0].expected && ctx.samples[1].expected, '캡처별 정답 부착')
    assert.equal(ctx.promptSamples.length, 2)
    assert.ok(ctx.promptAnswer.items.every(it => it.sample), '통합 정답에 샘플 라벨이 붙는다')

    const progress = []
    const gen = await runGeneration(req, {
      callAi: async () => JSON.stringify(rule),
      callJev: mockJev,
      onProgress: m => progress.push(m)
    })
    assert.equal(gen.results[0].status, 'approved')
    assert.equal(gen.results[0].deterministic.itemCount, 4, '두 캡처 합계 4건')
    assert.equal(gen.results[0].deterministic.perSample.length, 2)
    assert.ok(gen.results[0].deterministic.perSample.every(p => p.countOk && p.totalOk))

    const repo = join(dir, 'repo')
    const uData = join(dir, 'userdata')
    const applied = await applyGenerationResult(repo, gen, { apply: true, userDataDir: uData })
    assert.equal(applied.applied.length, 1)
    assert.ok(existsSync(join(repo, 'app', 'src', 'main', 'lib', 'rules', 'foldtest-cart.json')))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
