/*
 * 규칙 생성·검증·판정 파이프라인 (JEV.MD §14, ADMIN_SATAD_ALONE.MD §10·§17)
 * Z.ai GLM(OpenCode 브리지) = 후보 생성·수정 / 로컬 검증기 = 수치 판정 / Jev = 의미 판정.
 * callAi·callJev를 주입받아 단위 테스트 가능하며, 기본값은 실제 브리지·Jev 서비스다.
 */
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { verifyRule } from './rule-verifier.js'
import { scoreCandidate } from './candidate-ranker.js'
import { decideRuleAction } from './decision-gate.js'

const execFileAsync = promisify(execFile)
const TIMEOUT_MS = 180000

// OpenCode run — 긴 프롬프트는 임시 파일로 전달하고(§10.3 표준 입력·임시 파일 허용)
// 작업 디렉터리는 임시 폴더로 제한해 저장소 수정 권한을 주지 않는다(§10.3).
export async function runOpenCodePrompt(prompt, { model = 'zai-coding-plan/glm-5.3', timeoutMs = TIMEOUT_MS } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'rule-mgr-'))
  const promptFile = path.join(dir, 'prompt.txt')
  writeFileSync(promptFile, prompt)
  // cmd.exe /c로 .ps1/.cmd 래퍼를 실행하고 프롬프트 파일을 type으로 stdin 대신 전달
  const { stdout } = await execFileAsync(
    'cmd.exe',
    ['/d', '/s', '/c', `opencode run --model ${model} -p "@${promptFile}"`],
    { timeout: timeoutMs, windowsHide: true, cwd: dir, maxBuffer: 32 * 1024 * 1024 }
  )
  return String(stdout || '')
}

// 응답에서 JSON만 추출(코드펜스·앞뒤 설명 제거) — 관리자 도구 extractRuleJson과 동일 계약
export function extractJson(text) {
  let s = String(text || '').trim()
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  const a = s.indexOf('{')
  const b = s.lastIndexOf('}')
  if (a === -1 || b === -1 || b <= a) throw new Error('응답에서 JSON을 찾지 못했습니다')
  return JSON.parse(s.slice(a, b + 1))
}

const CANDIDATE_ANGLES = [
  '표준 DOM 구조 기준으로 가장 단순하고 안정적인 선택자를 고르세요.',
  '체크박스·옵션 행 등 동적으로 생기는 행 구조를 우선 고려해 rowSelector와 optionRows를 설계하세요.',
  '클래스명이 자주 바뀌는 쇼핑몰에 대비해 id·data 속성·역할 기반 선택자를 우선하세요.'
]

// 수정 프롬프트용 실측 데이터 — AI가 "뭐가 틀렸는지"를 볼 수 있게 추출 결과와 선택자 매칭 수를 정리한다
function extractionDetails(d) {
  const base = d.perSample && d.perSample.length
    ? d.perSample.map(p => ({ sample: p.label, count: p.count, expected: p.expectedCount, subtotal: p.subtotal, expectedSubtotal: p.expectedSubtotal }))
    : [{ count: d.itemCount, expected: d.itemCountExpected, subtotal: d.subtotal, expectedSubtotal: d.subtotalExpected }]
  return base.concat([
    { extractedNames: (d.extraction.items || []).map(i => `${i.name} x${i.qty} @${i.unitPrice}`).slice(0, 12) },
    { selectorMatchCounts: d.diagnostics && d.diagnostics.selectorMatchCounts },
    { suspiciousClassNames: (d.diagnostics && d.diagnostics.suspiciousClassNames) || [] }
  ])
}

/*
 * 후보 3개 생성 → 로컬 검증 → Jev 판정 → 승인/수정 결정(§14).
 * deps.callAi({prompt}) / deps.callJev({rule, extraction, expected, diagnostics}) 주입 가능.
 */
