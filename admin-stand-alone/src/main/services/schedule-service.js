/*
 * 프로그램 자동 시작/종료 일정 (Windows 작업 스케줄러 연동)
 * - 시작: schtasks 작업 등록으로 설정 시각에 프로그램 자동 실행(--auto-started 플래그 전달)
 * - 종료: 자동 시작으로 켜진 세션에서 설정 시각 도달시 앱이 스스로 닫힘(main의 타이머)
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const DEFAULT_TASK_NAME = 'ShoppingMallRuleManager_AutoStart'

export function buildTaskCmdline({ execPath, appPath, isPackaged }) {
  const exe = `"${execPath}"`
  return isPackaged ? `${exe} --auto-started` : `${exe} "${appPath}" --auto-started`
}

async function schtasks(args, timeoutMs = 20000) {
  const { stdout } = await execFileAsync('schtasks', args, { timeout: timeoutMs, windowsHide: true })
  return stdout || ''
}

export async function isTaskRegistered(taskName) {
  try {
    const out = await schtasks(['/Query', '/TN', taskName])
    return out.includes(taskName)
  } catch {
    return false
  }
}

export async function registerAutoStartTask(taskName, time, cmdline) {
  await schtasks(['/Create', '/F', '/TN', taskName, '/SC', 'DAILY', '/ST', time, '/TR', `"${cmdline}"`])
  return isTaskRegistered(taskName)
}

export async function unregisterAutoStartTask(taskName) {
  try { await schtasks(['/Delete', '/F', '/TN', taskName]) } catch {}
  return !(await isTaskRegistered(taskName))
}

export function parseHm(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}
