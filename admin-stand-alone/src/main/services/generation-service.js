/*
 * AI 규칙 생성 서비스 (ADMIN_SATAD_ALONE.MD §7.6·§10, JEV.MD §14)
 * - 캡처 파일·정답 엑셀 파싱과 프롬프트 구성은 기존 admin.js를 재사용한다(§4.1 권장안 A).
 * - 후보 생성 → 로컬 검증 → Jev 판정은 generate-and-verify 파이프라인에 위임한다.
 * - 이 파일은 화면(§7.6)과 파이프라인(§14) 사이의 연결을 담당한다.
 */
import { buildPromptText, buildRepairPromptText, sampleHtmlText, answerSummary } from '../../../../app/src/main/lib/admin-text.js'
import { generateAndVerifyRule, extractJson } from './generate-and-verify.js'
import { ruleChanges, gitCommit } from './rule-files.js'
import { createPlan, applyTransaction } from './transaction-service.js'
import { suggestBaseId as deriveSuggestedId, ruleIdFor as idFor } from '../../shared/rule-id.js'

// builtin 등록·bundle 재생성은 사용자 앱 admin.js(→electron)를 필요로 하므로 적용 시에만 로드한다
async function rulesApi() {
  return import('./rules-service.js')
}

export const KINDS = ['order', 'cart']
const KIND_LABEL = { order: '주문서', cart: '장바구니' }
const SAMPLES_MAX = 20

export function suggestBaseId(mallName) {
  return deriveSuggestedId(mallName)
}

export function ruleIdFor(baseId, kind) {
  // §7.6 — base-id가 -cart로 끝나면 내부 base에서 제거한 뒤 종류별 ID를 구성한다
  return idFor(baseId, kind)
}

const SHIP_SUFFIX = { free: ' (배송비 무료)', paid: ' (배송비 발생)', '': '' }

// 프롬프트에는 배송비 무료 1 + 발생 1 등 대표 샘플만 넣고(토큰 절약), 검증은 전체 샘플로 수행한다
export function pickPromptSamples(samples) {
  if (samples.length <= 2) return samples
  const paid = samples.find(s => s.shipTag === 'paid')
  const free = samples.find(s => s.shipTag === 'free')
  const chosen = []
  if (paid) chosen.push(paid)
  if (free && chosen.length < 2) chosen.push(free)
  for (const s of samples) {
    if (chosen.length >= 2) break
    if (!chosen.includes(s)) chosen.push(s)
  }
  return chosen
}

/*
 * 생성 요청 검증·전처리 (§7.6 샘플 파일·§10.1 입력 전처리)
 * payload: { mallName, baseId, kinds, samplesByKind: {order:[path], cart:[path]},
 *            answerExcel, answerBasis: 'order'|'cart'|'common', model, maxRepair }
 */
