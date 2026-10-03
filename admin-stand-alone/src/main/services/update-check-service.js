/*
 * 업데이트 자동 확인 (Zai Coding Plan 작업 지시서 — 데스크톱 단독 앱에 맞게 조정)
 * - 하루 1회 각 쇼핑몰의 규칙/공지 페이지를 fetch → 텍스트 표준화 → SHA-256 해시 비교
 * - 변경 없으면 LLM 호출 없음(토큰 절약), 변경 시 diff 블록만 추출해 Gemini 요약(해시 캐시 재사용)
 * - 상태: userData/update-check/{shops.json, state.json, log.jsonl}
 * - 스케줄은 index.js의 타이머가 담당(지정 시각 이후 오늘 미실행이면 실행 — 어제 미실행 보완 포함)
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { diffLines } from '../../shared/line-diff.js'

const dirOf = userDataDir => path.join(userDataDir, 'update-check')

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return fallback }
}
function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

const shopsPathOf = userDataDir => path.join(dirOf(userDataDir), 'shops.json')
const statePathOf = userDataDir => path.join(dirOf(userDataDir), 'state.json')
const logPathOf = userDataDir => path.join(dirOf(userDataDir), 'log.jsonl')

export function listShops(userDataDir) {
  return readJson(shopsPathOf(userDataDir), [])
}
export function setShops(userDataDir, shops) {
  const clean = (Array.isArray(shops) ? shops : [])
    .filter(s => s && String(s.url || '').trim())
    .map((s, i) => ({
      id: String(s.id || `shop-${Date.now()}-${i}`),
      name: String(s.name || s.url).trim().slice(0, 60),
      url: String(s.url).trim()
    }))
  writeJson(shopsPathOf(userDataDir), clean)
  const state = loadUpdateState(userDataDir)
  const keep = new Set(clean.map(s => s.id))
  for (const id of Object.keys(state.shops || {})) {
    if (!keep.has(id)) delete state.shops[id]
  }
  saveUpdateState(userDataDir, state)
  return clean
}

export function loadUpdateState(userDataDir) {
  return readJson(statePathOf(userDataDir), { shops: {}, summaries: {}, lastFullCheckAt: null, lastFullCheckDate: null })
}
function saveUpdateState(userDataDir, state) {
  writeJson(statePathOf(userDataDir), state)
}

function appendLog(userDataDir, entry) {
  try {
    fs.mkdirSync(dirOf(userDataDir), { recursive: true })
    fs.appendFileSync(logPathOf(userDataDir), JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n')
  } catch {}
}

export function readUpdateLog(userDataDir, limit = 30) {
  try {
    const lines = fs.readFileSync(logPathOf(userDataDir), 'utf-8').split(/\r?\n/).filter(Boolean)
    return lines.slice(-limit).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean).reverse()
  } catch { return [] }
}

export function extractText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

const chunkLines = (text, width = 120) => {
  const t = String(text || '')
  if (!t) return []
  return t.match(new RegExp(`.{1,${width}}(\\s|$)`, 'g')) || [t]
}

export function changedBlocks(beforeText, afterText, maxChars = 2000) {
  const d = diffLines(chunkLines(beforeText).join('\n'), chunkLines(afterText).join('\n'))
  const parts = d.filter(h => h.type === 'add' || h.type === 'del').map(h => h.text)
  return parts.join('\n').slice(0, maxChars)
}

const MAX_TEXT_CHARS = 300000

export async function checkOne(shop, userDataDir, { callGemini } = {}) {
  const state = loadUpdateState(userDataDir)
  const rec = { ...(state.shops[shop.id] || {}) }
  const now = new Date().toISOString()
  let html = ''
  try {
    const res = await fetch(shop.url, {
      signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36' }
    })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    html = await res.text()
  } catch (e) {
    state.shops[shop.id] = { ...rec, url: shop.url, lastCheckedAt: now, lastError: String(e.message || e).slice(0, 160) }
    saveUpdateState(userDataDir, state)
    return { status: 'error', error: state.shops[shop.id].lastError }
  }

  const text = extractText(html).slice(0, MAX_TEXT_CHARS)
  const hash = crypto.createHash('sha256').update(text).digest('hex')
  const isFirstCheck = rec.lastHash == null
  const changed = !isFirstCheck && rec.lastHash !== hash
  let summary = rec.lastSummary || null
  let diffPreview = null
  let matched = rec.lastMatchedPatterns || []

  if (changed) {
    diffPreview = changedBlocks(rec.lastText || '', text)
    matched = matchPatterns(diffPreview, listPatterns(userDataDir))
    state.summaries = state.summaries || {}
    summary = state.summaries[hash] || null
    if (!summary && callGemini && diffPreview) {
      try { summary = await callGemini(shop.name, diffPreview, matched) } catch { summary = null }
      if (summary) {
        state.summaries[hash] = summary
        const keys = Object.keys(state.summaries)
        while (keys.length > 200) delete state.summaries[keys.shift()]
      }
    }
    rec.lastChangedAt = now
  }
  rec.url = shop.url
  rec.lastHash = hash
  rec.lastText = text
  rec.lastCheckedAt = now
  rec.lastError = null
  rec.status = isFirstCheck ? 'baseline' : changed ? 'changed' : 'unchanged'
  rec.lastSummary = summary
  rec.lastMatchedPatterns = matched
  state.shops[shop.id] = rec
  saveUpdateState(userDataDir, state)
  return { status: rec.status, summary, diffPreview, matched }
}

export async function runFullCheck(userDataDir, { callGemini, sendEmail, onProgress } = {}) {
  const shops = listShops(userDataDir)
  const startedAt = new Date().toISOString()
  let changedCount = 0
  let geminiCalls = 0
  let errors = 0
  const changedList = []
  for (const shop of shops) {
    if (onProgress) onProgress(`[${shop.name}] 확인 중…`)
    const r = await checkOne(shop, userDataDir, {
      callGemini: async (name, diff, matched) => {
        if (onProgress) onProgress(`[${name}] 변경 감지 — Gemini 요약 중…`)
        const s = callGemini ? await callGemini(name, diff, matched) : null
        if (s) geminiCalls++
        return s
      }
    })
    if (r.status === 'changed') {
      changedCount++
      changedList.push({ name: shop.name, url: shop.url, summary: r.summary, diffPreview: r.diffPreview, matched: r.matched })
    }
    if (r.status === 'error') errors++
  }
  const state = loadUpdateState(userDataDir)
  state.lastFullCheckAt = new Date().toISOString()
  state.lastFullCheckDate = new Date().toISOString().slice(0, 10)
  saveUpdateState(userDataDir, state)
  appendLog(userDataDir, { runAt: startedAt, total: shops.length, changed: changedCount, geminiCalls, errors })

  let email = shops.length === 0 ? 'no-shops' : changedCount === 0 ? 'not-needed' : 'skipped-not-configured'
  if (changedCount > 0 && sendEmail) {
    try { email = await sendEmail(changedList, changedCount) } catch (e) { email = 'send-failed: ' + String(e.message || e).slice(0, 120) }
  }
  return { total: shops.length, changedCount, geminiCalls, errors, email, changedList, lastFullCheckAt: state.lastFullCheckAt }
}

export function todayChangedCount(state) {
  const today = new Date().toISOString().slice(0, 10)
  return Object.values(state.shops || {}).filter(r => r.lastChangedAt && r.lastChangedAt.slice(0, 10) === today).length
}

/*
 * 검색어/패턴 리스트 (검색어_패턴 리스트.txt 기반)
 * 변경 diff를 카테고리별 패턴으로 로컬 매칭해 태깅한다 — Gemini 없이 중요도 분류.
 * 구문 패턴이 단어 단독보다 정확하므로 cat을 구분해 표시한다.
 */
