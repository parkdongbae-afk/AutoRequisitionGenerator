/*
 * 샘플 추출 검증 (ADMIN_SATAD_ALONE.MD §7.7 — CSS selector 실행·샘플 추출 0건·정답 대조)
 * 캡처 폴더를 훑어 각 문서를 규칙으로 추출하고, 같은 폴더의 정답 Excel과 건수·총액을 대조한다.
 * 파일 읽기만 하는 순수 모듈 — node 단위 테스트 가능하다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { sampleHtmlText, answerSummary } from '../../../../app/src/main/lib/admin-text.js'
import { extractItems } from '../../../../app/src/main/lib/extract.js'

const CAPTURE_RE = /\.(html?|mhtml?|mht)$/i
const ANSWER_RE = /\.(xls|xlsx)$/i
const MAX_FILES = 60
const MAX_BYTES = 30 * 1024 * 1024

function listCaptures(dir) {
  const out = []
  const walk = d => {
    let es = []
    try { es = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of es) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (CAPTURE_RE.test(e.name) && fs.statSync(p).size <= MAX_BYTES) out.push(p)
      if (out.length >= MAX_FILES) return
    }
  }
  walk(dir)
  return out.slice(0, MAX_FILES)
}

function findAnswer(dir) {
  try {
    const hit = fs.readdirSync(dir).find(f => ANSWER_RE.test(f))
    return hit ? path.join(dir, hit) : null
  } catch { return null }
}

// 캡처 ↔ 규칙 매칭 — match substring이 문서 URL(location) 또는 본문에 있으면 후보.
// URL 힌트에 cart가 있으면 -cart 규칙을 우선한다(§9 매칭 정책과 같은 방향).
export function matchRule(ruleList, location, html) {
  const haystack = `${location}\n${html}`
  const hit = ruleList.filter(r => (r.match || []).some(m => haystack.includes(m)))
  if (!hit.length) return null
  const preferCart = /cart/i.test(location)
  const sorted = [...hit].sort((a, b) => {
    const ac = isCart(a) === preferCart ? 0 : 1
    const bc = isCart(b) === preferCart ? 0 : 1
    if (ac !== bc) return ac - bc
    return isCart(b) - isCart(a)
  })
  return sorted[0]
}

function isCart(r) {
  return /-cart$/.test(String(r.id || ''))
}

function loadRules(repoRoot) {
  const dir = path.join(repoRoot, 'app', 'src', 'main', 'lib', 'rules')
  const list = []
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    if (!f.endsWith('.json') || f === 'meta.json') continue
    try {
      const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'))
      if (r.id && Array.isArray(r.match)) list.push(r)
    } catch {}
  }
  return list
}

const TOL = (expected) => Math.max(10, expected * 0.02)

export function verifySamples(repoRoot, dir, { onProgress = () => {} } = {}) {
  const rules = loadRules(repoRoot)
  if (!fs.existsSync(dir)) return { results: [], summary: { ERROR: 0, WARNING: 0, INFO: 0, PASS: 0, ok: true }, scanned: 0 }
  const captures = listCaptures(dir)
  const results = []
  let scanned = 0
  for (const file of captures) {
    scanned++
    onProgress({ message: `${path.basename(file)} 검증 중… (${scanned}/${captures.length})` })
    let parsed
    try {
      parsed = sampleHtmlText(file)
    } catch (e) {
      results.push({ file: path.basename(file), verdict: 'ERROR', ruleId: null, problems: [`문서 해석 실패 — ${String(e.message || e).slice(0, 100)}`] })
      continue
    }
    const rule = matchRule(rules, parsed.location, parsed.html)
    if (!rule) {
      results.push({ file: path.basename(file), verdict: 'INFO', ruleId: null, itemCount: null, problems: ['매칭 규칙 없음 — 미지원 쇼핑몰이거나 match 갱신 필요'] })
      continue
    }
    const answerPath = findAnswer(path.dirname(file))
    let answer = null
    if (answerPath) {
      try { answer = answerSummary(answerPath) } catch {}
    }
    let items = []
    try {
      items = extractItems(parsed.html, rule).items
    } catch (e) {
      results.push({ file: path.basename(file), verdict: 'ERROR', ruleId: rule.id, problems: [`추출 예외 — ${String(e.message || e).slice(0, 100)}`] })
      continue
    }
    const subtotal = items.reduce((s, i) => s + (Number(i.qty) || 1) * (Number(i.unitPrice) || 0), 0)
    const expectedItems = answer && answer.mode === 'parsed' ? answer.items.filter(i => !i.isShipping) : null
    const expectedCount = expectedItems ? expectedItems.length : null
    const expectedTotal = expectedItems ? expectedItems.reduce((s, i) => s + (Number(i.qty) || 1) * (Number(i.unitPrice) || 0), 0) : null

    const problems = []
    let verdict = 'PASS'
    if (items.length === 0) {
      problems.push('추출 0건 — rowSelector/checkedOnly 확인 필요')
      verdict = 'ERROR'
    } else if (expectedCount == null) {
      verdict = 'INFO'
      problems.push(`추출 ${items.length}건 — 같은 폴더에 파싱 가능한 정답 Excel 없음(건수만 판정)`)
    } else {
      if (items.length !== expectedCount) {
        problems.push(`건수 불일치: 추출 ${items.length} vs 정답 ${expectedCount}`)
        verdict = 'ERROR'
      }
      if (expectedTotal != null && Math.abs(subtotal - expectedTotal) > TOL(expectedTotal)) {
        problems.push(`총액 불일치: ${subtotal.toLocaleString('ko-KR')}원 vs 정답 ${expectedTotal.toLocaleString('ko-KR')}원 — priceIs/배송비 확인`)
        verdict = 'ERROR'
      }
    }
    results.push({
      file: path.basename(file), verdict, ruleId: rule.id,
      itemCount: items.length, expectedCount,
      subtotal, expectedTotal, answer: answerPath ? path.basename(answerPath) : null,
      problems
    })
  }
  const summary = { ERROR: 0, WARNING: 0, INFO: 0, PASS: 0, ok: true }
  for (const r of results) summary[r.verdict] = (summary[r.verdict] || 0) + 1
  summary.ok = summary.ERROR === 0
  return { results, summary, scanned }
}
