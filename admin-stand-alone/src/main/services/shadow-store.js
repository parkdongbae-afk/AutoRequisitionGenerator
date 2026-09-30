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
