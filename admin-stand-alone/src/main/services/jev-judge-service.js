/*
 * TypeSafe Jev Judge 서비스 (JEV.MD §8~§9, §21~§23)
 * Jev는 판정만 담당 — 규칙 JSON·코드 생성, 금액 계산은 하지 않는다(§27).
 * renderer에서 TypeSafe API를 직접 호출하지 않도록 main 프로세스에서만 사용한다(§21).
 */
import fs from 'node:fs'

const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
const JEV_MODEL = 'jev-latest'
const DEFAULT_TIMEOUT_MS = 60000
const STATE_MAX_BYTES = 64000

// 개인정보 마스킹(§10) — 이름·전화·이메일·주문번호 원문은 Jev에 보내지 않는다
export function maskText(s) {
  return String(s == null ? '' : s)
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    .replace(/0\d{1,2}[- ]?\d{3,4}[- ]?\d{4}/g, '[phone]')
    .replace(/(?:주문|주문번호|order)[^\s]{0,3}[:#]?\s*\w+/gi, '[order]')
    .slice(0, 80)
}

function normalizeError(e) {
  const msg = String(e && e.message || e)
  if (/KEY가 설정되지 않았다/.test(msg)) return { code: 'JEV_NOT_CONFIGURED', message: msg }
  if (/401|403/.test(msg)) return { code: 'JEV_AUTH_FAILED', message: 'TypeSafe 인증 실패' }
  if (/429/.test(msg)) return { code: 'JEV_RATE_LIMITED', message: 'TypeSafe 호출 제한' }
  if (/휘진|quota|사용량/i.test(msg)) return { code: 'JEV_QUOTA_EXHAUSTED', message: 'TypeSafe 사용량 소진' }
  if (/aborted|timeout|ETIMEDOUT/i.test(msg)) return { code: 'JEV_TIMEOUT', message: 'TypeSafe 호출 시간 초과' }
  if (/ENOTFOUND|ECONNREFUSED|네트워크/.test(msg)) return { code: 'JEV_NETWORK_ERROR', message: 'TypeSafe 네트워크 오류' }
  if (/응답 구조|Invalid/.test(msg)) return { code: 'JEV_INVALID_RESPONSE', message: 'TypeSafe 응답 구조 오류' }
  return { code: 'JEV_NETWORK_ERROR', message: msg }
}

function apiKey() {
  const v = process.env.TYPESAFE_API_KEY
  return v && String(v).trim() ? String(v).trim() : null
}

function validateJevResponse(result) {
  if (!result || typeof result !== 'object' || !result.answers || typeof result.answers !== 'object') {
    throw new Error('Jev 응답 구조 오류: answers 없음')
  }
  for (const key of ['selector_stable', 'name_quality', 'failure_cause', 'deployment_ready']) {
    if (!result.answers[key]) throw new Error(`Jev 응답 구조 오류: ${key} 없음`)
  }
}

export class JevJudgeService {
  constructor(options = {}) {
    this.endpoint = options.endpoint || JEV_ENDPOINT
    this.model = options.model || JEV_MODEL
    this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS
  }

  isConfigured() {
    return !!apiKey()
  }

  // 연결 테스트 — 최소 질문 1개로 실제 응답만 확인한다(키 값은 로그에 남지 않는다)
  async testConnection() {
    if (!this.isConfigured()) {
      return { ok: false, code: 'JEV_NOT_CONFIGURED', message: 'TYPESAFE_API_KEY가 설정되지 않았습니다' }
    }
    try {
      await this.#call({
        model: this.model,
        state: { ping: true },
        questions: { connection_check: { type: 'noul', instructions: '연결 테스트입니다. true를 응답하세요.', criteria: { true: '항상 true', false: '항상 false' } } }
      })
      return { ok: true, message: 'TypeSafe Jev 연결 성공' }
    } catch (e) {
      const n = normalizeError(e)
      return { ok: false, code: n.code, message: n.message }
    }
  }

  // 후보 규칙 판정(§9) — 요약 데이터만 전송하고 HTML 전체는 금지(§10)
  async judgeCandidate({ rule, extraction, expected, diagnostics }) {
    if (!this.isConfigured()) throw Object.assign(new Error('TYPESAFE_API_KEY가 설정되지 않았습니다'), { code: 'JEV_NOT_CONFIGURED' })
    const state = {
      rule: {
        id: rule.id,
        rowSelector: rule.rowSelector,
        checkedOnly: rule.checkedOnly,
        fields: rule.fields,
        optionRows: rule.optionRows,
        shipping: rule.shipping,
        priceIs: rule.priceIs
      },
      extraction: {
        itemNames: (extraction.items || []).map(i => maskText(i.name)),
        emptyNameCount: (extraction.items || []).filter(i => !i.name || !String(i.name).trim()).length
      },
      expected: { itemNames: (expected.items || []).map(i => maskText(i.name)) },
      diagnostics: {
        selectorMatchCounts: diagnostics && diagnostics.selectorMatchCounts,
        suspiciousClassNames: (diagnostics && diagnostics.suspiciousClassNames) || []
      }
    }
    if (JSON.stringify(state).length > STATE_MAX_BYTES) {
      throw Object.assign(new Error('Jev state가 너무 큽니다'), { code: 'JEV_STATE_TOO_LARGE' })
    }
    const result = await this.#call({
      model: this.model,
      state,
      questions: {
        selector_stable: {
          type: 'noul',
          instructions: '이 규칙의 CSS selector가 임시 난수 class나 지나치게 구체적인 DOM 순서가 아니라 반복 사용 가능한 안정적인 구조에 기반하는가?',
          criteria: { true: '의미 있는 id, name, data attribute 또는 짧고 반복 가능한 구조를 사용한다.', false: '난수 class, 긴 절대 경로 또는 우연한 nth-child 구조에 크게 의존한다.' }
        },
        name_quality: {
          type: 'score',
          instructions: '추출된 상품명이 실제 상품을 구별할 수 있을 정도로 의미 있고 완전한가?',
          criteria: ['상품명이 비어 있거나 가격·버튼·배송 문구이다.', '일부 상품명은 맞지만 불필요한 문구가 많다.', '대부분 올바르지만 옵션이나 일부 정보가 부족하다.', '실제 상품을 명확히 구별할 수 있는 완전한 상품명이다.']
        },
        failure_cause: {
          type: 'choice',
          instructions: '현재 규칙에서 가장 가능성이 높은 실패 원인은 무엇인가?',
          criteria: {
            row_selector: '상품 행 선택자가 잘못되었거나 상품이 아닌 행을 포함한다.',
            name_selector: '상품명 선택자가 잘못되었다.',
            quantity_selector: '수량 선택자 또는 값 속성이 잘못되었다.',
            price_selector: '판매가, 할인 전 가격 또는 행 합계를 잘못 선택했다.',
            option_rows: '상품 아래의 별도 옵션 행을 처리해야 한다.',
            shipping: '배송비 선택자 또는 무료배송 조건이 잘못되었다.',
            checked_only: '체크된 장바구니 항목 필터가 잘못되었다.',
            no_semantic_problem: '의미적 추출 문제를 확인하기 어렵다.'
          }
        },
        deployment_ready: {
          type: 'choice',
          instructions: '정확한 수치 검증은 별도 코드에서 통과했다고 가정한다. 의미적 품질만 고려했을 때 이 규칙을 어떻게 처리해야 하는가?',
          criteria: {
            approve: 'selector와 추출 이름이 안정적이며 배포해도 된다.',
            repair: '일부 의미적 문제가 있어 GLM에 수정 요청해야 한다.',
            human_review: '모델 판단만으로 결정하기 어려워 사람이 확인해야 한다.',
            reject: '규칙 구조가 명백히 잘못되어 폐기하고 다시 생성해야 한다.'
          }
        }
      }
    })
    validateJevResponse(result)
    return result
  }

  async #call(body) {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), this.timeoutMs)
    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        signal: ac.signal,
        headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!res.ok) throw new Error(`Jev API 오류: ${res.status} ${String(await res.text().catch(() => '')).slice(0, 200)}`)
      const json = await res.json()
      if (!json || typeof json !== 'object') throw new Error('Jev 응답 구조 오류: JSON 아님')
      return json
    } catch (e) {
      throw normalizeError(e) instanceof Error && normalizeError(e).code ? Object.assign(new Error(normalizeError(e).message), { code: normalizeError(e).code }) : e
    } finally {
      clearTimeout(timer)
    }
  }
}
