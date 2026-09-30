import test from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import XLSX from 'xlsx'
import {
  prepareGenerationRequest, runGeneration, applyGenerationResult
} from '../../src/main/services/generation-service.js'

const FIXTURE_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>생성테스트몰</title></head>
<body><ul class="goods">
<li class="item"><span class="t">테스트상품A</span><input class="cnt" value="2"><span class="pr">5,000원</span></li>
<li class="item"><span class="t">테스트상품B</span><input class="cnt" value="1"><span class="pr">3,000원</span></li>
</ul></body></html>`

function writeFixtures() {
  const dir = mkdtempSync(join(tmpdir(), 'mgr-gen-'))
  const samplePath = join(dir, 'sample.html')
  writeFileSync(samplePath, FIXTURE_HTML, 'utf-8')
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['품목명', '수량', '단가'],
    ['테스트상품A', 2, 5000],
    ['테스트상품B', 1, 3000]
  ]), 'Sheet1')
  const xlsPath = join(dir, 'answer.xlsx')
  XLSX.writeFile(wb, xlsPath)
  return { dir, samplePath, xlsPath }
}

function mockAiFor(ctxRuleId) {
  return async () => JSON.stringify({
    id: ctxRuleId,
    name: '생성테스트몰',
    match: ['gen.test'],
    rowSelector: 'li.item',
    priceIs: 'unit',
    fields: {
      name: { sel: '.t' },
      qty: { sel: '.cnt', attr: 'value', regex: '(\\d+)' },
      price: { sel: '.pr', regex: '([\\d,]+)원' }
    },
    shipping: { mode: 'none' }
  })
}

const mockJev = async () => ({
  answers: {
    selector_stable: { probability: 0.9 },
    name_quality: { score: 4, confidence: 0.9 },
    failure_cause: { value: 'no_semantic_problem', confidence: 0.9 },
    deployment_ready: { value: 'approve', confidence: 0.9 }
  }
})

test('입력 검증 — 샘플·정답 누락 시 차단(§7.6)', () => {
  assert.throws(() => prepareGenerationRequest({ mallName: 'x', kinds: ['order'], samplesByKind: { order: [] }, answerExcel: null }),
    /샘플/)
  assert.throws(() => prepareGenerationRequest({ mallName: 'x', kinds: [], samplesByKind: {}, answerExcel: 'a' }),
    /하나 이상/)
})

test('전처리 — 정답 기준 화면만 건수·총액 비교 대상(§7.6)', () => {
  const { dir, samplePath, xlsPath } = writeFixtures()
  try {
    const req = prepareGenerationRequest({
      mallName: '생성테스트몰', baseId: 'gentest', kinds: ['order', 'cart'],
      samplesByKind: { order: [samplePath], cart: [samplePath] },
      answerExcel: xlsPath, answerBasis: 'order'
    })
    assert.deepEqual(req.contexts.map(c => c.ruleId), ['gentest', 'gentest-cart'])
    const order = req.contexts.find(c => c.kind === 'order')
    const cart = req.contexts.find(c => c.kind === 'cart')
    assert.equal(order.expected.items.length, 2)
    assert.equal(cart.expected, null)
    assert.equal(req.contexts[0].samples[0].html.includes('테스트상품A'), true)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('파이프라인 연결 — mock AI·Jev로 승인까지 + 임시 저장소 적용(§14·§13)', async () => {
  const { dir, samplePath, xlsPath } = writeFixtures()
  try {
    const req = prepareGenerationRequest({
      mallName: '생성테스트몰', baseId: 'gentest2', kinds: ['order'],
      samplesByKind: { order: [samplePath] },
      answerExcel: xlsPath, answerBasis: 'order'
    })
    const progress = []
    const gen = await runGeneration(req, {
      callAi: mockAiFor('gentest2'),
      callJev: mockJev,
      onProgress: m => progress.push(m)
    })
    assert.equal(gen.results.length, 1)
    assert.equal(gen.results[0].status, 'approved')
    assert.equal(gen.results[0].decision.action, 'approve')
    assert.equal(gen.results[0].deterministic.itemCount, 2)
    assert.ok(progress.some(p => /승인|결과/.test(p.message) || p.message))

    const repo = join(dir, 'repo')
    const applied = await applyGenerationResult(repo, gen, { apply: true, rebuildBundle: false })
    assert.equal(applied.applied.length, 1)
    assert.ok(existsSync(join(repo, 'app', 'src', 'main', 'lib', 'rules', 'gentest2.json')))
    assert.ok(existsSync(join(repo, 'app', 'analysis', 'rules', 'gentest2.json')))
    assert.equal(applied.errors.length, 0)

    const notApplied = await applyGenerationResult(repo, gen, { apply: false })
    assert.equal(notApplied.applied.length, 0)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
