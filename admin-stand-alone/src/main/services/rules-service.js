// 규칙 편집·삭제·builtin 등록·Git 커밋 — 기존 admin.js 로직을 재사용한다(§4.1 권장안 A).
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { listMalls, deleteMall, registerBuiltinRules, rebuildRulesJson, resolveRepoRoot } from '../../../../app/src/main/lib/admin.js'

const execFileAsync = promisify(execFile)

export function rulesList() {
  return listMalls()
}

// 규칙 편집 저장 — 소스 rules + analysis 사본 두 곳에 동시 기록(§13.1)
export function saveRule(repoRoot, rule) {
  if (!rule || !rule.id) throw new Error('규칙 id가 없습니다')
  const targets = [
    path.join(repoRoot, 'app', 'src', 'main', 'lib', 'rules', `${rule.id}.json`),
    path.join(repoRoot, 'app', 'analysis', 'rules', `${rule.id}.json`)
  ]
  const json = JSON.stringify(rule, null, 2) + '\n'
  for (const t of targets) {
    fs.mkdirSync(path.dirname(t), { recursive: true })
    fs.writeFileSync(t, json)
  }
  return { files: targets }
}

export { deleteMall as deleteRule, registerBuiltinRules, rebuildRulesJson, resolveRepoRoot }

export async function gitCommit(repoRoot, files, message, { push = false, log = () => {} } = {}) {
  const run = async (args) => {
    const { stdout } = await execFileAsync('git', args, { cwd: repoRoot, timeout: 60000 })
    return String(stdout || '')
  }
  await run(['add', ...files])
  await run(['commit', '-m', message])
  let pushed = false
  if (push) {
    await run(['push', 'origin', 'main'])
    pushed = true
  }
  log(`커밋 완료${pushed ? ' + 푸시' : ''}`)
  return { pushed }
}
