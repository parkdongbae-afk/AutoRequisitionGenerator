// 깃허브 규칙 업데이트 서버용 rules.json 생성기
// 사용: node analysis\make-rules-json.js
// app/src/main/lib/rules/ 의 전체 규칙을 builtin 우선순위 순서대로 하나의 배열로 묶어
// 저장소 루트 rules.json 으로 저장한다 — 커밋·푸시하면 사용자 [업데이트 확인]에 반영된다.
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
if (missing.length) throw new Error('규칙 파일 누락: ' + missing.join(','))
const extra = Object.keys(byId).filter(id => !ORDER.includes(id))
if (extra.length) console.log('ORDER에 없는 규칙(맨 뒤에 추가):', extra.join(','))
const list = ORDER.map(id => byId[id]).concat(extra.map(id => byId[id]))
const out = path.join(BASE, 'rules.json')
fs.writeFileSync(out, JSON.stringify(list, null, 2), 'utf-8')
console.log(`rules.json 생성: ${out} | 규칙 ${list.length}건 | ${Math.round(fs.statSync(out).size / 1024)}KB`)
console.log('다음: git add rules.json && git commit && git push → 사용자 [업데이트 확인]에 반영')