export function prepareGenerationRequest(payload) {
  const errors = []
  const mallName = String(payload.mallName || '').trim()
  if (!mallName) errors.push('쇼핑몰 이름을 입력하세요')
  const baseId = suggestBaseId(payload.baseId || mallName)
  const kinds = (Array.isArray(payload.kinds) ? payload.kinds : []).filter(k => KINDS.includes(k))
  if (!kinds.length) errors.push('주문서 또는 장바구니 중 하나 이상 선택하세요')

  const samplesByKind = {}
  for (const kind of kinds) {
    const entries = (payload.samplesByKind && payload.samplesByKind[kind] || [])
      .map(e => (typeof e === 'string' ? { path: e } : e))
      .filter(e => e && e.path)
    if (!entries.length) errors.push(`${KIND_LABEL[kind]} 샘플 HTML/MHTML을 1개 이상 등록하세요`)
    if (entries.length > SAMPLES_MAX) errors.push(`${KIND_LABEL[kind]} 샘플은 최대 ${SAMPLES_MAX}개까지 지원합니다`)
    samplesByKind[kind] = entries
  }
  if (!payload.answerExcel) errors.push('정답 Excel을 등록하세요')

  if (errors.length) {
    const e = new Error(errors.join('\n'))
    e.code = 'GENERATION_INPUT_INVALID'
    throw e
  }

  const answer = answerSummary(payload.answerExcel)
  const answerParsed = answer.mode === 'parsed' && Array.isArray(answer.items) && answer.items.length > 0

  const contexts = kinds.map(kind => {
    const samples = samplesByKind[kind].map((e, i) => {
      const { html, location } = sampleHtmlText(e.path)
      const sample = {
        label: `샘플${i + 1}${SHIP_SUFFIX[e.tag || '']}`,
        html,
        location,
        shipTag: e.tag || ''
      }
      if (e.answerPath) {
        try {
          const a = answerSummary(e.answerPath)
          if (a.mode === 'parsed' && a.items.length) {
            sample.expected = { items: a.items }
            sample.expectedPath = e.answerPath
          }
        } catch {}
      }
      return sample
    })
    let sharedExpected = null
    let sharedMode = false
    const hasPerSample = samples.some(s => s.expected)
    if (hasPerSample) {
      // 정답 1개 공용 구조 — 모든 샘플이 같은 정답 파일을 가리키면 캡처별 대조가 아니라
      // "샘플 합계 vs 정답" 모드로 전환한다. s.expected를 걷어내고 전역 정답으로 쓴다.
      const distinctPaths = [...new Set(samples.filter(s => s.expected).map(s => s.expectedPath))]
      if (distinctPaths.length === 1) {
        sharedMode = true
        const shared = answerSummary(distinctPaths[0])
        const sharedParsed = shared.mode === 'parsed' && shared.items.length > 0
        for (const s of samples) { delete s.expected; delete s.expectedPath }
        sharedExpected = sharedParsed ? { items: shared.items } : null
      }
    }
    if (!sharedMode) {
      // 자기 정답이 없는 샘플은 정답 기준 화면이 일치할 때 전역 정답으로 보완
      for (const s of samples) {
        if (!s.expected && answerParsed && payload.answerBasis === kind) s.expected = { items: answer.items }
      }
    }
    // §7.6 — 정답 기준이 어느 화면인지 선택: 일치 화면만 건수·총액 비교,
    // 공통/알 수 없음·raw는 0건 여부만 필수 판정(경고 처리)한다
    const basisOk = !hasPerSample && answerParsed && payload.answerBasis === kind
    const expected = sharedExpected || (basisOk ? { items: answer.items } : null)

    const promptSamples = pickPromptSamples(samples)
    const promptAnswer = hasPerSample && samples.some(s => s.expected)
      ? {
          mode: 'parsed',
          sheet: '캡처별 정답 요약',
          headerRow: 1,
          items: samples.filter(s => s.expected).flatMap(s => s.expected.items.map(it => ({ ...it, sample: s.label })))
        }
      : (expected || answer)
    return {
      kind,
      ruleId: ruleIdFor(baseId, kind),
      samples,
      promptSamples,
      promptAnswer,
      answer,
      expected
    }
  })

  return { mallName, baseId, contexts, answerParsed }
}

/*
 * 파이프라인 실행 — 종류별로 독립 수행하고 진행 이벤트를 onProgress로 중계한다.
 * deps.callAi({prompt, kind}) / deps.callJev 주입 시 네트워크 없이 테스트 가능하다.
 */
