// Chrome/Edge 프로필별 동기화 상태 확인 — 북마크 부활 메커니즘 확정용
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const out = []

const roots = [
  { browser: 'chrome', dir: path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data') },
  { browser: 'edge', dir: path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'User Data') }
]
for (const r of roots) {
  if (!fs.existsSync(r.dir)) continue
  const profiles = fs.readdirSync(r.dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)
  out.push({ browser: r.browser, topEntries: profiles.filter(p => /Sync Data|Local Sync|Bookmarks/i.test(p)) })
  for (const p of profiles) {
    if (!/^(Default|Profile \d+|Guest Profile)$/.test(p)) continue
    const prefPath = path.join(r.dir, p, 'Preferences')
    const rec = { browser: r.browser, profile: p }
    try {
      const j = JSON.parse(fs.readFileSync(prefPath, 'utf-8'))
      rec.syncRequested = j.sync && j.sync.requested
      rec.syncKeepEveryting = !!(j.sync && j.sync.keep_everything_synced)
      rec.syncTypes = j.sync && j.sync.selected_types_per_account ? Object.keys(j.sync.selected_types_per_account) : null
      rec.bookmarksSynced = (() => {
        const spa = j.sync && j.sync.selected_types_per_account
        if (!spa) return null
        for (const v of Object.values(spa)) if (Array.isArray(v)) return v.includes('bookmarks') || v.includes('typed_urls') ? v.join(',') : v.join(',')
        return null
      })()
      rec.signedIn = !!(j.google && j.google.services && j.google.services.signin_scoped_device_id) || !!(j.google && j.google.services && j.google.services.last_account_id) || !!(j.google && j.google.services && j.google.services.username)
      rec.account = (j.google && j.google.services && (j.google.services.last_signed_in_username || j.google.services.username)) || null
    } catch (e) { rec.prefError = String(e.message) }
    rec.syncDataDir = fs.existsSync(path.join(r.dir, p, 'Sync Data'))
    rec.bakExists = fs.existsSync(path.join(r.dir, p, 'Bookmarks.bak'))
    const bak = path.join(r.dir, p, 'Bookmarks.bak')
    if (rec.bakExists) {
      try {
        const bj = JSON.parse(fs.readFileSync(bak, 'utf-8'))
        const find = (n) => { let c = 0; const walk = (x) => { if (!x) return; if (x.type === 'url' && /5733\d/.test(x.url || '') && (x.name || '').includes('품의캡처')) c++; (x.children || []).forEach(walk) }; Object.values(bj.roots || {}).forEach(walk); return c }
        rec.bakCaptureCount = find(bj)
      } catch {}
    }
    out.push(rec)
  }
}

// Chrome 버전 (137+ 여부 — --load-extension 차단)
try {
  const exe = path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe')
  out.push({ chromeExeExists: fs.existsSync(exe) })
} catch {}

fs.writeFileSync(path.join(here, 'probe-sync.json'), JSON.stringify(out, null, 2), 'utf-8')
console.log('written')
