// 아인몰 실측 1단계 — 스캔·정답 파싱·prepare 점검 (AI 호출 없음)
import { scanCaptureFolder, summarizeScan } from '../src/main/services/sample-folder-service.js'
import { prepareGenerationRequest } from '../src/main/services/generation-service.js'
import { answerSummary } from '../../app/src/main/lib/admin-text.js'
import { extractItems } from '../../app/src/main/lib/extract.js'

const DIR = 'C:/Users/Park/Desktop/Automatic_generation_of_approval_requests_html/Check/아인몰'
const scan = scanCaptureFolder(DIR)
console.log('=== scan ===')
console.log('mallName:', scan.mallName)
console.log('answers:', scan.answers.map(p => p.split(/[\\/]/).pop()))
for (const c of scan.captures) {
  console.log(`capture: [${c.kind}] tag=${c.shipTag} answer=${c.answerPath ? c.answerPath.split(/[\\/]/).pop() : '없음'} → ${c.path.split(/[\\/]/).pop()}`)
}

console.log('=== answers parse ===')
for (const a of scan.answers) {
  const s = answerSummary(a)
  console.log(a.split(/[\\/]/).pop(), '→ mode:', s.mode, s.mode === 'parsed'
    ? `items ${s.items.length}개 · 총액 ${s.items.reduce((t, i) => t + (Number(i.qty) || 1) * (Number(i.unitPrice) || 0), 0).toLocaleString('ko-KR')}원 · ${s.items.slice(0, 4).map(i => i.name).join(' / ')}`
    : 'RAW — 파싱 실패')
}

console.log('=== prepare ===')
const payload = {
  mallName: scan.mallName, baseId: null, kinds: ['order', 'cart'],
  samplesByKind: { order: scan.captures.filter(c => c.kind === 'order'), cart: scan.captures.filter(c => c.kind === 'cart') },
  answers: { free: scan.answers.find(p => /무료/.test(p)) || null, paid: scan.answers.find(p => /발생|유료/.test(p)) || null },
  answerExcel: scan.answers[0], answerBasis: 'common'
}
const req = prepareGenerationRequest(payload, { repoRoot: 'C:/Users/Park/Desktop/Automatic_generation_of_approval_requests_html' })
for (const ctx of req.contexts) {
  console.log(`context ${ctx.kind}: ruleId=${ctx.ruleId} samples=${ctx.samples.map(s => s.label + `(${s.html.length}자)`).join(', ')} 유사규칙=${(ctx.similarNames || []).join(',') || '없음(기본 예시)'} expected=${ctx.expected ? ctx.expected.items.length + '건' : 'null(0건 판정)'}`)
  // 각 샘플에 대해 규칙 없이 DOM 힌트만 점검
}

console.log('=== 샘플 DOM 해석 점검(스키마 문서에 넣기 전) ===')
for (const ctx of req.contexts) {
  for (const s of ctx.samples) {
    const hasGoods = /상품|군것질|과자|음료|교구/.test(s.html)
    console.log(`${s.label}: ${s.html.length}자 · 상품 단어 포함=${hasGoods} · location=${s.location || '없음'}`)
  }
}
