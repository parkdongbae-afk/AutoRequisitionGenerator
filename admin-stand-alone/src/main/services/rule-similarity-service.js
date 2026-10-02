/*
 * 유사 규칙 자동 선정 (ADMIN_SATAD_ALONE.MD §10-A.5)
 * 새 캡처의 DOM 특징(테이블/리스트 구조·체크박스·옵션 행·배송비 텍스트·수량 입력·class 토큰)을
 * 프로파일링하고, 기존 규칙들과 구조 유사도를 점수화해 몇 샷 예시로 쓸 상위 규칙을 고른다.
 * cheerio 없이 정규식 기반으로 계산해 가볍게 유지한다(캡처는 이미 160KB로 압축된 상태).
 */
import fs from 'node:fs'
import path from 'node:path'

export function profileCapture(html, location = '') {
  const s = String(html || '')
  const classes = new Set()
  const classRe = /class=["']([^"']+)["']/g
  let m
  let guard = 0
  while ((m = classRe.exec(s)) && guard < 5000) {
    guard++
    for (const c of m[1].split(/\s+/)) if (c) classes.add(c.toLowerCase())
  }
  const domain = (() => { try { return new URL(location).hostname.replace(/^www\./, '') } catch { return '' } })()
  return {
    classes,
    hasCheckbox: /type=["']?checkbox/i.test(s) || /class=["'][^"']*check/i.test(s),
    tableish: /<tr[\s>]/i.test(s),
    listish: /<(li|div)[\s>]/i.test(s),
    optionHint: /옵션|사이즈|선택하세요/.test(s),
    shippingHint: /배송비|무료배송|배송료/.test(s),
    qtyHint: /수량|<input[^>]*(qty|quantity|ea)/i.test(s),
    domain
  }
}

export function scoreRuleSimilarity(rule, profile) {
  const sels = JSON.stringify(rule.rowSelector || '') + JSON.stringify(rule.fields || {}) +
    JSON.stringify(rule.checkedOnly || '') + JSON.stringify(rule.optionRows || '')
  const ruleTokens = new Set((sels.toLowerCase().match(/[a-z0-9_-]{3,}/g) || []))
  let score = 0
  const reasons = []

  let overlap = 0
  for (const t of ruleTokens) if (profile.classes.has(t)) overlap++
  if (overlap > 0) {
    score += Math.min(10, overlap * 2)
    reasons.push(`class 토큰 ${overlap}개 겹침`)
  }

  const isCart = /-cart$/.test(String(rule.id || '')) || !!rule.checkedOnly
  if (rule.checkedOnly && profile.hasCheckbox) { score += 15; reasons.push('체크박스 구조 일치') }
  if (!isCart && !profile.hasCheckbox) { score += 5; reasons.push('주문서형(체크박스 없음)') }

  if (rule.optionRows && profile.optionHint) { score += 15; reasons.push('옵션 행 구조 힌트') }

  if (profile.tableish && /\b(tr|table)[\s.[]/.test(sels)) { score += 8; reasons.push('테이블 행 구조') }
  if (!profile.tableish && profile.listish && /\b(li|div)[\s.[]/.test(sels)) { score += 3; reasons.push('리스트 구조') }

  if (rule.priceIs === 'lineTotal' && profile.shippingHint) { score += 2; reasons.push('합계 환산 힌트') }
  const shipMode = rule.shipping && rule.shipping.mode
  if ((shipMode === 'selector' || shipMode === 'row') && profile.shippingHint) { score += 4; reasons.push('배송비 표시 존재') }
  if (rule.fields && rule.fields.qty && profile.qtyHint) { score += 2; reasons.push('수량 입력 힌트') }
  if (profile.domain && (rule.match || []).some(mm => profile.domain.includes(String(mm).toLowerCase()))) {
    score += 6; reasons.push('도메인 일치')
  }
  return { score, reasons }
}

export function loadRepoRules(repoRoot) {
  const dir = repoRoot && path.join(repoRoot, 'app', 'src', 'main', 'lib', 'rules')
  if (!dir || !fs.existsSync(dir)) return []
  const list = []
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json') || f === 'meta.json') continue
    try {
      const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'))
      if (r.id && Array.isArray(r.match)) list.push(r)
    } catch {}
  }
  return list
}

export function pickSimilarRules(rules, profile, { limit = 3, minScore = 8 } = {}) {
  return (rules || [])
    .map(r => ({ id: r.id, name: r.name || r.id, ...scoreRuleSimilarity(r, profile) }))
    .filter(x => x.score >= minScore)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit)
}
