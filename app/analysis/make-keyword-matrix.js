// Proposal/제목 키워드 자동 유추.csv → src/renderer/src/lib/keywordMatrix.js 생성
// CSV가 업데이트되면 다시 실행: cd app && node analysis/make-keyword-matrix.js
const fs = require('fs')
const path = require('path')

const csvPath = path.join(__dirname, '..', '..', 'Proposal', '제목 키워드 자동 유추.csv')
const outPath = path.join(__dirname, '..', 'src', 'renderer', 'src', 'lib', 'keywordMatrix.js')
const TYPE_MAP = { '물품 구입': 'buy', '수당 지급': 'allowance', '협의회 실시': 'council' }

const raw = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '')
const lines = raw.split(/\r?\n/).slice(1).map(l => l.trim()).filter(Boolean)

const groups = []
let skipped = 0
for (const line of lines) {
  const parts = line.split(',')
  if (parts.length < 3) { skipped++; continue }
  const type = TYPE_MAP[parts[0].trim()]
  if (!type) { skipped++; continue }
  const keys = parts[1].split('/').map(k => k.trim()).filter(Boolean)
  const purpose = parts.slice(2).join(',').trim().replace(/^나\.\s*목적:\s*/, '')
  if (!keys.length || !purpose) { skipped++; continue }
  let g = groups.find(x => x.type === type && x.purpose === purpose)
  if (!g) { g = { type, keys: [], purpose }; groups.push(g) }
  for (const k of keys) if (!g.keys.includes(k)) g.keys.push(k)
}

const header = [
  '// 이 파일은 자동 생성됩니다 — 직접 편집하지 마세요.',
  '// 재생성: cd app && node analysis/make-keyword-matrix.js',
  `// 원본: Proposal/제목 키워드 자동 유추.csv (${lines.length}행 → 그룹 ${groups.length}건, 건너뜀 ${skipped})`,
  'export const KEYWORD_GROUPS ='
].join('\n')

fs.writeFileSync(outPath, header + ' ' + JSON.stringify(groups, null, 2) + '\n', 'utf8')

const byType = groups.reduce((m, g) => { m[g.type] = (m[g.type] || 0) + 1; return m }, {})
const keyCount = groups.reduce((n, g) => n + g.keys.length, 0)
console.log(`keywordMatrix.js 생성: 그룹 ${groups.length}건 (buy ${byType.buy || 0} / allowance ${byType.allowance || 0} / council ${byType.council || 0}), 키 ${keyCount}개, 건너뜀 ${skipped}`)
