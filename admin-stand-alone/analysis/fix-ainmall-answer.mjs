// 무료배송 정답 수정 — 부가세 포함 단가를 화면 표시 단가(부가세 제외)로 교정
// 근거: 캡처 lineTotal 단가 실측 (아이스크림 8,000 / 기문김깃 28,000 / NEW 8,000 / NEW 8,000)
import XLSX from 'xlsx'
import path from 'node:path'

const out = path.join('..', 'Check', '아인몰', '배송비무료', '정답_배송비무료_아인몰_수정.xlsx')
const rows = [
  ['품목명', '수량', '단가'],
  ['아이스크림 스틱컵 뚜껑포함 게임보지', 1, 8000],
  ['스펀지보드 기문김깃 컴퓨터 머스탠 키득띡무 사이드보드 게임보드', 2, 28000],
  ['스펀지보드 NEW 소자 7팀 1,2 (2개입)', 2, 8000],
  ['스펀지보드 NEW 소자 7팀 1,2 (3개입)', 3, 8000]
]
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1')
XLSX.writeFile(wb, out)
console.log('수정 정답 저장:', path.resolve(out))
console.log('합계:', rows.slice(1).reduce((s, r) => s + r[1] * r[2], 0).toLocaleString('ko-KR') + '원')
