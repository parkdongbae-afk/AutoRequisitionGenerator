/*
 * Gemini 서비스 — "엑셀 정답 만들기" 탭용 (구글 API)
 * 캡처 DOM에서 품목(품목명·규격·수량·단가)을 추출하고 모델 목록·연결 확인을 제공한다.
 * fetch는 주입 가능 — 단위 테스트 가능. Key는 main의 safeStorage에서만 꺼내 쓴다(로그·저장 금지).
 */
const BASE = 'https://generativelanguage.googleapis.com/v1beta'
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite'
const TIMEOUT_MS = 180000

async function geminiFetch(fetchImpl, apiKey, path, { method = 'GET', body, timeoutMs = TIMEOUT_MS } = {}) {
  if (!apiKey) throw Object.assign(new Error('Google API Key가 설정되지 않았습니다'), { code: 'GOOGLE_NOT_CONFIGURED' })
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetchImpl(`${BASE}${path}${path.includes('?') ? '&' : '?'}key=${encodeURIComponent(apiKey)}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal
    })
    if (!res.ok) {
      const text = String(await res.text().catch(() => '')).slice(0, 200)
      if (res.status === 400 && /API key not valid/i.test(text)) {
        throw Object.assign(new Error('Google API Key가 유효하지 않습니다'), { code: 'GOOGLE_AUTH_FAILED' })
      }
      if (res.status === 429) throw Object.assign(new Error('Google API 호출 한도 초과(429)'), { code: 'GOOGLE_RATE_LIMITED' })
      throw Object.assign(new Error(`Google API 오류 ${res.status} — ${text}`), { code: 'GOOGLE_HTTP_ERROR' })
    }
    return res.json()
  } catch (e) {
    if (e.code) throw e
    if (e.name === 'AbortError') throw Object.assign(new Error(`Google API 응답 시간 초과(${timeoutMs / 1000}초)`), { code: 'GOOGLE_TIMEOUT' })
    throw Object.assign(new Error(`Google API 연결 실패 — ${String(e.message || e)}`), { code: 'GOOGLE_NETWORK' })
  } finally {
    clearTimeout(timer)
  }
}

export async function listGeminiModels(apiKey, fetchImpl = fetch) {
  const data = await geminiFetch(fetchImpl, apiKey, '/models')
  const models = (data.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => ({ id: String(m.name || '').replace(/^models\//, ''), displayName: m.displayName || m.name }))
  return { models }
}

export async function testGeminiConnection(apiKey, fetchImpl = fetch) {
  try {
    const { models } = await listGeminiModels(apiKey, fetchImpl)
    return { ok: true, models: models.length }
  } catch (e) {
    return { ok: false, code: e.code || 'GOOGLE_ERROR', message: String(e.message || e) }
  }
}

export function buildExtractionPrompt(captures) {
  const blocks = captures.map((c, i) => `### 캡처 ${i + 1}: ${c.label}\n\`\`\`html\n${c.html}\n\`\`\``).join('\n\n')
  return [
    '당신은 쇼핑몰 캡처 화면에서 품목 정보를 추출하는 전문가입니다.',
    '아래 캡처 DOM(스크립트 제거된 HTML)에서 구매 품목을 전부 추출해 다음 JSON만 출력하세요.',
    '{"items":[{"name":"품목명","spec":"규격/옵션(없으면 빈 문자열)","qty":수량,"unitPrice":단가}],"shippingFee":배송비,"orderTotal":최종주문금액}',
    '규칙: ① unitPrice는 수량 1개당 가격 — 화면에 합계만 있으면 합계÷수량 ② 여러 캡처는 같은 주문의 다른 화면(장바구니/주문서)일 수 있으므로 같은 품목 반복은 한 번만 ③ 숫자는 콤마 없는 정수 ④ shippingFee·orderTotal은 화면에 보일 때만 숫자로, 없으면 null ⑤ 추출 불가한 항목은 만들지 마세요.'
  ].join('\n') + '\n\n' + blocks
}

export async function extractItemsWithGemini({ apiKey, model, captures, fetchImpl = fetch, timeoutMs = TIMEOUT_MS }) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: buildExtractionPrompt(captures) }] }],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
  }
  const data = await geminiFetch(fetchImpl, apiKey, `/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', body, timeoutMs
  })
  const cand = (data.candidates || [])[0] || {}
  const text = (cand.content && cand.content.parts || []).map(p => p.text || '').join('')
  const jsonText = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  const a = jsonText.indexOf('{')
  const b = jsonText.lastIndexOf('}')
  if (a === -1 || b === -1) throw new Error('응답에서 JSON을 찾지 못했습니다')
  const parsed = JSON.parse(jsonText.slice(a, b + 1))
  const items = (Array.isArray(parsed.items) ? parsed.items : [])
    .map(it => ({
      name: String(it.name || '').trim(),
      spec: String(it.spec || '').trim(),
      qty: Number(it.qty) || 1,
      unitPrice: Number(it.unitPrice) || 0
    }))
    .filter(it => it.name)
  return {
    items,
    shippingFee: parsed.shippingFee != null ? Number(parsed.shippingFee) : null,
    orderTotal: parsed.orderTotal != null ? Number(parsed.orderTotal) : null
  }
}
