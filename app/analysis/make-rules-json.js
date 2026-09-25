// 깃허브 규칙 업데이트 서버용 rules.json 생성기
// 사용: node analysis\make-rules-json.js
// app/src/main/lib/rules/ 의 전체 규칙을 builtin 우선순위 순서대로 묶어
// {version, generatedAt, count, rules} 형식으로 저장소 루트 rules.json 에 저장한다.
// 실행할 때마다 patch 버전이 0.0.1씩 오른다 — 커밋·푸시하면 사용자 [업데이트 확인]에 반영된다.
// (관리자 도구/lib/admin.js 와 동일한 형식 — 구 배열 형식은 앱의 읽기에서 하위호환된다)
const fs = require('fs')
const path = require('path')
const BASE = path.resolve(__dirname, '..', '..')
const RULES = path.join(BASE, 'app', 'src', 'main', 'lib', 'rules')
const ORDER = [
  'gmarket-cart', 'kyobo-cart', 'aladin-order', 'aladin',
  'gmarket', 'kyobo', 'naver', 'naver-cart',
  'dreamdepot-order', 'dreamdepot', 'icecream-cart', 'icecreammall',
  'alphamall-cart', 'alphamall', 'st11-cart', '11st',
  'yes24-cart', 'yes24', 'teachermall-cart', 'teachermall',
  'auction-cart', 'auction', 'coupang',
  'emartmall-cart', 'emartmall',
  'eleparts', 'ic114', 'lottemart', 'officedepot-order', 'officedepot',
  'daisomall-order', 'daisomall'
]
const byId = {}
for (const f of fs.readdirSync(RULES)) {
  if (!f.endsWith('.json')) continue
  const r = JSON.parse(fs.readFileSync(path.join(RULES, f), 'utf-8'))
  byId[r.id] = r
}
const missing = ORDER.filter(id => !byId[id])
if (missing.length) console.log('ORDER 중 파일 없음(관리자 도구에서 삭제됨 — rules.json에서 제외):', missing.join(','))
const extra = Object.keys(byId).filter(id => !ORDER.includes(id))
if (extra.length) console.log('ORDER에 없는 규칙(맨 뒤에 추가):', extra.join(','))
const present = ORDER.filter(id => byId[id])
const list = present.map(id => byId[id]).concat(extra.map(id => byId[id]))
const out = path.join(BASE, 'rules.json')
let prev = {}
try { prev = JSON.parse(fs.readFileSync(out, 'utf-8')) } catch {}
const prevVersion = prev && !Array.isArray(prev) && prev.version ? prev.version : '1.0.0'
const pm = String(prevVersion).match(/^(\d+)\.(\d+)\.(\d+)$/)
const version = pm ? `${pm[1]}.${pm[2]}.${Number(pm[3]) + 1}` : '1.0.0'
const doc = { version, generatedAt: new Date().toISOString(), count: list.length, rules: list }
fs.writeFileSync(out, JSON.stringify(doc, null, 2), 'utf-8')
console.log(`rules.json 생성: ${out} | 규칙 ${list.length}건 | 버전 v${version} | ${Math.round(fs.statSync(out).size / 1024)}KB`)
console.log('다음: git add rules.json && git commit && git push → 사용자 [업데이트 확인]에 반영')