export const PATTERN_CATEGORIES = {
  'cart-order': '장바구니/주문서 문맥',
  policy: '정책/규칙 변경',
  ui: 'UI/화면 구조',
  general: '변경 전반'
}

export const DEFAULT_PATTERNS = [
  { p: '장바구니 기능 개편', cat: 'cart-order' },
  { p: '주문서 화면 변경', cat: 'cart-order' },
  { p: '주문서 화면 개편', cat: 'cart-order' },
  { p: '주문/결제 단계 UI 개편', cat: 'cart-order' },
  { p: '주문하기 화면', cat: 'cart-order' },
  { p: '결제하기 화면', cat: 'cart-order' },
  { p: '장바구니에 담긴 상품', cat: 'cart-order' },
  { p: '배송비 정책 변경', cat: 'policy' },
  { p: '배송비 기준 변경', cat: 'policy' },
  { p: '무료배송 기준 금액 변경', cat: 'policy' },
  { p: '최소 주문 금액 변경', cat: 'policy' },
  { p: '최소 구매 금액 변경', cat: 'policy' },
  { p: '쿠폰 적용 정책 변경', cat: 'policy' },
  { p: '포인트 사용 조건 변경', cat: 'policy' },
  { p: '적립금 사용 기준 변경', cat: 'policy' },
  { p: '이용약관 개정', cat: 'policy' },
  { p: '이용약관 일부 개정', cat: 'policy' },
  { p: '환불', cat: 'policy' },
  { p: '수수료', cat: 'policy' },
  { p: '패널티', cat: 'policy' },
  { p: '배송비', cat: 'policy' },
  { p: 'UI 변경', cat: 'ui' },
  { p: '화면 개편', cat: 'ui' },
  { p: '화면 구성 변경', cat: 'ui' },
  { p: '디자인 변경', cat: 'ui' },
  { p: '레이아웃 변경', cat: 'ui' },
  { p: 'UX 개선', cat: 'ui' },
  { p: 'UX 변경', cat: 'ui' },
  { p: '버튼 위치 변경', cat: 'ui' },
  { p: '메뉴 구조 변경', cat: 'ui' },
  { p: '페이지 구조 변경', cat: 'ui' },
  { p: '인터페이스 개선', cat: 'ui' },
  { p: '변경 안내', cat: 'general' },
  { p: '정책 변경', cat: 'general' },
  { p: '시스템 변경', cat: 'general' },
  { p: '시스템 개편', cat: 'general' },
  { p: '서비스 변경', cat: 'general' },
  { p: '서비스 개편', cat: 'general' },
  { p: '조건 변경', cat: 'general' },
  { p: '기능 변경', cat: 'general' },
  { p: '기능 추가', cat: 'general' },
  { p: '기능 개선', cat: 'general' },
  { p: '변경 예정', cat: 'general' },
  { p: '변경 공지', cat: 'general' },
  { p: '변경 안내문', cat: 'general' },
  { p: '변경 사항', cat: 'general' },
  { p: '변경 내역', cat: 'general' },
  { p: '개편', cat: 'general' },
  { p: '리뉴얼', cat: 'general' },
  { p: '업데이트', cat: 'general' },
  { p: '개선', cat: 'general' },
  { p: '조정', cat: 'general' },
  { p: '수정', cat: 'general' },
  { p: '변경', cat: 'general' }
]

const patternsPathOf = userDataDir => path.join(dirOf(userDataDir), 'patterns.json')

export function listPatterns(userDataDir) {
  return readJson(patternsPathOf(userDataDir), null) || DEFAULT_PATTERNS.map(p => ({ ...p }))
}
export function setPatterns(userDataDir, patterns) {
  const clean = (Array.isArray(patterns) ? patterns : [])
    .filter(p => p && String(p.p || '').trim())
    .map(p => ({ p: String(p.p).trim().slice(0, 60), cat: PATTERN_CATEGORIES[p.cat] ? p.cat : 'general' }))
  writeJson(patternsPathOf(userDataDir), clean)
  return clean
}
export function resetPatterns(userDataDir) {
  try { fs.unlinkSync(patternsPathOf(userDataDir)) } catch {}
  return listPatterns(userDataDir)
}

export function matchPatterns(text, patterns) {
  const t = String(text || '')
  const seen = new Set()
  const out = []
  for (const pat of patterns || []) {
    const key = pat.p
    if (seen.has(key)) continue
    if (t.includes(pat.p)) {
      seen.add(key)
      out.push({ p: pat.p, cat: pat.cat })
    }
  }
  return out
}
