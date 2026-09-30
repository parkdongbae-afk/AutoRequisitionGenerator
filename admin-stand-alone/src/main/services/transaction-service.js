/*
 * 트랜잭션 서비스 (ADMIN_SATAD_ALONE.MD §13.2)
 * 모든 규칙 파일 적용은 스냅샷 → 임시 검증 → 원자 적용 → 실패 시 자동 롤백 순서를 따른다.
 * 이력은 <userData>/transactions/<opId>/manifest.json에 남기고 복원을 지원한다.
 * fs만 쓰는 순수 모듈이라 node 단위 테스트 가능하다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'

// changes: [{ path: 절대경로, content: 문자열 | null(삭제) }]
export function createPlan(changes) {
  const list = (Array.isArray(changes) ? changes : []).filter(c => c && c.path)
  if (!list.length) throw new Error('트랜잭션 변경 항목이 없습니다')
  for (const c of list) {
    if (c.content != null && typeof c.content !== 'string') throw new Error(`파일 내용은 문자열이어야 합니다: ${c.path}`)
  }
  return { id: `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`, changes: list, createdAt: new Date().toISOString() }
}

export function previewTransaction(plan) {
  return plan.changes.map(c => {
    const exists = fs.existsSync(c.path)
    return {
      path: c.path,
      action: c.content == null ? 'delete' : exists ? 'modify' : 'create',
      existed: exists,
      beforeBytes: exists ? fs.statSync(c.path).size : 0,
      afterBytes: c.content == null ? 0 : Buffer.byteLength(c.content, 'utf-8')
    }
  })
}

function opDir(userDataDir, id) {
  return path.join(userDataDir, 'transactions', id)
}

export function validatePlan(plan) {
  const errors = []
  for (const c of plan.changes) {
    if (c.content == null) continue
    if (/\.json$/i.test(c.path)) {
      try { JSON.parse(c.content) } catch (e) {
        errors.push(`JSON 구문 오류 ${path.basename(c.path)}: ${String(e.message || e).slice(0, 120)}`)
      }
    }
  }
  return { ok: errors.length === 0, errors }
}

/*
 * 적용 (§13.2 순서). 검증 실패·쓰기 실패 시 before/ 스냅샷으로 전체 롤백한다.
 * postValidate(적용 직후)가 false/예외를 내면 자동 롤백한다.
 */
export function applyTransaction(userDataDir, plan, { postValidate } = {}) {
  const dir = opDir(userDataDir, plan.id)
  const beforeDir = path.join(dir, 'before')
  const afterDir = path.join(dir, 'after')
  fs.mkdirSync(beforeDir, { recursive: true })
  fs.mkdirSync(afterDir, { recursive: true })

  const snapshotNames = new Map()
  try {
    for (const c of plan.changes) {
      const rel = safeRel(c.path)
      if (rel == null) throw new Error(`허용되지 않은 경로: ${c.path}`)
      if (fs.existsSync(c.path)) {
        fs.copyFileSync(c.path, path.join(beforeDir, rel))
        snapshotNames.set(c.path, rel)
      }
      if (c.content != null) {
        const afterPath = path.join(afterDir, rel)
        fs.mkdirSync(path.dirname(afterPath), { recursive: true })
        fs.writeFileSync(afterPath, c.content, 'utf-8')
      }
    }
  } catch (e) {
    throw new Error(`스냅샷 실패(원본 무손상): ${String(e.message || e)}`)
  }

  const validation = validatePlan(plan)
  if (!validation.ok) {
    writeManifest(userDataDir, plan, snapshotNames, { status: 'validation_blocked', errors: validation.errors })
    return { ok: false, status: 'validation_blocked', errors: validation.errors, id: plan.id }
  }

  const applied = []
  try {
    for (const c of plan.changes) {
      if (c.content == null) {
        if (fs.existsSync(c.path)) fs.rmSync(c.path)
      } else {
        fs.mkdirSync(path.dirname(c.path), { recursive: true })
        fs.writeFileSync(c.path, c.content, 'utf-8')
      }
      applied.push(c.path)
    }
    if (postValidate) postValidate()
    const manifest = writeManifest(userDataDir, plan, snapshotNames, { status: 'applied', errors: [] })
    return { ok: true, status: 'applied', id: plan.id, manifest }
  } catch (e) {
    const rollbackErrors = restore(beforeDir, snapshotNames, applied)
    writeManifest(userDataDir, plan, snapshotNames, { status: 'rolled_back', errors: [String(e.message || e), ...rollbackErrors] })
    return { ok: false, status: 'rolled_back', id: plan.id, error: String(e.message || e), rollbackErrors }
  }
}

