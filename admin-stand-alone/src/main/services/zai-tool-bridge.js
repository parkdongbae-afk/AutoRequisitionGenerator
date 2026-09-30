/*
 * Z.ai Coding Plan 연동 — 1순위 OpenCode 브리지(ADMIN_SATAD_ALONE.MD §0-A.2·§10.3)
 * 설치된 OpenCode(oh-my-opencode 포함 배포판)를 감지하고 버전·사용 가능 모델·
 * Coding Plan 인증 상태를 조회한다. 규칙 생성은 이후 단계(generateRule)에서 확장한다.
 *
 * API Key·토큰 값은 절대 반환하지 않는다(§0-A.1.6 — auth 조회는 존재 여부만 판정).
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const TIMEOUT_MS = 20000

// Windows npm 전역 설치는 opencode.ps1/.cmd 래퍼다 — execFile로 .cmd/.ps1을 직접
// 실행하면 ENOENT/EINVAL이 나므로 cmd.exe /c로 실행한다(인자는 고정 리터럴만 사용).
const CANDIDATES = ['opencode']

async function runTool(args) {
  let lastErr = null
  for (const cmd of CANDIDATES) {
    try {
      const { stdout } = await execFileAsync('cmd.exe', ['/d', '/s', '/c', cmd, ...args], { timeout: TIMEOUT_MS, windowsHide: true })
      return String(stdout || '')
    } catch (e) {
      lastErr = e
      if (e.code === 'ENOENT') continue
    }
  }
  const err = new Error('opencode not found: ' + String(lastErr && lastErr.message || lastErr))
  err.code = 'ENOENT'
  throw err
}

async function detectOpenCode() {
  try {
    const out = await runTool(['--version'])
    return { version: out.trim().split(/\r?\n/)[0] || '' }
  } catch (e) {
    if (e.code === 'ENOENT') return null
    return { version: '', error: String(e.message || e) }
  }
}

// `opencode models` 출력: "provider/model" 한 줄 = 1모델
async function listModels() {
  const out = await runTool(['models'])
  return out
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && l.includes('/'))
    .map(line => {
      const idx = line.indexOf('/')
      const provider = line.slice(0, idx)
      const model = line.slice(idx + 1)
      return { id: line, provider, model, codingPlan: provider === 'zai-coding-plan' }
    })
}

// `opencode auth list` — 자격증명 존재 여부만 확인하고 값은 절대 노출하지 않는다
async function authStatus() {
  try {
    const out = await runTool(['auth', 'list'])
    const plain = out.replace(/\x1b\[[0-9;]*m/g, '') // ANSI 컬러 코드 제거
    return {
      codingPlanAuth: /Z\.AI Coding Plan/i.test(plain),
      providers: (plain.match(/●\s*([^\r\n~]+)?/g) || [])
        .map(s => s.replace(/[●┌└│├┤┐┘─]+/g, '').trim())
        .filter(s => s && !/Credentials|auth\.json/i.test(s))
    }
  } catch (e) {
    return { codingPlanAuth: false, error: String(e.message || e) }
  }
}

export async function detectBridge() {
  const oc = await detectOpenCode()
  if (!oc) {
    return { detected: false, tool: 'OpenCode', hint: 'OpenCode가 설치되어 있지 않습니다 — npm install -g opencode-ai' }
  }
  let models = []
  let modelError = ''
  try {
    models = await listModels()
  } catch (e) {
    modelError = String(e.message || e)
  }
  const auth = await authStatus()
  return {
    detected: true,
    tool: 'OpenCode',
    version: oc.version,
    versionError: oc.error || '',
    models,
    codingPlanModels: models.filter(m => m.codingPlan),
    otherModels: models.filter(m => !m.codingPlan),
    codingPlanAuth: !!auth.codingPlanAuth,
    modelError
  }
}
