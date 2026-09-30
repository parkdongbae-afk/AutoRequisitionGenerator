// 대상 저장소 탐지·구조 검증 (ADMIN_SATAD_ALONE.MD §8)
import fs from 'node:fs'
import path from 'node:path'

export function detectProjectRoot(startDir) {
  let dir = path.resolve(startDir)
  for (let i = 0; i < 6 && dir; i++) {
    if (fs.existsSync(path.join(dir, 'rules.json')) && fs.existsSync(path.join(dir, '.git'))) return dir
    const up = path.dirname(dir)
    if (up === dir) break
    dir = up
  }
  return null
}

export function projectInfo(repoRoot) {
  if (!fs.existsSync(path.join(repoRoot, 'rules.json')) || !fs.existsSync(path.join(repoRoot, '.git'))) {
    return null
  }
  const rulesDir = path.join(repoRoot, 'app', 'src', 'main', 'lib', 'rules')
  const rules = fs.existsSync(rulesDir)
    ? fs.readdirSync(rulesDir)
        .filter(f => f.endsWith('.json') && f !== 'meta.json')
        .map(f => {
          try {
            const r = JSON.parse(fs.readFileSync(path.join(rulesDir, f), 'utf-8'))
            return r.id ? { id: r.id, name: r.name || r.id, checkedOnly: !!r.checkedOnly, optionRows: !!r.optionRows, inOrder: false } : null
          } catch { return null }
        })
        .filter(Boolean)
    : []
  let rulesJsonVersion = ''
  try { rulesJsonVersion = JSON.parse(fs.readFileSync(path.join(repoRoot, 'rules.json'), 'utf-8')).version || '' } catch {}
  return {
    repoRoot,
    rulesDir,
    rules,
    rulesCount: rules.length,
    rulesJsonVersion,
    git: fs.existsSync(path.join(repoRoot, '.git'))
  }
}