export async function runGeneration(request, deps = {}) {
  const {
    callAi, callJev,
    model = '', maxRepair = 3, repoRoot = null,
    onProgress = () => {}, onJudge
  } = deps

  const results = []
  for (const ctx of request.contexts) {
    onProgress({ step: 'generate', kind: ctx.kind, message: `${KIND_LABEL[ctx.kind]} 규칙 후보 생성 시작 (${ctx.ruleId})` })
    let res
    try {
      res = await generateAndVerifyRule({
        mallName: request.mallName,
        kind: ctx.kind,
        ruleId: ctx.ruleId,
        samples: ctx.samples,
        expected: ctx.expected || {},
        expectAnswer: !!ctx.expected,
        model,
        repairRounds: maxRepair,
        log: m => onProgress({ step: 'generate', kind: ctx.kind, message: m }),
        callAi: callAi ? (a => callAi({ ...a, kind: ctx.kind })) : undefined,
        callJev,
        onJudge: onJudge ? (h => onJudge({ ...h, kind: ctx.kind })) : undefined,
        // 프롬프트는 기존 admin-text.js의 스키마 문서·few-shot 구성을 재사용한다(§4.1 권장안 A)
        promptBuilder: ({ samples: s, answer }) => buildPromptText({
          mallName: request.mallName, kind: ctx.kind, ruleId: ctx.ruleId,
          samples: ctx.promptSamples || s, answer: ctx.promptAnswer || answer,
          repoRoot: repoRoot || undefined
        }),
        repairPromptBuilder: ({ samples: s, answer, rule, problems, details }) => buildRepairPromptText({
          mallName: request.mallName, kind: ctx.kind, ruleId: ctx.ruleId,
          samples: ctx.promptSamples || s, answer: ctx.promptAnswer || answer, rule,
          verification: { details: details || [], problems: problems || [] },
          repoRoot: repoRoot || undefined
        })
      })
    } catch (e) {
      res = { status: 'error', error: String(e.message || e), results: [] }
    }
    results.push({ kind: ctx.kind, ruleId: ctx.ruleId, ...res })
    onProgress({ step: 'generate', kind: ctx.kind, message: `${KIND_LABEL[ctx.kind]} 결과: ${res.status}` })
  }
  return { results, finishedAt: new Date().toISOString() }
}

export { extractJson }

/*
 * 결과 적용 (§13) — 초안 저장 또는 프로젝트 적용 + 선택적 파생 산출물.
 * apply가 false면 파일에 전혀 손대지 않는다(초안은 결과 JSON으로만 유지).
 */
export async function applyGenerationResult(repoRoot, generation, options = {}) {
  const { apply = true, rebuildBundle = false, registerBuiltin = false, git = null, userDataDir = null } = options
  if (apply && !userDataDir) throw new Error('userDataDir가 필요합니다(트랜잭션 스냅샷 저장소)')
  const needAdminApi = apply && (rebuildBundle || registerBuiltin)
  const adminApi = needAdminApi ? await rulesApi() : null
  const applied = []
  const errors = []
  if (apply) {
    for (const r of generation.results) {
      if (!r.rule) continue
      try {
        const plan = createPlan(ruleChanges(repoRoot, r.rule))
        const res = applyTransaction(userDataDir, plan)
        if (res.ok) {
          applied.push({ kind: r.kind, ruleId: r.rule.id, files: plan.changes.map(c => c.path), transactionId: res.id })
        } else {
          errors.push(`${r.kind}: ${res.status === 'validation_blocked' ? res.errors.join(' / ') : res.error}`)
        }
      } catch (e) {
        errors.push(`${r.kind}: 저장 실패 — ${String(e.message || e)}`)
      }
    }
  }
  let bundle = null
  if (apply && rebuildBundle && applied.length) {
    try {
      bundle = adminApi.rebuildRulesJson(adminApi.resolveRepoRoot(), { bump: true })
    } catch (e) {
      errors.push(`rules.json 재생성 실패 — ${String(e.message || e)}`)
    }
  }
  let builtin = null
  if (apply && registerBuiltin && applied.length) {
    try {
      builtin = adminApi.registerBuiltinRules()
    } catch (e) {
      errors.push(`builtin 등록 실패 — ${String(e.message || e)}`)
    }
  }
  let gitResult = null
  if (apply && git && git.commit && applied.length) {
    try {
      const files = [...new Set(applied.flatMap(a => a.files))]
      gitResult = await gitCommit(repoRoot, files, git.message || `feat: ${generation.results.map(r => r.ruleId).join(', ')} 쇼핑몰 규칙 추가`, { push: !!git.push })
    } catch (e) {
      errors.push(`Git 커밋 실패 — ${String(e.message || e)}`)
    }
  }
  return { applied, bundle, builtin, git: gitResult, errors }
}
