/*
 * 규칙 생성·검증·판정 파이프라인 (JEV.MD §14, ADMIN_SATAD_ALONE.MD §10·§17)
 * Z.ai GLM(OpenCode 브리지) = 후보 생성·수정 / 로컬 검증기 = 수치 판정 / Jev = 의미 판정.
 * callAi·callJev를 주입받아 단위 테스트 가능하며, 기본값은 실제 브리지·Jev 서비스다.
 */
import { spawn, execFileSync } from 'node:child_process'
import { verifyRule } from './rule-verifier.js'
import { scoreCandidate } from './candidate-ranker.js'
import { decideRuleAction } from './decision-gate.js'

const TIMEOUT_MS = 600000
export const DEFAULT_OPENCODE_MODEL = 'zai-coding-plan/glm-5.3'

// Windows에서 child.kill()은 cmd.exe만 죽이고 opencode 본체는 남아 파이프를 붙잡는다 —
// 실측 문제로, 트리 전체를 taskkill /T /F로 정리해야 close 이벤트가 온다.
function killTree(child) {
  try { execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }) }
  catch { try { child.kill() } catch {} }
}

// opencode run 명령 — 실측 규약(OpenCode 1.18.33):
//   · -p는 password 옵션이다(프롬프트 아님 — 혼용 금지)
//   · 프롬프트는 stdin으로 전달: 파일 첨부(-f)는 cmd.exe 인자 따옴표 변형으로
//     "File not found"가 발생하는 실측 문제가 있어 배제(160KB 프롬프트도 stdin 무관)
//   · 명령 문자열에 공백·따옴표가 없어 cmd.exe 인자 변형으로부터 자유롭다
export function buildOpenCodeCommand(model) {
  const m = String(model || '').trim() || DEFAULT_OPENCODE_MODEL
  return `opencode run --model ${m}`
}

export function runOpenCodePrompt(prompt, { model = '', timeoutMs = TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('cmd.exe', ['/d', '/s', '/c', buildOpenCodeCommand(model)], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      killTree(child)
      reject(new Error(`opencode 응답 시간 초과(${timeoutMs / 1000}초) — 모델·인증 상태를 확인하세요`))
    }, timeoutMs)
    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d })
    child.on('error', e => {
      clearTimeout(timer)
      reject(new Error(`opencode 실행 실패 — ${String(e.message || e)}`))
    })
    child.on('close', code => {
      clearTimeout(timer)
      if (code === 0) resolve(String(stdout || ''))
      else reject(new Error(`opencode 실행 실패(code ${code}) — ${String(stderr || stdout).trim().slice(-300)}`))
    })
    child.stdin.write(String(prompt || ''), 'utf-8')
    child.stdin.end()
  })
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
  callAi, callJev, promptBuilder, repairPromptBuilder, promptSamples, promptAnswer, onJudge
}) {
  const promptSampleList = promptSamples || samples
  const promptAnswerObj = promptAnswer || expected
  // 후보·수정 판정마다 호출 — Shadow Mode 실사용 수집(§19)용 훅
  const judgeHook = (rule, deterministic, jevRes, decision) => {
    if (onJudge) onJudge({ rule, deterministic, jevRes, decision })
  }
  const ai = callAi || (({ prompt }) => runOpenCodePrompt(prompt, { model }))
  const jev = callJev || (async (r) => { const { JevJudgeService } = await import('./jev-judge-service.js'); const s = new JevJudgeService(); return s.judgeCandidate(r) })

  const base = {
    id: ruleId, name: kind === 'cart' ? `${mallName} 장바구니` : mallName,
    match: [], priceIs: 'lineTotal', user: true
  }
  // 후보 생성은 서로 독립적이므로 병렬 실행한다 — opencode 1회당 수 분이라 순차면 3배 느리다
  const outcomes = await Promise.all(
    Array.from({ length: count }, (_, i) =>
      (async () => {
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
        try {
          const rule = { ...base, ...extractJson(await ai({ prompt })), id: ruleId, name: base.name }
          const ev = await evaluateCandidate({ rule, samples, expected: promptAnswerObj || expected, jev })
          judgeHook(rule, ev.deterministic, ev.jevRes, ev.decision)
          return { rule, deterministic: ev.deterministic, jev: ev.jevRes, decision: ev.decision }
        } catch (e) {
          log(`후보 #${i + 1} 생성 실패: ${String(e.message || e)}`, 'err')
          return null
        }
      })()
    )
  )
  const results = outcomes.filter(Boolean)

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
    judgeHook(rule, ev.deterministic, ev.jevRes, ev.decision)
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
