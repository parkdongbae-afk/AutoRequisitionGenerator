// 규칙 파일 저장·Git 커밋 — Electron 의존 없는 순수 모듈(§13·§17).
// rules-service.js가 re-export하므로 main 프로세스 호출부 API는 변하지 않는다.
import fs from 'node:fs'
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

// 삭제 대상 목록(§16.1) — 소스 필수, analysis 사본은 있으면 포함
export function deletionTargets(repoRoot, id) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(id))) throw new Error('잘못된 규칙 id입니다')
  const source = path.join(repoRoot, 'app', 'src', 'main', 'lib', 'rules', `${id}.json`)
  const analysis = path.join(repoRoot, 'app', 'analysis', 'rules', `${id}.json`)
  const targets = []
  if (!fs.existsSync(source)) throw new Error(`소스 규칙 파일이 없습니다: ${id}.json`)
  targets.push(source)
  if (fs.existsSync(analysis)) targets.push(analysis)
  return targets
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
