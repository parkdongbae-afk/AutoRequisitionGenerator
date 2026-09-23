const fs = require('fs')
const path = require('path')
const os = require('os')
const { addBookmarkToFront } = require('../src/main/lib/bookmarks.js')
const { buildBookmarklet } = require('../src/main/lib/bookmarklet.js')

const tmp = path.join(os.tmpdir(), 'arge-bm-test')
fs.mkdirSync(tmp, { recursive: true })

const sample = {
  checksum: 'abc',
  roots: {
    bookmark_bar: {
      children: [
        { date_added: '100', guid: '11111111-1111-1111-1111-111111111111', id: '5', name: '네이버', type: 'url', url: 'https://naver.com' },
        { date_added: '101', guid: '22222222-2222-2222-2222-222222222222', id: '3', name: '폴더', type: 'folder', children: [{ date_added: '102', guid: '33333333-3333-3333-3333-333333333333', id: '8', name: '구글', type: 'url', url: 'https://google.com' }] }
      ],
      date_added: '1',
      date_modified: '1',
      guid: '00000000-0000-0000-0000-000000000000',
      id: '1',
      name: '북마크바',
      type: 'folder'
    },
    other: { children: [], id: '2', name: '기타', type: 'folder' }
  },
  version: 1
}

const f = path.join(tmp, 'Bookmarks')
fs.writeFileSync(f, JSON.stringify(sample, null, 3), 'utf-8')

const bmUrl = buildBookmarklet(57330)
const r1 = addBookmarkToFront(f, '🛒품의캡처', bmUrl)
const after1 = JSON.parse(fs.readFileSync(f, 'utf-8'))
const bar1 = after1.roots.bookmark_bar.children
console.assert(r1.ok && r1.added, '1차 추가 실패')
console.assert(bar1[0].name === '🛒품의캡처' && bar1[0].url === bmUrl, '제일 앞 삽입 실패')
console.assert(bar1[0].id === '9', `id 증가 실패 (기대 9, 실제 ${bar1[0].id})`)
console.assert(bar1.length === 3, '기존 북마크 보존 실패')
console.assert(fs.existsSync(f + '.arge-bak'), '백업 파일 없음')

const r2 = addBookmarkToFront(f, '🛒품의캡처', bmUrl)
const after2 = JSON.parse(fs.readFileSync(f, 'utf-8'))
console.assert(r2.ok && r2.already && !r2.added, '중복 실행 인식 실패')
console.assert(after2.roots.bookmark_bar.children.length === 3, '중복 추가 발생')

const sample2 = JSON.parse(JSON.stringify(sample))
sample2.roots.bookmark_bar.children.push({ date_added: '200', guid: '44444444-4444-4444-4444-444444444444', id: '20', name: '🛒품의캡처', type: 'url', url: bmUrl })
fs.writeFileSync(f, JSON.stringify(sample2, null, 3), 'utf-8')
const r3 = addBookmarkToFront(f, '🛒품의캡처', bmUrl)
const after3 = JSON.parse(fs.readFileSync(f, 'utf-8'))
const bar3 = after3.roots.bookmark_bar.children
console.assert(!r3.added && r3.already, '기존 노드 이동 인식 실패 (추가로 Creation 금지)')
console.assert(bar3.length === 3 && bar3[0].name === '🛒품의캡처', '뒤에 있는 것 앞으로 이동 실패')
console.assert(bar3[0].id === '20' && bar3[0].guid === '44444444-4444-4444-4444-444444444444' && bar3[0].date_added === '200', '기존 노드 guid/id/date_added 보존 실패 (보존 안 하면 동기화가 옛 guid를 맨뒤로 부활시킴)')

const sample4 = JSON.parse(JSON.stringify(sample))
sample4.roots.other.children.push({ date_added: '300', guid: '55555555-5555-5555-5555-555555555555', id: '30', name: '🛒품의캡처', type: 'url', url: bmUrl })
fs.writeFileSync(f, JSON.stringify(sample4, null, 3), 'utf-8')
const r4 = addBookmarkToFront(f, '🛒품의캡처', bmUrl)
const after4 = JSON.parse(fs.readFileSync(f, 'utf-8'))
console.assert(!r4.added && r4.already, 'other 폴더에 이미 있을 때 생성 금지 실패')
console.assert(after4.roots.bookmark_bar.children[0].guid === '55555555-5555-5555-5555-555555555555', 'other 노드를 바로 이동 실패')
console.assert(after4.roots.other.children.length === 0, 'other 잔존 정리 실패')

// stableGuid: 신규 생성 시 재사용
const STABLE = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const f2 = path.join(tmp, 'Bookmarks2')
fs.writeFileSync(f2, JSON.stringify(sample, null, 3), 'utf-8')
addBookmarkToFront(f2, '🛒품의캡처', bmUrl, STABLE)
const b2 = JSON.parse(fs.readFileSync(f2, 'utf-8')).roots.bookmark_bar.children
console.assert(b2[0].guid === STABLE, 'stableGuid 재사용 실패')

// stableGuid: 기존 중복 2개(앞=다른 guid, 뒤=stableGuid)면 stableGuid 노드를 보존·전면 이동
const sample5 = JSON.parse(JSON.stringify(sample))
sample5.roots.bookmark_bar.children.unshift({ date_added: '400', guid: 'ffffffff-0000-0000-0000-000000000000', id: '40', name: '🛒품의캡처', type: 'url', url: bmUrl })
sample5.roots.bookmark_bar.children.push({ date_added: '401', guid: STABLE, id: '41', name: '🛒품의캡처', type: 'url', url: bmUrl })
fs.writeFileSync(f2, JSON.stringify(sample5, null, 3), 'utf-8')
addBookmarkToFront(f2, '🛒품의캡처', bmUrl, STABLE)
const b5 = JSON.parse(fs.readFileSync(f2, 'utf-8')).roots.bookmark_bar.children
const dupCount = b5.filter(c => c.name === '🛒품의캡처').length
console.assert(dupCount === 1, `중복 수렴 실패 (${dupCount}개)`)
console.assert(b5[0].guid === STABLE, 'stableGuid 노드 우선 보존 실패')

// Bookmarks.bak 동일 내용 기록 — 브라우저의 .bak 복원 경로로 옛 중복이 되살아나지 않게
const bakFile = f2 + '.bak'
console.assert(fs.existsSync(bakFile), 'Bookmarks.bak 미기록')
const bakData = JSON.parse(fs.readFileSync(bakFile, 'utf-8'))
const bakBar = bakData.roots.bookmark_bar.children
console.assert(bakBar.filter(c => c.name === '🛒품의캡처').length === 1 && bakBar[0].name === '🛒품의캡처', 'Bookmarks.bak 내용 불일치')

// read-back 검증 헬퍼
const cnt = require('../src/main/lib/bookmarks.js').readCaptureBookmarkCount(f2, '🛒품의캡처', bmUrl)
const atFront = require('../src/main/lib/bookmarks.js').isCaptureBookmarkAtFront(f2, '🛒품의캡처', bmUrl)
console.assert(cnt === 1, `readCaptureBookmarkCount 실패 (${cnt})`)
console.assert(atFront === true, 'isCaptureBookmarkAtFront 실패')

console.log('북마크 변환 테스트 전부 통과 | 북마크릿 길이:', bmUrl.length, '| starts javascript:', bmUrl.startsWith('javascript:'))
