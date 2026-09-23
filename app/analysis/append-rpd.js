const fs = require('fs')
const p = '../RPD.md'
let s = fs.readFileSync(p, 'utf-8')
const anchor = '- 2026-09-13 (v1.3.0)'
const i = s.indexOf(anchor)
if (i < 0) { console.log('anchor 없음'); process.exit(1) }
const lineEnd = s.indexOf('\n', i)
const add = '\n- 2026-09-13 (v1.4.0): 매핑 4단계 "단가"→"주문금액" (예상단가=주문금액÷수량 자동 환산), 사용자 규칙 삭제 UI(규칙 관리), 그리드 행 추가(문서 없으면 직접 입력 문서 자동 생성), 익스텐션 추가 모달(확장 페이지 링크·개발자 모드 강조·브라우저별 자동 로드·경로 복사), 북마크바 추가 - Chrome/Edge/웨일 북마크바 제일 앞에 품의캡처 자동 삽입(실행 중이면 확인 후 종료→삽입→재시작, 프로필별 백업/중복 제거)'
s = s.slice(0, lineEnd) + add + s.slice(lineEnd)
fs.writeFileSync(p, s, 'utf-8')
console.log('RPD 이력 추가 완료')