export async function generateAndVerifyRule({
  mallName, kind, ruleId, samples, expected, expectAnswer = false,
  model, count = 3, repairRounds = 3, log = () => {},
  callAi, callJev, promptBuilder, repairPromptBuilder, promptSamples, promptAnswer
}) {
  const promptSampleList = promptSamples || samples
  const promptAnswerObj = promptAnswer || expected
  const ai = callAi || (({ prompt }) => runOpenCodePrompt(prompt, { model }))
  const jev = callJev || (async (r) => { const { JevJudgeService } = await import('./jev-judge-service.js'); const s = new JevJudgeService(); return s.judgeCandidate(r) })

  const results = []
  const base = {
    id: ruleId, name: kind === 'cart' ? `${mallName} 장바구니` : mallName,
    match: [], priceIs: 'lineTotal', user: true
  }
  for (let i = 0; i < count; i++) {
    const angle = CANDIDATE_ANGLES[i % CANDIDATE_ANGLES.length]
    const prompt = promptBuilder
      ? promptBuilder({ samples: promptSampleList, answer: promptAnswerObj, angle, index: i })
      : [
      `당신은 쇼핑몰 캡처 화면에서 품목을 CSS 선택자로 추출하는 파싱 규칙 전문가입니다.`,
      `"${mallName}"(${kind === 'cart' ? '장바구니' : '주문서'}) 규칙 후보 #${i + 1}를 만들어 주세요. ${angle}`,
      `규칙 id는 "${ruleId}", name은 "${mallName}"으로 고정. 응답은 설명 없이 규칙 JSON 객체만.`,
      '',
      '## 입력 샘플',
      ...promptSampleList.map((s, j) => `### 샘플 ${j + 1}\n\`\`\`html\n${s.html}\n\`\`\``),
      '',
      '## 정답 품목',
      JSON.stringify(promptAnswerObj.items || [], null, 1)
    ].join('\n')
    log(`후보 #${i + 1} 생성 중…`)
    let rule
    try {
      rule = { ...base, ...extractJson(await ai({ prompt })), id: ruleId, name: base.name }
    } catch (e) {
      log(`후보 #${i + 1} 생성 실패: ${String(e.message || e)}`, 'err')
      continue
    }
    const ev = await evaluateCandidate({ rule, samples, expected: promptAnswerObj || expected, jev })
    results.push({ rule, deterministic: ev.deterministic, jev: ev.jevRes, decision: ev.decision })
  }

  const approved = results.filter(r => r.decision.action === 'approve')
    .sort((a, b) => scoreCandidate(b.deterministic).score - scoreCandidate(a.deterministic).score)[0]
  if (approved) return { status: 'approved', ...approved, results, repairHistory: [] }

  const repairable = results.filter(r => r.decision.action === 'repair')
    .sort((a, b) => scoreCandidate(b.deterministic).score - scoreCandidate(a.deterministic).score)[0]
  if (!repairable || repairRounds <= 0) return { status: 'human_review', results, repairHistory: [] }

  // §11.3 — 최대 repairRounds회 자가 수정. 매 회차 재검증하고, 이전 회차와 동일 JSON이
  // 반환되면 무한 반복 방지를 위해 중단한다. 정답 일치 수정분만 적용 후보가 된다.
  const repairHistory = []
  const attempted = new Set([JSON.stringify(repairable.rule)])
  let current = repairable
  for (let round = 1; round <= repairRounds; round++) {
    log(`최적 후보(${current.decision.reason})를 GLM에 수정 요청합니다(${round}/${repairRounds})`, 'step')
    const details = extractionDetails(current.deterministic)
    const repairPrompt = repairPromptBuilder
      ? repairPromptBuilder({ samples: promptSampleList, answer: promptAnswerObj, rule: current.rule, problems: [current.decision.reason], details, round })
      : [
      `아래 규칙으로 추출했더니 정답과 다릅니다. 문제: ${current.decision.reason}`,
      `수정된 규칙 JSON 객체만 응답하세요(id "${ruleId}" 고정).`,
      `## 기존 규칙`, '```json', JSON.stringify(current.rule, null, 1), '```',
      `## 실제 추출(실측)`, JSON.stringify(details, null, 1),
      `## 정답`, JSON.stringify(promptAnswerObj.items || [], null, 1)
    ].join('\n')
    let rule
    try {
      rule = { ...base, ...extractJson(await ai({ prompt: repairPrompt })), id: ruleId, name: base.name }
    } catch (e) {
      repairHistory.push({ round, action: 'error', reason: String(e.message || e) })
      break
    }
    const key = JSON.stringify(rule)
    if (attempted.has(key)) {
      log('이전과 동일한 규칙이 반환되어 수정을 중단합니다', 'err')
      repairHistory.push({ round, action: 'stalled', reason: '이전 회차와 동일한 JSON' })
      break
    }
    attempted.add(key)
    const ev = await evaluateCandidate({ rule, samples, expected: promptAnswerObj || expected, jev })
    repairHistory.push({ round, action: ev.decision.action, reason: ev.decision.reason })
    if (ev.decision.action === 'reject') break
    if (ev.deterministic.countMatches && ev.deterministic.totalWithinTolerance) {
      return { status: 'repaired', rule, deterministic: ev.deterministic, jev: ev.jevRes, decision: ev.decision, results, repairHistory }
    }
    current = { rule, deterministic: ev.deterministic, decision: ev.decision }
  }
  return { status: 'human_review', results, repairHistory }
}

async function evaluateCandidate(ctx) {
  const { rule, samples, expected, jev } = ctx
  const deterministic = verifyRule({ rule, samples, expected })
  if (!deterministic.schemaValid) {
    return { deterministic, jevRes: null, decision: { action: 'reject', reason: deterministic.errors[0] || '스키마 오류' } }
  }
  if (!passesMinimumDeterministicGate(deterministic)) {
    return { deterministic, jevRes: null, decision: { action: 'repair', reason: deterministic.errors[0] || '로컬 검증 실패' } }
  }
  try {
    const jevRes = await jev({ rule, extraction: deterministic.extraction, expected, diagnostics: deterministic.diagnostics })
    return { deterministic, jevRes, decision: decideRuleAction({ deterministic, jev: jevRes }) }
  } catch (e) {
    return { deterministic, jevRes: null, decision: { action: 'human_review', reason: 'Jev 연결 실패 — ' + String(e.message || e) } }
  }
}

function passesMinimumDeterministicGate(d) {
  return d.extractionSucceeded && (d.itemCount || 0) > 0
}
