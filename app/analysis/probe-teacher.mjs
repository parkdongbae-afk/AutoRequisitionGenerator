// 교사박동배 프로필 식별 + 해당 프로필 북마크 guid 상세 분석 (이전 스냅샷과 비교)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const chromeDir = path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data')
const out = { profileMap: {}, targets: {}, prevGuids: null }

// ① 프로필 디렉터리 ↔ 표시 이름 매핑 (Local State info_cache)
try {
  const ls = JSON.parse(fs.readFileSync(path.join(chromeDir, 'Local State'), 'utf-8'))
  const cache = (ls.profile && ls.profile.info_cache) || {}
  for (const [dir, info] of Object.entries(cache)) {
    out.profileMap[dir] = { name: info.name, gaiaName: info.gaia_name || null, userName: info.user_name || null }
  }
} catch (e) { out.profileMapError = String(e.message) }

// ② 교사박동배(이름에 '교사' 또는 '박동배' 포함) 프로필 + 전 프로필 상세
function collectHits(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
  const hits = []
  const walk = (node, where) => {
    if (!node) return
    if (node.type === 'url' && (node.name || '').includes('품의캡처')) {
      hits.push({ name: node.name, guid: node.guid, id: node.id, port: (node.url.match(/127\.0\.0\.1:(\d+)/) || [])[1] || null, where: where.slice(-2).join('>') })
    }
    for (const c of node.children || []) walk(c, [...where, node.name || node.type])
  }
  for (const key of Object.keys(data.roots || {})) walk(data.roots[key], [key])
  return { hits, mtime: fs.statSync(file).mtime.toISOString(), checksum: data.checksum || null }
}

for (const entry of fs.readdirSync(chromeDir, { withFileTypes: true })) {
  if (!entry.isDirectory() || !/^(Default|Profile \d+)$/.test(entry.name)) continue
  const f = path.join(chromeDir, entry.name, 'Bookmarks')
  if (!fs.existsSync(f)) continue
  try {
    const { hits, mtime, checksum } = collectHits(f)
    out.targets[entry.name] = {
      profileLabel: out.profileMap[entry.name] ? out.profileMap[entry.name].name : '?',
      count: hits.length,
      mtime, hasChecksum: checksum != null,
      guids: hits.map(h => h.guid),
      atFront: hits.length ? hits.some(h => h.id === JSON.parse(fs.readFileSync(f, 'utf-8')).roots.bookmark_bar.children[0]?.id) : false
    }
  } catch (e) { out.targets[entry.name] = { error: String(e.message) } }
}

// ③ 이전 스냅샷(직전 probe-bookmarks2)의 Default guid와 비교 — 옛 엔티티 부활 vs 새 guid 생성
try {
  const prev = JSON.parse(fs.readFileSync(path.join(here, 'probe-bookmarks2.json'), 'utf-8'))
  const prevDefault = prev.bookmarks.find(b => b.browser === 'chrome' && b.profile === 'Default')
  if (prevDefault) {
    out.prevSnapshot = {
      when: '직전 프로브',
      defaultCount: prevDefault.count,
      defaultGuids: prevDefault.hits.map(h => h.guid)
    }
    const cur = out.targets.Default
    if (cur && cur.guids) {
      out.comparison = {
        overlap: cur.guids.filter(g => out.prevSnapshot.defaultGuids.includes(g)).length,
        newGuids: cur.guids.filter(g => !out.prevSnapshot.defaultGuids.includes(g)).length,
        stableGuidInCurrent: cur.guids.includes('756b97b7-c413-4ae4-94c7-146fe056466d')
      }
    }
  }
} catch (e) { out.prevError = String(e.message) }

fs.writeFileSync(path.join(here, 'probe-teacher.json'), JSON.stringify(out, null, 2), 'utf-8')
console.log('written')
