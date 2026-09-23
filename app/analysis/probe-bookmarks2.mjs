// 북마크 중복 재발 진단: ① 현재 북마크 상태(이전 스냅샷과 guid 비교) ② 새 exe 사용 여부(bookmarkGuid) ③ Chrome 프로필별 확장 설치 상태
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const out = { bookmarks: [], extensionInProfiles: [], settings: null, prevSnapshot: null }

// ① 현재 북마크 상태
const roots = [
  { browser: 'chrome', dir: path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data') },
  { browser: 'edge', dir: path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'User Data') }
]
function walk(node, trail, hits) {
  if (!node) return
  const isCapture = (node.name || '').includes('품의캡처')
  const isPortUrl = /127\.0\.0\.1:5733\d/.test(node.url || '')
  if (node.type === 'url' && (isCapture || isPortUrl)) {
    hits.push({ name: node.name, guid: node.guid, id: node.id, port: (node.url.match(/127\.0\.0\.1:(\d+)/) || [])[1] || null, js: (node.url || '').startsWith('javascript:'), where: trail.slice(-2).join('>') })
  }
  for (const c of node.children || []) walk(c, [...trail, node.name || node.type], hits)
}
for (const r of roots) {
  if (!fs.existsSync(r.dir)) continue
  for (const entry of fs.readdirSync(r.dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const f = path.join(r.dir, entry.name, 'Bookmarks')
    if (!fs.existsSync(f)) continue
    try {
      const data = JSON.parse(fs.readFileSync(f, 'utf-8'))
      const hits = []
      for (const key of Object.keys(data.roots || {})) walk(data.roots[key], [key], hits)
      const bak = f + '.arge-bak'
      out.bookmarks.push({
        browser: r.browser, profile: entry.name, count: hits.length,
        hits,
        mtime: fs.statSync(f).mtime.toISOString(),
        bakExists: fs.existsSync(bak), bakMtime: fs.existsSync(bak) ? fs.statSync(bak).mtime.toISOString() : null
      })
    } catch (e) { out.bookmarks.push({ browser: r.browser, profile: entry.name, error: String(e.message) }) }
  }
}

// ② 새 빌드 사용 여부
try {
  out.settings = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA, '자동 품의 요구 생성기', 'settings.json'), 'utf-8'))
} catch (e) { out.settings = { error: String(e.message) } }

// ③ 각 Chrome 프로필에 확장이 설치되어 있는지 (Preferences의 extensions 설정)
const chromeDir = roots[0].dir
if (fs.existsSync(chromeDir)) {
  for (const entry of fs.readdirSync(chromeDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const pref = path.join(chromeDir, entry.name, 'Secure Preferences')
    const pref2 = path.join(chromeDir, entry.name, 'Preferences')
    let found = []
    for (const p of [pref, pref2]) {
      try {
        const raw = fs.readFileSync(p, 'utf-8')
        // 확장 이름/경로 단서 검색
        if (raw.includes('품의 생성기') || raw.includes('품의\\u0020생성기') || /extension/i.test(raw) && raw.includes('57330')) {
          const j = JSON.parse(raw)
          const exts = (j.extensions && j.extensions.settings) || {}
          for (const [id, v] of Object.entries(exts)) {
            const manifest = v && v.manifest
            if (manifest && (String(manifest.name || '').includes('품의') || String(v.path || '').includes('품의') || /extension$/.test(String(v.path || '')) && manifest.name === '품의 생성기 - 주문화면 전송 (Chrome/Edge/Whale)')) {
              found.push({ id, version: manifest.version, path: v.path, fromBookmarks: !!manifest.permissions && manifest.permissions.includes('bookmarks') })
            }
          }
        }
      } catch {}
    }
    // 경로 기반 재탐색(이름 매칭 실패 대비): 모든 확장 중 bookmarks 권한+57330 힌트
    if (!found.length) {
      for (const p of [pref, pref2]) {
        try {
          const j = JSON.parse(fs.readFileSync(p, 'utf-8'))
          const exts = (j.extensions && j.extensions.settings) || {}
          for (const [id, v] of Object.entries(exts)) {
            const m = v && v.manifest
            if (m && Array.isArray(m.permissions) && m.permissions.includes('bookmarks') && /57330|pageCapture/.test(JSON.stringify(v))) {
              found.push({ id, version: m.version, path: v.path, name: m.name })
            }
          }
        } catch {}
      }
    }
    if (found.length) out.extensionInProfiles.push({ profile: entry.name, extensions: found })
  }
}

fs.writeFileSync(path.join(here, 'probe-bookmarks2.json'), JSON.stringify(out, null, 2), 'utf-8')
console.log('written')
