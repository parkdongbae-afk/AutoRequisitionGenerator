// candidate-ranker 단위 테스트 (JEV.MD §17 점수표)
const { scoreCandidate, rankCandidates } = require('../../src/main/services/candidate-ranker.js')

let fail = 0
function eq(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (ok ? '' : ` actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`))
  if (!ok) fail++
}

const allOk = { schemaValid: true, itemCount: 5, countMatches: true, totalWithinTolerance: true, namesAllPresent: true, pricesPositive: true, checkedOnlyValid: true, optionRowsValid: true, shippingValid: true }
eq('전 항목 통과 = 100점', scoreCandidate(allOk).score, 100)
eq('건수 불일치 = 80점', scoreCandidate({ ...allOk, countMatches: false }).score, 80)
eq('0건 + 이름 없음 = 80점(추출10+이름10 상실)', scoreCandidate({ ...allOk, itemCount: 0, namesAllPresent: false }).score, 80)

const ranked = rankCandidates([
  { id: 'b', score: 80 },
  { id: 'a', score: 100 },
  { id: 'c', score: 90 }
])
eq('랭킹 1위', ranked[0].id, 'a')
eq('랭킹 순서', ranked.map(r => r.id).join(','), 'a,c,b')

console.log(fail === 0 ? 'ALL PASS' : `FAIL ${fail}건`)
process.exit(fail ? 1 : 0)
