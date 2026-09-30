// 규칙 파일 저장·Git 커밋 — Electron 의존 없는 순수 모듈(§13·§17).
// rules-service.js가 re-export하므로 main 프로세스 호출부 API는 변하지 않는다.
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

// 규칙 적용 대상 파일 목록(§13.1) — 소스 rules + analysis 사본. 트랜잭션 changes로 소비한다.
export function ruleChanges(repoRoot, rule) {
  if (!rule || !rule.id) throw new Error('규칙 id가 없습니다')
  const json = JSON.stringify(rule, null, 2) + '\n'
  return [
    { path: path.join(repoRoot, 'app', 'src', 'main', 'lib', 'rules', `${rule.id}.json`), content: json },
    { path: path.join(repoRoot, 'app', 'analysis', 'rules', `${rule.id}.json`), content: json }
  ]
}

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
