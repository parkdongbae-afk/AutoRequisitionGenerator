import XLSX from 'xlsx'

// K-에듀파인 사업관리카드(예산) 엑셀 파싱 (Proposal.md §5.2)
// 셀 색상에 의존하지 않고 행 구조(들여쓰기 단계)·공백 셀 패턴으로 3단 계층을 복원한다.
//   A열: "세부사업 / 세부항목 / 원가통계비목" — 들여쓰기 폭으로 단계 구분 (예: 4칸=세부사업, 7칸=세부항목, 10칸=비목)
//   B열: 산출내역
// 반환: { sheetName, businesses: [{ name, items: [{ name, accounts: [{ name, detail }] }] }] }
// 가. 내역 표시값 = `${비목} - ${산출내역}` (예: "일반수용비 - 안심번호서비스")

function cell(v) {
  return v === undefined || v === null ? '' : String(v)
}

function indentOf(raw) {
  const m = String(raw).match(/^[ \t]*/)
  return (m ? m[0] : '').replace(/\t/g, '    ').length
}

export function parseBudgetCard(filePath) {
  const wb = XLSX.readFile(filePath)
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false })

  // 데이터 시작 위치: "합 계" 행 다음부터(제목/머리글/합계 제외). 못 찾으면 첫 행 다음부터.
  let start = -1
  for (let i = 0; i < rows.length; i++) {
    const a = cell(rows[i][0]).replace(/\s/g, '')
    if (a === '합계') { start = i + 1; break }
  }
  if (start < 0) start = 1

  const businesses = []
  // 상대 들여쓰기 스택: 같거나 얕은 들여쓰기가 나오면 스택을 pop해 부모를 찾는다 —
  // 들여쓰기 폭이 파일마다 달라도(4/7/10 외) 계층이 그대로 복원된다.
  const stack = [] // { indent, kind: 'business' | 'item', node }

  for (let i = start; i < rows.length; i++) {
    const rawA = cell(rows[i][0])
    const b = cell(rows[i][1]).trim()
    const trimmed = rawA.trim()
    if (!trimmed && !b) continue
    if (/^합\s*계/.test(trimmed)) continue

    const indent = indentOf(rawA)
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
    const parent = stack[stack.length - 1] || null

    if (!parent) {
      const node = { name: trimmed || b, items: [] }
      businesses.push(node)
      if (trimmed) stack.push({ indent, kind: 'business', node })
      continue
    }

    if (parent.kind === 'business') {
      const node = { name: trimmed || b, accounts: [] }
      parent.node.items.push(node)
      if (trimmed) stack.push({ indent, kind: 'item', node })
    } else {
      parent.node.accounts.push({ name: trimmed || b, detail: b })
    }
  }

  return { sheetName, businesses }
}