function safeRel(targetPath) {
  const norm = path.normalize(String(targetPath))
  if (!/^[A-Za-z]:[\\/]/.test(norm)) return null
  return norm.slice(3).replace(/[\\/:*?"<>|]/g, '_')
}

function restore(beforeDir, snapshotNames, applied) {
  const errors = []
  for (const p of applied) {
    try {
      const rel = snapshotNames.get(p)
      if (rel && fs.existsSync(path.join(beforeDir, rel))) {
        fs.mkdirSync(path.dirname(p), { recursive: true })
        fs.copyFileSync(path.join(beforeDir, rel), p)
      } else if (fs.existsSync(p)) {
        fs.rmSync(p)
      }
    } catch (e) {
      errors.push(`복원 실패 ${path.basename(p)}: ${String(e.message || e)}`)
    }
  }
  return errors
}

function writeManifest(userDataDir, plan, snapshotNames, extra) {
  const dir = opDir(userDataDir, plan.id)
  const manifest = {
    id: plan.id,
    createdAt: plan.createdAt,
    finishedAt: new Date().toISOString(),
    repoRoot: null,
    changes: plan.changes.map(c => ({
      path: c.path,
      action: c.content == null ? 'delete' : fs.existsSync(c.path) || snapshotNames.has(c.path) ? 'modify-or-create' : 'create',
      backup: snapshotNames.get(c.path) || null
    })),
    ...extra
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf-8')
  return manifest
}

export function listTransactions(userDataDir) {
  const root = path.join(userDataDir, 'transactions')
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root)
    .map(id => {
      try {
        const m = JSON.parse(fs.readFileSync(path.join(root, id, 'manifest.json'), 'utf-8'))
        return { id, status: m.status, finishedAt: m.finishedAt, changes: (m.changes || []).map(c => c.path) }
      } catch { return null }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt)))
    .slice(0, 50)
}

/*
 * 복원(§29.3) — 적용된 트랜잭션의 before/ 스냅샷으로 되돌린다.
 * 생성(신규 파일)이었던 것은 삭제하고, 수정이었던 것은 원본을 되돌린다.
 */
export function rollbackTransaction(userDataDir, id) {
  const dir = opDir(userDataDir, id)
  const manifestPath = path.join(dir, 'manifest.json')
  let manifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  } catch (e) {
    return { ok: false, error: `트랜잭션 이력을 읽지 못했습니다: ${String(e.message || e)}` }
  }
  if (manifest.status !== 'applied') {
    return { ok: false, error: `되돌릴 수 없는 상태입니다: ${manifest.status}` }
  }
  const beforeDir = path.join(dir, 'before')
  const errors = []
  for (const c of manifest.changes || []) {
    try {
      const hadBackup = c.backup && fs.existsSync(path.join(beforeDir, c.backup))
      if (hadBackup) {
        fs.mkdirSync(path.dirname(c.path), { recursive: true })
        fs.copyFileSync(path.join(beforeDir, c.backup), c.path)
      } else if (fs.existsSync(c.path)) {
        fs.rmSync(c.path)
      }
    } catch (e) {
      errors.push(`복원 실패 ${path.basename(c.path)}: ${String(e.message || e)}`)
    }
  }
  manifest.status = errors.length ? 'rollback_partial' : 'rolled_back'
  manifest.rolledBackAt = new Date().toISOString()
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8')
  return { ok: errors.length === 0, status: manifest.status, errors, id }
}
