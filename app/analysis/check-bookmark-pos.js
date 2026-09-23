const fs = require('fs')
const path = require('path')

const dirs = [
  { label: 'chrome', userDataDir: path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data') },
  { label: 'edge', userDataDir: path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data') },
  { label: 'whale', userDataDir: path.join(process.env.LOCALAPPDATA, 'Naver', 'Naver Whale', 'User Data') }
]

for (const b of dirs) {
  if (!fs.existsSync(b.userDataDir)) { console.log(`${b.label}: no user data`); continue }
  for (const entry of fs.readdirSync(b.userDataDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const f = path.join(b.userDataDir, entry.name, 'Bookmarks')
    if (!fs.existsSync(f)) continue
    try {
      const data = JSON.parse(fs.readFileSync(f, 'utf8'))
      const bar = data.roots && data.roots.bookmark_bar
      if (!bar || !Array.isArray(bar.children)) continue
      const idx = bar.children.findIndex(c => /품의캡처/.test(c.name || ''))
      const first3 = bar.children.slice(0, 3).map(c => (c.name || '').slice(0, 15))
      const last2 = bar.children.slice(-2).map(c => (c.name || '').slice(0, 15))
      console.log(`${b.label}[${entry.name}]: total=${bar.children.length} 품의캡처idx=${idx} checksum=${data.checksum ? 'present' : 'ABSENT'} 앞3=[${first3.join(' | ')}] 뒤2=[${last2.join(' | ')}]`)
    } catch (e) {
      console.log(`${b.label}[${entry.name}]: parse error ${e.message}`)
    }
  }
}
