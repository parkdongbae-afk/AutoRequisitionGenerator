/*
 * 캡처 폴더 스캔 (새 규칙 만들기 폴더 불러오기)
 * 폴더(하위 포함)를 훑어 캡처(html/mhtml)와 정답 Excel을 찾고,
 * 파일명·폴더명으로 화면 종류(장바구니/주문서)와 배송비 상태(무료/유료)를 분류한다.
 * 같은 내용의 html+mhtml 중복은 mhtml 우선으로 하나만 남긴다.
 * fs 전용 순수 모듈 — node 단위 테스트 가능하다.
 */
import fs from 'node:fs'
import path from 'node:path'

const CAPTURE_RE = /\.(html?|mhtml?|mht)$/i
const ANSWER_RE = /\.(xls|xlsx)$/i
const MAX_FILES = 40
const MAX_BYTES = 30 * 1024 * 1024

export function detectKind(fullPath) {
  const s = fullPath.toLowerCase()
  if (/장바구니|cart/.test(s)) return 'cart'
  if (/주문서|주문을|order|결제/.test(s)) return 'order'
  return null
}

export function detectShipTag(fullPath) {
  const s = fullPath.toLowerCase()
  if (/무료|free/.test(s)) return 'free'
  if (/유료|배송비|발생|paid/.test(s)) return 'paid'
  return ''
}

export const SHIP_LABEL = { free: '배송비 무료', paid: '배송비 발생', '': '배송비 미확인' }

/*
 * 반환:
 * { captures: [{ path, kind: 'cart'|'order'|null, shipTag, answerPath }],
 *   answers: [path], skipped: [path], truncated: boolean }
 */
export function scanCaptureFolder(dir) {
  const captures = []
  const answers = []
  const skipped = []
  let truncated = false
  const byStem = new Map()

  const walk = d => {
    if (truncated) return
    let es = []
    try { es = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of es) {
      if (truncated) return
      const p = path.join(d, e.name)
      if (e.isDirectory()) { walk(p); continue }
      let st
      try { st = fs.statSync(p) } catch { continue }
      if (st.size > MAX_BYTES) { skipped.push(p); continue }
      if (ANSWER_RE.test(e.name)) { answers.push(p); continue }
      if (!CAPTURE_RE.test(e.name)) continue
      if (captures.length >= MAX_FILES) { truncated = true; return }
      const stem = e.name.replace(CAPTURE_RE, '').toLowerCase()
      const key = path.join(d, stem)
      const kind = detectKind(e.name) || detectKind(d)
      const entry = {
        path: p,
        kind,
        shipTag: detectShipTag(p),
        isMhtml: /\.mhtml?|\.mht$/i.test(e.name),
        stem: key
      }
      const prev = byStem.get(key)
      if (prev) {
        if (entry.isMhtml && !prev.isMhtml) byStem.set(key, entry)
        continue
      }
      byStem.set(key, entry)
    }
  }
  walk(dir)

  for (const entry of byStem.values()) {
    const localAnswer = findAnswer(path.dirname(entry.path))
    captures.push({
      path: entry.path,
      kind: entry.kind,
      shipTag: entry.shipTag,
      answerPath: localAnswer
    })
  }
  captures.sort((a, b) => a.path.localeCompare(b.path))
  answers.sort((a, b) => a.localeCompare(b))
  return { captures, answers: [...new Set(answers)], skipped, truncated }
}

function findAnswer(dir) {
  try {
    const hit = fs.readdirSync(dir)
      .filter(f => ANSWER_RE.test(f))
      .sort((a, b) => scoreAnswerName(b) - scoreAnswerName(a))[0]
    return hit ? path.join(dir, hit) : null
  } catch { return null }
}

function scoreAnswerName(name) {
  let s = 0
  if (/정답/.test(name)) s += 2
  if (/품목/.test(name)) s += 1
  return s
}

/* 스캔 결과를 요약 문자열로 — UI 표시용 */
export function summarizeScan(scan) {
  const bucket = { cart: { free: 0, paid: 0, unknown: 0 }, order: { free: 0, paid: 0, unknown: 0 } }
  for (const c of scan.captures) {
    if (!c.kind || !bucket[c.kind]) continue
    const tag = c.shipTag || 'unknown'
    bucket[c.kind][tag] = (bucket[c.kind][tag] || 0) + 1
  }
  return {
    cart: bucket.cart,
    order: bucket.order,
    answers: scan.answers.length,
    total: scan.captures.length,
    truncated: scan.truncated
  }
}
