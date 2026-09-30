/*
 * Git 연동 (ADMIN_SATAD_ALONE.MD §7.8·§17)
 * - 금지사항 준수: `git add .`/`-A` 금지(명시 파일만), `--force` 금지, shell:true 금지(인자 배열 실행).
 * - status/diff는 읽기 전용, stage는 파일 목록 검증을 통과한 것만, commit/push는 분리 호출.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const MAX_DIFF_BYTES = 200 * 1024

async function git(repoRoot, args, timeoutMs = 60000) {
  const { stdout } = await execFileAsync('git', args, { cwd: repoRoot, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, windowsHide: true })
  return String(stdout || '')
}

// porcelain v1 한 줄 → { staged, worktree, untracked, path, renamedFrom }
export function parsePorcelain(out) {
  return String(out || '')
    .split(/\r?\n/)
    .filter(l => l.trim())
    .map(line => {
      const x = line[0]
      const y = line[1]
      let p = line.slice(3)
      let renamedFrom = null
      const arrow = p.indexOf(' -> ')
      if (arrow !== -1) {
        renamedFrom = p.slice(0, arrow)
        p = p.slice(arrow + 4)
      }
      return {
        path: p,
        renamedFrom,
        staged: x !== ' ' && x !== '?' && x !== 'U',
        worktree: y !== ' ' && y !== '?' && y !== 'U',
        untracked: x === '?' && y === '?',
        status: x === '?' ? 'untracked' : x === 'U' || y === 'U' ? 'conflict' : `${x}${y}`.trim()
      }
    })
}

export async function gitStatus(repoRoot) {
  const branch = (await git(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
  const files = parsePorcelain(await git(repoRoot, ['status', '--porcelain']))
  return { branch, files }
}

export async function gitDiff(repoRoot, paths) {
  const args = ['diff', '--']
  for (const p of safePaths(paths)) args.push(p)
  const out = await git(repoRoot, args)
  return out.length > MAX_DIFF_BYTES ? out.slice(0, MAX_DIFF_BYTES) + '\n… (diff 잘림)' : out
}

// §17.2 — 작업 파일만 stage한다. '.', '-A', '-u', '--all' 등은 인자 자체를 금지한다.
export function safePaths(paths) {
  const list = (Array.isArray(paths) ? paths : []).map(p => String(p).trim()).filter(Boolean)
  if (!list.length) throw new Error('stage할 파일을 선택하세요')
  for (const p of list) {
    if (/^(--all|-A|-u|\.|-i|--patch)$/.test(p)) throw new Error(`허용되지 않은 stage 인자: ${p}`)
    if (p.includes('..')) throw new Error(`허용되지 않은 경로: ${p}`)
  }
  return list
}

export async function gitStage(repoRoot, paths) {
  await git(repoRoot, ['add', '--', ...safePaths(paths)])
  return { staged: safePaths(paths) }
}

export async function gitCommit(repoRoot, message) {
  const msg = String(message || '').trim()
  if (!msg) throw new Error('커밋 메시지를 입력하세요')
  const out = await git(repoRoot, ['commit', '-m', msg]).catch(e => {
    const text = String((e && e.stderr) || e.message || '')
    if (/nothing to commit/.test(text)) throw new Error('커밋할 변경사항이 없습니다')
    throw new Error(`git commit 실패: ${text.slice(0, 300)}`)
  })
  const hash = (await git(repoRoot, ['rev-parse', '--short', 'HEAD'])).trim()
  return { ok: true, hash, output: out.trim().split(/\r?\n/)[0] }
}

// §17.4 — push 실패는 파일 적용 실패가 아니다. 로컬 커밋은 보존되고 결과만 분리 보고한다.
export async function gitPush(repoRoot, { remote = 'origin', branch } = {}) {
  const b = String(branch || (await git(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim())
  try {
    await git(repoRoot, ['push', remote, b], 120000)
    return { ok: true, remote, branch: b }
  } catch (e) {
    const text = String((e && e.stderr) || e.message || '')
    if (/Everything up-to-date/.test(text)) return { ok: true, remote, branch: b, upToDate: true }
    return { ok: false, remote, branch: b, error: text.slice(0, 300) }
  }
}

export async function gitAheadBehind(repoRoot, { remote = 'origin' } = {}) {
  try {
    const out = await git(repoRoot, ['rev-list', '--left-right', '--count', `${remote}/HEAD...HEAD`])
    const [behind, ahead] = out.trim().split(/\s+/).map(n => Number(n) || 0)
    return { behind, ahead }
  } catch {
    return { behind: null, ahead: null }
  }
}
