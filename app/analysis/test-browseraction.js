const { execFile } = require('child_process')
const fs = require('fs')
const path = require('path')
const { promisify } = require('util')
const execFileAsync = promisify(execFile)

const BROWSERS = [
  { key: 'chrome', exeName: 'chrome.exe', userDataDir: path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data') },
  { key: 'edge', exeName: 'msedge.exe', userDataDir: path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data') },
  { key: 'whale', exeName: 'whale.exe', userDataDir: path.join(process.env.LOCALAPPDATA, 'Naver', 'Naver Whale', 'User Data') }
]

async function browserProcessInfo(exeName) {
  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile', '-Command',
      `Get-CimInstance Win32_Process -Filter "Name='${exeName}'" | Select-Object ExecutablePath,CommandLine | ConvertTo-Json -Compress`
    ])
    const out = String(stdout || '').trim()
    if (!out) return []
    let data = JSON.parse(out)
    if (!Array.isArray(data)) data = [data]
    return data.filter(p => p && p.CommandLine && !p.CommandLine.includes('--type='))
  } catch {
    return []
  }
}

function profileFromCmdline(cmdline) {
  const prof = /--profile-directory=(?:"([^"]+)"|(\S+))/.exec(cmdline)
  const udir = /--user-data-dir=(?:"([^"]+)"|(\S+))/.exec(cmdline)
  return {
    profile: prof ? (prof[1] || prof[2]) : null,
    userDataDir: udir ? (udir[1] || udir[2]) : null
  }
}

function lastActiveProfile(userDataDir) {
  try {
    const st = JSON.parse(fs.readFileSync(path.join(userDataDir, 'Local State'), 'utf-8')).profile || {}
    const active = st.last_active_profiles || []
    return active[0] || st.last_used || 'Default'
  } catch {
    return 'Default'
  }
}

;(async () => {
  for (const b of BROWSERS) {
    const procs = await browserProcessInfo(b.exeName)
    const hasLS = fs.existsSync(path.join(b.userDataDir, 'Local State'))
    if (procs.length) {
      const p0 = procs[0]
      const parsed = profileFromCmdline(p0.CommandLine || '')
      const udir = parsed.userDataDir || b.userDataDir
      const profile = parsed.profile || lastActiveProfile(udir)
      console.log(`${b.key}: RUNNING | exe=${p0.ExecutablePath} | profile=${profile} (cmdline=${parsed.profile ? 'yes' : 'no'}, localState=${hasLS})`)
      console.log(`   cmd: ${(p0.CommandLine || '').slice(0, 140)}`)
    } else {
      console.log(`${b.key}: not running | localState=${hasLS} | lastProfile=${lastActiveProfile(b.userDataDir)}`)
    }
  }
})()
