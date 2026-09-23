// Chrome/Edge/Whale Bookmarks 파일에서 🛒품의캡처 관련 노드 전수 조사 (읽기 전용)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const roots = [
  { browser: 'chrome', dir: path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data') },
  { browser: 'edge', dir: path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'User Data') },
  { browser: 'whale', dir: path.join(process.env.LOCALAPPDATA || '', 'Naver', 'Naver Whale', 'User Data') }
]

const out = []
function walk(node, trail, hits) {
  if (!node) return
  if (node.type === 'url' && (node.name || '').includes('품의') || (node.url || '').includes('127.0.0.1:573')) {
    hits.push({
      name: node.name, guid: node.guid, id: node.id,
      port: (node.url.match(/127\.0\.0\.1:(\d+)/) || [])[1] || null,
      isJavascript: (node.url || '').startsWith('javascript:'),
      trail: trail.join(' > ').slice(0, 80)
    })
  }
  for (const c of node.children || []) walk(c, [...trail, node.name || node.type], hits)
}

for (const r of roots) {
  if (!fs.existsSync(r.dir)) { out.push({ browser: r.browser, installed: false }); continue }
  for (const entry of fs.readdirSync(r.dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const f = path.join(r.dir, entry.name, 'Bookmarks')
    if (!fs.existsSync(f)) continue
    try {
      const data = JSON.parse(fs.readFileSync(f, 'utf-8'))
      const hits = []
      for (const key of Object.keys(data.roots || {})) walk(data.roots[key], [key], hits)
      out.push({
        browser: r.browser, profile: entry.name, captureBookmarks: hits.length,
        detail: hits.map(h => ({ name: h.name, port: h.port, js: h.isJavascript, where: h.trail, guid: h.guid, id: h.id }))
      })
    } catch (e) {
      out.push({ browser: r.browser, profile: entry.name, error: String(e.message) })
    }
  }
}

fs.writeFileSync(path.join(here, 'probe-bookmarks.json'), JSON.stringify(out, null, 2), 'utf-8')
console.log('written')
