// Shadow Mode 기록 (JEV.MD §19) — userData/shadow-mode.jsonl에 1줄 1레코드로 누적한다.
// Jev 결과는 초기에 배포를 차단·승인하지 않고 관리자 판정과 비교 수집만 한다.
import fs from 'node:fs'
import path from 'node:path'

export function shadowStorePath(userDataDir) {
  return path.join(userDataDir, 'shadow-mode.jsonl')
}

export function appendShadowRecord(userDataDir, record) {
  const p = shadowStorePath(userDataDir)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.appendFileSync(p, JSON.stringify({ ts: new Date().toISOString(), ...record }) + '\n')
}

export function readShadowRecords(userDataDir) {
  const p = shadowStorePath(userDataDir)
  if (!fs.existsSync(p)) return []
  return fs.readFileSync(p, 'utf-8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(l => { try { return JSON.parse(l) } catch { return null } })
    .filter(Boolean)
}

/*
 * 관리자 판정 확정 — 해당 규칙의 adminDecision이 비어 있는(대기 중) 레코드를 찾아
 * 관리자 판단(approve/repair/reject)을 확정한다. 이미 확정된 레코드는 건드리지 않는다.
 */
export function resolveAdminDecision(userDataDir, ruleId, adminDecision) {
  if (!['approve', 'repair', 'reject'].includes(adminDecision)) {
    return { updated: 0, error: `판정 값 오류: ${adminDecision}` }
  }
  const p = shadowStorePath(userDataDir)
  if (!fs.existsSync(p)) return { updated: 0, error: 'shadow 기록이 없습니다' }
  const lines = fs.readFileSync(p, 'utf-8')
    .split(/\r?\n/)
    .filter(Boolean)
  let updated = 0
  const out = lines.map(line => {
    let rec
    try { rec = JSON.parse(line) } catch { return line }
    if (rec.ruleId === ruleId && !rec.adminDecision) {
      rec.adminDecision = adminDecision
      rec.resolvedAt = new Date().toISOString()
      updated++
      return JSON.stringify(rec)
    }
    return line
  })
  fs.writeFileSync(p, out.join('\n') + (out.length ? '\n' : ''), 'utf-8')
  return { updated }
}
