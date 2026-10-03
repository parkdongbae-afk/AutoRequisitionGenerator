/*
 * Gemini 서비스 — "엑셀 정답 만들기" 탭용 (구글 API)
 * 캡처 DOM에서 품목(품목명·규격·수량·단가)을 추출하고 모델 목록·연결 확인을 제공한다.
 * fetch는 주입 가능 — 단위 테스트 가능. Key는 main의 safeStorage에서만 꺼내 쓴다(로그·저장 금지).
 */
const BASE = 'https://generativelanguage.googleapis.com/v1beta'
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite'
export const FALLBACK_GEMINI_MODEL = 'gemini-3.1-flash-lite'
const TIMEOUT_MS = 180000
// 무료 등급 기준 RPD(1일 요청 한도, 참고값) — 429 실측 전 표시용
export const MODEL_RPD = {
  'gemini-3.5-flash-lite': 1000,
  'gemini-3.1-flash-lite': 1000,
  'gemini-2.5-flash-lite': 1000,
  'gemini-2.5-flash': 250,
  'gemini-2.5-pro': 100,
  'gemini-2.0-flash': 1500,
  'gemini-2.0-flash-lite': 1500
}
export function lookupRpd(modelId) {
  const m = String(modelId || '')
  for (const [k, v] of Object.entries(MODEL_RPD)) if (m === k || m.includes(k)) return v
  return null
}

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
      throw Object.assign(new Error(`Google API 오류 ${res.status} — ${text}`), { code: 'GOOGLE_HTTP_ERROR', status: res.status })
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

export function buildExtractionPrompt(captures, imageCount = 0) {
  const blocks = captures.map((c, i) => `### 캡처 ${i + 1}: ${c.label}\n\`\`\`html\n${c.html}\n\`\`\``).join('\n\n')
  const imgNote = imageCount > 0 ? `\n추가로 화면 캡처 이미지 ${imageCount}장이 첨부되어 있습니다 — 이미지 속 품목도 추출하세요.\n` : ''
  return [
    '당신은 쇼핑몰 캡처 화면에서 품목 정보를 추출하는 전문가입니다.',
    '아래 입력(캡처 DOM 또는 화면 캡처 이미지)에서 구매 품목을 전부 추출해 다음 JSON만 출력하세요.',
    '{"mallName":"쇼핑몰이름","items":[{"name":"품목명","spec":"규격/옵션(없으면 빈 문자열)","unit":"개|식|권|상자|세트 등 단위","qty":수량,"unitPrice":단가}],"shippingFee":배송비,"orderTotal":최종주문금액}',
    '규칙: ① mallName은 화면 상단·로고·타이틀에서 쇼핑몰 이름 ② unit은 품목명과 규격으로 유추(책·교과서·문제집→권, 급식·점심→식, 상자→상자, 판단 불가→개) ③ unitPrice는 수량 1개당 가격 — 화면에 합계만 있으면 합계÷수량 ④ 여러 캡처는 같은 주문의 다른 화면(장바구니/주문서)일 수 있으므로 같은 품목 반복은 한 번만 ⑤ 숫자는 콤마 없는 정수 ⑥ shippingFee·orderTotal은 화면에 보일 때만 숫자로, 없으면 null ⑦ 추출 불가한 항목은 만들지 마세요.'
  ].join('\n') + imgNote + '\n\n' + blocks
}

function generateOnce(fetchImpl, apiKey, model, parts, timeoutMs) {
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
  }
  return geminiFetch(fetchImpl, apiKey, `/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', body, timeoutMs
  })
}

function extractJsonObject(text) {
  const s = String(text || '')
  const start = s.indexOf('{')
  if (start === -1) throw new Error('응답에서 JSON을 찾지 못했습니다 — ' + s.slice(0, 80))
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
    } else if (ch === '"') inStr = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        const raw = s.slice(start, i + 1)
        try { return JSON.parse(raw) } catch (e) {
          throw new Error('응답 JSON 파싱 실패 — ' + raw.slice(0, 120))
        }
      }
    }
  }
  throw new Error('응답 JSON이 완전하지 않습니다 — ' + s.slice(start, start + 120))
}

export async function extractItemsWithGemini({ apiKey, model, captures = [], images = [], fetchImpl = fetch, timeoutMs = TIMEOUT_MS }) {
  const parts = [{ text: buildExtractionPrompt(captures, images.length) }]
  for (const img of images) {
    parts.push({ inline_data: { mime_type: img.mimeType || 'image/png', data: img.data } })
  }
  parts.push({ text: '위 입력 전체에서 품목을 추출해 지정된 JSON만 출력하세요.' })
  let data
  const usedModel = []
  try {
    usedModel.push(model || DEFAULT_GEMINI_MODEL)
    data = await generateOnce(fetchImpl, apiKey, model || DEFAULT_GEMINI_MODEL, parts, timeoutMs)
  } catch (e) {
    const notFound = e && (e.status === 404 || /not found|is not supported|NOT_FOUND/i.test(String(e.message)))
    if (!notFound || (model || DEFAULT_GEMINI_MODEL) === FALLBACK_GEMINI_MODEL) throw e
    usedModel.push(FALLBACK_GEMINI_MODEL)
    data = await generateOnce(fetchImpl, apiKey, FALLBACK_GEMINI_MODEL, parts, timeoutMs)
  }
  const cand = (data.candidates || [])[0] || {}
  const text = (cand.content && cand.content.parts || []).map(p => p.text || '').join('')
  const parsed = extractJsonObject(text)
  const items = (Array.isArray(parsed.items) ? parsed.items : [])
    .map(it => ({
      name: String(it.name || '').trim(),
      spec: String(it.spec || '').trim(),
      unit: String(it.unit || '').trim(),
      qty: Number(it.qty) || 1,
      unitPrice: Number(it.unitPrice) || 0
    }))
    .filter(it => it.name)
  return {
    mallName: String(parsed.mallName || '').trim(),
    items,
    shippingFee: parsed.shippingFee != null ? Number(parsed.shippingFee) : null,
    orderTotal: parsed.orderTotal != null ? Number(parsed.orderTotal) : null,
    usedModel: usedModel[usedModel.length - 1]
  }
}
