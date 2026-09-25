import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const BROWSER_DATA = [
  { key: 'chrome', label: 'Chrome', exeName: 'chrome.exe', extensionsPage: 'chrome://extensions/', userDataDir: path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data') },
  { key: 'edge', label: 'Edge', exeName: 'msedge.exe', extensionsPage: 'edge://extensions/', userDataDir: path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'User Data') },
  { key: 'whale', label: 'Whale', exeName: 'whale.exe', extensionsPage: 'whale://extensions/', userDataDir: path.join(process.env.LOCALAPPDATA || '', 'Naver', 'Naver Whale', 'User Data') }
]

export function findBookmarkFiles(userDataDir) {
  const out = []
  if (!fs.existsSync(userDataDir)) return out
  for (const entry of fs.readdirSync(userDataDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const f = path.join(userDataDir, entry.name, 'Bookmarks')
    if (fs.existsSync(f)) out.push(f)
  }
  return out
}

// 설치된 브라우저별 프로필 목록 — 북마크바 추가 대상을 사용자가 고를 수 있게 한다.
// Local State의 profile.info_cache에서 표시 이름을 읽고, Bookmarks 파일이 있는
// 프로필(실제 사용 중인 프로필)만 대상으로 한다.
export function listBrowserProfiles() {
  const out = []
  for (const b of BROWSER_DATA) {
    if (!fs.existsSync(b.userDataDir)) continue
    let infos = {}
    try {
      const ls = JSON.parse(fs.readFileSync(path.join(b.userDataDir, 'Local State'), 'utf-8'))
      infos = (ls.profile && ls.profile.info_cache) || {}
    } catch {}
    for (const entry of fs.readdirSync(b.userDataDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = entry.name
      if (/^(System Profile|Guest Profile|Crashpad|ShaderCache|GrShaderCache|GraphiteDawnCache)$/i.test(dir)) continue
      if (!fs.existsSync(path.join(b.userDataDir, dir, 'Bookmarks'))) continue
      const info = infos[dir] || {}
      const name = info.name || info.user_name || (dir === 'Default' ? '기본 프로필' : dir)
      out.push({ browser: b.key, browserLabel: b.label, dir, name })
    }
  }
  return out
}

function chromeEpochNow() {
  return String((BigInt(Date.now()) + 11644473600000n) * 1000n)
}

function collectMaxId(node, acc) {
  const id = parseInt(node && node.id, 10)
  if (Number.isFinite(id) && id > acc.val) acc.val = id
  for (const c of (node && node.children) || []) collectMaxId(c, acc)
}

// 북마크릿 코드가 개선되면 URL이 달라진다 — 옛 버전(임의 포트의 /html 북마크릿)도
// 같은 🛒품의캡처 노드로 취급해 재추가 시 교체(중복 생성 방지)한다.
function isCaptureUrl(nodeUrl, url) {
  if (nodeUrl === url) return true
  return typeof nodeUrl === 'string' &&
    nodeUrl.startsWith('javascript:') &&
    nodeUrl.includes('127.0.0.1:573') &&
    nodeUrl.includes('/html')
}

function countMatches(parent, name, url) {
  if (!parent || !Array.isArray(parent.children)) return 0
  let n = 0
  for (const c of parent.children) {
    if (c && c.type === 'url' && c.name === name && isCaptureUrl(c.url, url)) n++
    else n += countMatches(c, name, url)
  }
  return n
}

function detachMatches(parent, name, url, acc) {
  if (!Array.isArray(parent.children)) return
  const keep = []
  for (const c of parent.children) {
    if (c && c.type === 'url' && c.name === name && isCaptureUrl(c.url, url)) acc.push(c)
    else {
      detachMatches(c, name, url, acc)
      keep.push(c)
    }
  }
  parent.children = keep
}

export function addBookmarkToFront(bookmarksFile, name, url, stableGuid) {
  let data
  try {
    data = JSON.parse(fs.readFileSync(bookmarksFile, 'utf-8'))
  } catch (e) {
    return { ok: false, error: `파일 읽기 실패: ${e.message}` }
  }
  const bar = data && data.roots && data.roots.bookmark_bar
  if (!bar || !Array.isArray(bar.children)) {
    return { ok: false, error: '북마크바 구조를 찾을 수 없음' }
  }

  const front = bar.children[0]
  const atFront = !!(front && front.type === 'url' && front.url === url && front.name === name)
  if (atFront) {
    let rest = 0
    if (bar.children.length > 1) rest += countMatches({ children: bar.children.slice(1) }, name, url)
    for (const key of Object.keys(data.roots)) {
      if (key === 'bookmark_bar') continue
      rest += countMatches(data.roots[key], name, url)
    }
    if (rest === 0) return { ok: true, added: false, already: true }
  }

  try {
    fs.copyFileSync(bookmarksFile, bookmarksFile + '.arge-bak')
  } catch {}

  // 기존 노드를 guid/id/date_added 그대로 재사용해 맨 앞으로 이동 (새 guid로 재생성하면
  // 동기화가 옛 guid 노드를 서버 위치(맨뒤)로 부활시킴 — 재생성 금지, 이동만).
  // stableGuid: 프로필 여러 개가 각자 다른 guid를 만들면 동기화가 그들을 서로 다른
  // 북마크로 병합해 프로필마다 복제본이 계속 늘어난다 — 모든 프로필이 같은 guid를
  // 쓰도록 생성 시 재사용하고, 중복 정리 때도 stableGuid 노드를 우선 보존한다.
  const found = []
  detachMatches(bar, name, url, found)
  for (const key of Object.keys(data.roots)) {
    if (key === 'bookmark_bar') continue
    detachMatches(data.roots[key], name, url, found)
  }
  let node = (stableGuid && found.find(n => n.guid === stableGuid)) || found[0]
  const existed = !!node
  if (!node) {
    const acc = { val: 0 }
    for (const key of Object.keys(data.roots)) collectMaxId(data.roots[key], acc)
    node = {
      date_added: chromeEpochNow(),
      guid: stableGuid || crypto.randomUUID(),
      id: String(acc.val + 1),
      name,
      type: 'url',
      url
    }
  } else {
    node.url = url
  }
  bar.children.unshift(node)
  try {
    bar.date_modified = chromeEpochNow()
  } catch {}
  // 브라우저가 파일을 외부 수정으로 간주해 재정렬/무시하는 것을 막으려면 체크섬 제거 필수.
  // Bookmarks.bak에도 같은 내용을 남긴다 — 브라우저가 Bookmarks를 무효 판단해 .bak에서
  // 복원할 때 옛 상태(중복)가 되살아나는 것을 차단.
  delete data.checksum
  const json = JSON.stringify(data, null, 3)
  fs.writeFileSync(bookmarksFile, json, 'utf-8')
  try {
    fs.writeFileSync(bookmarksFile + '.bak', json, 'utf-8')
  } catch {}
  return { ok: true, added: !existed, already: existed }
}

export function readCaptureBookmarkCount(bookmarksFile, name, url) {
  try {
    const data = JSON.parse(fs.readFileSync(bookmarksFile, 'utf-8'))
    let n = 0
    for (const key of Object.keys(data.roots || {})) {
      n += countMatches(data.roots[key], name, url)
    }
    return n
  } catch {
    return -1
  }
}

export function isCaptureBookmarkAtFront(bookmarksFile, name, url) {
  try {
    const data = JSON.parse(fs.readFileSync(bookmarksFile, 'utf-8'))
    const bar = data && data.roots && data.roots.bookmark_bar
    const front = bar && Array.isArray(bar.children) && bar.children[0]
    return !!(front && front.type === 'url' && front.url === url && front.name === name)
  } catch {
    return false
  }
}
