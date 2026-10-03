// 아인몰 실측 2단계 — 실제 GLM(opencode 브리지) + 실제 Jev로 규칙 생성 (AI 호출 포함, 수 분 소요)
import { scanCaptureFolder } from '../src/main/services/sample-folder-service.js'
import { prepareGenerationRequest, runGeneration, applyGenerationResult } from '../src/main/services/generation-service.js'
import fs from 'node:fs'

const DIR = 'C:/Users/Park/Desktop/Automatic_generation_of_approval_requests_html/Check/아인몰'
const REPO = 'C:/Users/Park/Desktop/Automatic_generation_of_approval_requests_html'
const scan = scanCaptureFolder(DIR)

const payload = {
  mallName: '아인몰', baseId: 'ainmall', kinds: ['order', 'cart'],
  samplesByKind: { order: scan.captures.filter(c => c.kind === 'order'), cart: scan.captures.filter(c => c.kind === 'cart') },
  answers: {
    free: scan.answers.find(p => /무료/.test(p)) || null,
    paid: scan.answers.find(p => /발생|유료/.test(p)) || null
  },
  answerExcel: scan.answers[0], answerBasis: 'common',
  model: '', maxRepair: 2
}

const out = { startedAt: new Date().toISOString(), progress: [], results: null, error: null }
const flush = () => fs.writeFileSync('analysis/ainmall-out.json', JSON.stringify(out, null, 1), 'utf-8')

try {
  const req = prepareGenerationRequest(payload, { repoRoot: REPO })
  const gen = await runGeneration(req, {
    maxRepair: 2,
    repoRoot: REPO,
    onProgress: m => { out.progress.push(`${m.kind || '-'}] ${m.message}`); flush() }
  })
  out.results = gen.results.map(r => ({
    kind: r.kind, ruleId: r.ruleId, status: r.status,
    decision: r.decision,
    itemCount: r.deterministic && r.deterministic.itemCount,
    subtotal: r.deterministic && r.deterministic.subtotal,
    perSample: r.deterministic && r.deterministic.perSample,
    repairHistory: r.repairHistory,
    rule: r.rule || null
  }))
  out.finishedAt = new Date().toISOString()
  flush()
  console.log('DONE')
} catch (e) {
  out.error = String(e && e.message || e)
  flush()
  console.log('ERROR:', out.error)
}
