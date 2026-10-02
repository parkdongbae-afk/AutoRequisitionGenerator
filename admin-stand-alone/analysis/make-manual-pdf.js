// 쇼핑몰 규칙 관리자 사용법 매뉴얼 PDF 생성 (app/analysis/make-admin-manual-pdf.js와 동일 pdfkit 방식)
// 사용: node analysis\make-manual-pdf.js → resources\쇼핑몰규칙관리자_사용설명서.pdf
const fs = require('fs')
const path = require('path')
const PDFDocument = require('pdfkit')

const out = path.join(__dirname, '..', 'resources', '쇼핑몰규칙관리자_사용설명서.pdf')
fs.mkdirSync(path.dirname(out), { recursive: true })

const W = 595.28
const M = 52
const CW = W - M * 2

const doc = new PDFDocument({ size: 'A4', margins: { top: 52, bottom: 52, left: M, right: M } })
doc.pipe(fs.createWriteStream(out))

doc.registerFont('kr', 'C:/Windows/Fonts/malgun.ttf')
doc.registerFont('kb', 'C:/Windows/Fonts/malgunbd.ttf')

const ensure = (h) => { if (doc.y + h > doc.page.maxY() - 10) doc.addPage() }
const H1 = (t) => {
  ensure(48)
  doc.font('kb').fontSize(15).fillColor('#1e293b').text(t, M, doc.y, { width: CW })
  doc.moveDown(0.35)
  doc.moveTo(M, doc.y).lineTo(W - M, doc.y).lineWidth(1.2).strokeColor('#7c3aed').stroke()
  doc.moveDown(0.6)
}
const H2 = (t) => {
  ensure(30)
  doc.font('kb').fontSize(12).fillColor('#6d28d9').text(t, M, doc.y, { width: CW })
  doc.moveDown(0.3)
}
const P = (t) => {
  doc.font('kr').fontSize(10).fillColor('#334155').text(t, M, doc.y, { width: CW, lineGap: 3 })
  doc.moveDown(0.25)
}
const B = (t) => {
  doc.font('kb').fontSize(10).fillColor('#0f172a').text('· ' + t, M + 8, doc.y, { width: CW - 8, lineGap: 2.5 })
  doc.moveDown(0.12)
}
const STEP = (n, t) => {
  ensure(22)
  const y0 = doc.y
  doc.font('kb').fontSize(10).fillColor('#7c3aed').text(`${n}.`, M, y0, { width: 18 })
  doc.font('kr').fontSize(10).fillColor('#334155').text(t, M + 18, y0, { width: CW - 18, lineGap: 3 })
  doc.moveDown(0.22)
}
const BOX = (title, lines, tone = 'purple') => {
  ensure(46)
  const c = tone === 'red' ? { t: '#991b1b', b: '#fca5a5' } : tone === 'green' ? { t: '#065f46', b: '#6ee7b7' } : { t: '#4c1d95', b: '#c4b5fd' }
  const y0 = doc.y
  doc.font('kb').fontSize(10).fillColor(c.t).text(title, M + 10, y0 + 7, { width: CW - 20 })
  let y = doc.y
  for (const l of lines) {
    doc.font('kr').fontSize(9.5).fillColor(c.t).text(l, M + 10, y, { width: CW - 20, lineGap: 2.5 })
    y = doc.y
  }
  const h = y + 8 - y0
  doc.lineWidth(1).strokeColor(c.b).roundedRect(M, y0, CW, h, 6).stroke()
  doc.y = y0 + h
  doc.moveDown(0.45)
}

/* ── 표지 ── */
doc.font('kb').fontSize(24).fillColor('#1e293b').text('쇼핑몰 규칙 관리자', M, 180, { width: CW, align: 'center' })
doc.font('kb').fontSize(13).fillColor('#6d28d9').text('사용법 매뉴얼', M, 216, { width: CW, align: 'center' })
doc.font('kr').fontSize(10.5).fillColor('#64748b').text(
  '쇼핑몰 캡처에서 품목을 추출하는 파싱 규칙을 만들고·검증하고·배포하는 관리자 전용 프로그램\n버전 v0.10.0 — 사용자용 "자동 품의 요구 생성기"와 동시 실행 가능(별도 저장소·포트)',
  M, 260, { width: CW, align: 'center', lineGap: 4 }
)
BOX('이 매뉴얼이 다루는 것', [
  '① 규칙 편집·삭제·복제 관리   ② AI 자동 생성(후보 3개 → 검증 → 판정)',
  '③ 클릭 매핑(AI 없이 클릭으로 규칙 생성)   ④ 검증 센터(전체 검증·샘플 추출 대조)',
  '⑤ 백업/복원(트랜잭션)   ⑥ 배포/Git(선택 stage·커밋/푸시 분리)'
], 'purple')
doc.font('kr').fontSize(9).fillColor('#94a3b8').text('ADMIN_SATAD_ALONE.MD · JEV.MD 명세 기반 — 매뉴얼 원본: admin-stand-alone/MANUAL.md', M, doc.page.maxY() - 40, { width: CW, align: 'center' })
doc.addPage()

/* ── 0. 화면 구성 ── */
H1('0. 화면 구성 (탭 방식)')
P('상단 탭으로 화면을 전환합니다. 탭을 옮겨도 진행 중인 작업은 유지됩니다.')
B('홈 — 대상 저장소·규칙 목록(검색·필터)·빠른 작업')
B('새 규칙 — AI 자동 생성(캡처 폴더 불러오기)')
B('클릭 매핑 — 캡처를 열어 클릭으로 규칙 생성')
B('검증 센터 — 전체 검증·샘플 추출 대조·규칙 비교')
B('배포/Git — 변경 파일 선택 stage·커밋·푸시')
B('백업/복원 — 트랜잭션 이력·되돌리기')
B('설정 — 글자 크기·TYPESAFE Key·Jev/Shadow·브리지 상태')
P('글자 크기는 설정에서 100%~150% 중 선택하며 즉시 적용·저장됩니다(기본 120%).')

/* ── 1. 시작하기 ── */
H1('1. 시작하기')
H2('1.1 사전 준비')
P('대상 저장소(rules.json과 .git이 있는 자동품의요구생성기 저장소)는 필수입니다. AI 생성을 쓰려면 OpenCode 설치와 Z.ai Coding Plan 등록(opencode auth login)이 필요하고, Jev 의미 판정을 쓰려면 TYPESAFE_API_KEY가 필요합니다. Key가 없어도 프로그램은 동작하며, 그때는 AI 결과가 자동 배포되지 않고 "관리자 검토" 상태로 남습니다.')
P('TYPESAFE_API_KEY 저장: Jev 판정 게이트 패널의 Key 입력란에 붙여넣고 [저장(safeStorage)] — Windows 암호화로 저장되며 평문으로 기록되지 않습니다.')
H2('1.2 실행과 저장소 열기')
STEP(1, 'ShoppingMallRuleManager-Portable.exe 실행 (개발: npm run dev)')
STEP(2, '상위 폴더에서 저장소 자동 탐지 — 못 찾으면 [폴더 선택…]로 rules.json이 있는 폴더 지정')
STEP(3, '상단에 경로·규칙 수·rules.json 버전·Git 상태가 보이면 준비 완료')
BOX('명령줄로 바로 열기', ['ShoppingMallRuleManager-Portable.exe --project=C:\\저장소경로'], 'green')

/* ── 2. 규칙 편집·삭제 ── */
H1('2. 규칙 편집·삭제')
H2('2.1 편집')
STEP(1, '규칙 목록에서 [편집] 클릭 → JSON 수정')
STEP(2, '[변경 전후 비교]로 +n/−n 줄 diff 확인')
STEP(3, '[💾 저장] — 소스 규칙 + analysis 사본 동시 저장, 저장 전 스냅샷 자동 백업(실패 시 자동 복구)')
H2('2.2 삭제 (2단계 확인)')
P('[삭제] 클릭 → 삭제 대상 파일 목록 확인 → 규칙 ID를 직접 입력해서 확인. 삭제 후 rules.json이 자동 재반영되며, 문제가 생기면 백업/복원 화면에서 되돌릴 수 있습니다.')
BOX('주의 — 삭제의 전파', ['삭제한 규칙이 교원용 프로그램에 반영되려면 새 exe 배포가 필요합니다.', 'rules.json 갱신만으로 builtin(내장) 규칙은 사라지지 않습니다.'], 'red')
H2('2.3 builtin 등록 · rules.json 재생성')
P('[builtin 등록]은 파일로만 있는 규칙을 프로그램 내장 목록에 추가합니다(새 exe에 포함될 규칙만). [rules.json 재생성]은 소스 규칙 전체로 배포용 rules.json을 다시 만듭니다.')

/* ── 3. AI 생성 ── */
H1('3. 새 규칙 만들기 (AI 자동 생성)')
H2('3.1 준비물')
P('캡처 HTML/MHTML — 화면 종류별로 최대 2개(주문서/장바구니 각각). 정답 Excel — 품목명·수량·단가가 있는 품목내역(통합) 형식 파일.')
H2('3.1 준비물 — 캡처 폴더 구성 (권장 방식)')
P('배송비는 구매 금액에 따라 무료이기도 하고 발생하기도 합니다. 두 상황의 캡처를 모두 준비하면 규칙 정확도가 올라갑니다. 폴더를 이렇게 구성하세요:')
CODE('무신사\\ 배송비무료\\ 장바구니.html · 장바구니.mhtml · 주문서.mhtml · 정답.xlsx')
CODE('무신사\\ 배송비발생\\ 장바구니2.mhtml · 주문서2.mhtml · 정답2.xlsx')
P('[폴더 불러오기] 한 번이면 끝입니다. 파일명·폴더명의 장바구니/주문서로 화면 종류를, 무료/유료(배송비)로 배송비 상태를 분류하고, 같은 폴더의 정답 Excel을 캡처별로 자동 매칭합니다. html+mhtml 중복은 mhtml 우선 1개만 남깁니다.')
P('캡처가 많아도 됩니다(종류당 최대 20개). AI 프롬프트에는 배송비 무료 1 + 발생 1 대표 샘플만 들어가고, 검증은 전체 캡처로 수행해 정확도를 높입니다. 파일 직접 선택도 그대로 사용할 수 있습니다.')
P('정답 Excel은 폴더에서 자동으로 가져온 것 중 하나가 기본 선택되며, 캡처별 정답이 붙은 샘플은 각자 자기 정답과 대조됩니다.')
P('캡처가 있는 화면 종류는 생성 대상 체크박스가 자동으로 켜집니다 — 주문서·장바구니 폴더가 섞여 있어도 한쪽이 빠지지 않습니다. html+mhtml 쌍은 같은 문서이므로 mhtml 1개로 병합되며 병합 수는 요약에 표시됩니다.')
H2('3.2 진행')
STEP(1, '[새 규칙 만들기] 클릭')
STEP(2, '쇼핑몰 이름 입력 → 기본 ID 자동 파생 (주문서: id, 장바구니: id-cart)')
STEP(3, '생성 대상 선택 → 화면 종류별 샘플 파일 선택(최대 2개)')
STEP(4, '정답 Excel 선택 + 정답 기준 화면 선택 (모르면 "공통/알 수 없음" — 0건 여부만 판정)')
STEP(5, '[생성 실행] — 진행 로그 실시간 표시')
STEP(6, '결과 확인 → [프로젝트에 적용]')
H2('3.3 결과 해석')
BOX('상태 판정표', [
  'approved — 로컬 검증(건수·총액 일치) + Jev 의미 판정 통과 → 적용 권장',
  'repaired — 1차 실패 후 AI가 수정, 정답과 일치 → 내용 확인 후 적용',
  'human_review — 자동 판정 실패 → 직접 확인하거나 폐기',
  'reject — 구조 부적합 → 샘플·정답 확인 후 재시도'
], 'green')
P('AI는 후보 3개를 만들고 각각 로컬 검증 + Jev 판정을 거칩니다. 1차 실패 시 최대 3회까지 스스로 수정하며 같은 답을 반복하면 중단합니다. Jev(Key)가 없으면 자동 배포하지 않고 관리자 검토로 보내며 초안은 사라지지 않습니다.')

/* ── 4. 클릭 매핑 ── */
H1('4. 클릭 매핑 (AI 없이 규칙 만들기)')
STEP(1, '[클릭 매핑] → 샘플 HTML/MHTML 열기')
STEP(2, '좌측 뷰어에서 요소를 클릭해 8단계 진행: ① 상품 행 → ② 상품명 → ③ 수량 → ④ 단가 → ⑤ 배송비 → ⑥ 체크박스 → ⑦ 옵션 행 → ⑧ 확인·저장')
P('단계 이름을 클릭하면 이동하고 [클릭 모드] 버튼으로 다시 지정합니다. 수량(기본 1)·배송비(없음)·옵션 행은 건너뛸 수 있습니다. 장바구니 규칙은 ⑥ 체크박스 선택이 필수입니다. 상품이 여러 개면 같은 종류 요소를 2개 이상 클릭 — 공통 선택자가 자동 도출됩니다.')
STEP(3, '규칙 ID·이름·match(도메인) 입력 → [규칙 조립] → [추출 미리보기] → [💾 저장]')

/* ── 5. 검증 센터 ── */
H1('5. 검증 센터')
H2('5.1 전체 검증 (§7.7)')
P('[전체 검증 실행] 한 번으로 JSON 문법·스키마·ID 중복·파일명 불일치·장바구니 checkedOnly 누락·match 중복·bundle 동기화·버전 형식·-cart 우선순위를 ERROR/WARNING/INFO/PASS 등급으로 보고합니다. ERROR가 하나라도 있으면 적용·배포를 보류하고 원인을 표시합니다.')
H2('5.2 샘플 추출 검증')
P('§7.7 샘플 추출 탭 → [캡처 폴더 선택…](하위 폴더까지 최대 60개) → 각 캡처를 규칙으로 실제 추출해 같은 폴더의 정답 Excel과 건수·총액(2% 이내) 대조. 0건·불일치는 ERROR, 정답 없음·미지원 몰은 INFO로 표시됩니다.')
H2('5.3 규칙 비교 (§7.4)')
P('두 규칙을 선택하면 라인 단위 diff로 차이를 보여줍니다.')

/* ── 6. 백업/복원 ── */
H1('6. 백업/복원 (트랜잭션)')
P('규칙 저장·삭제·생성 적용은 모두 트랜잭션으로 처리됩니다 — 적용 전 자동 스냅샷, 실패 시 자동 복구, 이력은 transactions/ 폴더에 누적됩니다. 백업/복원 화면의 [↩ 되돌리기]로 해당 시점으로 복원됩니다(신규 생성분은 삭제, 수정분은 원본 복원). 이미 되돌린 이력은 재되돌리기할 수 없습니다.')

/* ── 7. 배포/Git ── */
H1('7. 배포/Git')
STEP(1, '변경 파일 목록에서 배포할 파일만 체크 — git add . 는 금지(서비스가 인자 자체를 거부)')
STEP(2, '[선택 diff 보기]로 내용 확인')
STEP(3, '커밋 메시지 입력(예: feat: 무신사 쇼핑몰 규칙 추가 및 rules.json 갱신) → [Commit]')
STEP(4, '[Push]는 별도 버튼 — 실패해도 로컬 커밋은 보존되며 실패 사유가 표시됩니다')
P('강제 push는 할 수 없습니다.')

/* ── 8. 작업 로그·AI 연동 ── */
H1('8. 작업 로그(§7.9)와 AI 연동 상태')
P('하단 상태바에 항상 마지막 작업 상태와 오류·경고 수가 표시됩니다. [로그] 버튼으로 전체 작업 로그 패널을 열면 레벨 필터·클립보드 복사·파일 저장(.txt)이 가능하고 API Key 등 민감정보는 자동 마스킹됩니다.')
P('OpenCode 브리지 패널에서는 설치 여부·버전·GLM Coding Plan 모델 목록이 표시됩니다. "인증: 미등록"이면 터미널에서 opencode auth login으로 Z.AI Coding Plan을 등록하세요.')
P('Jev 판정 게이트 패널에는 Shadow Mode 통계(기록/비교/일치율)가 표시됩니다. [§19.2 픽스처 수집]으로 72개 테스트 케이스를 판정해 통계를 쌓을 수 있습니다. 자동 승인은 비교 데이터 50건 이상 + 일치율 충족 + Shadow Mode 해제 전까지 설정이 잠겨 있습니다(안전 설계).')

/* ── 9. FAQ ── */
H1('9. 자주 묻는 질문')
BOX('"저장소를 찾지 못했습니다"', ['rules.json과 .git이 있는 폴더를 [폴더 선택…]으로 지정하세요.'], 'green')
BOX('AI 생성이 계속 실패합니다', ['OpenCode 미설치 또는 opencode auth login 미완료 — 브리지 패널을 확인하세요.'], 'green')
BOX('결과가 계속 human_review입니다', ['TYPESAFE_API_KEY 미설정 또는 로컬 검증 실패 — 검증 센터로 원인을 확인하세요. 초안은 보존됩니다.'], 'green')
BOX('push가 실패했습니다', ['네트워크/인증 문제입니다 — 로컬 커밋은 보존되므로 나중에 Push만 다시 누르면 됩니다.'], 'green')
BOX('사용자용 앱과 동시 실행 되나요?', ['가능합니다 — 두 프로그램은 저장소·이름·포트가 모두 분리되어 있습니다.'], 'green')

/* ── 10. 보안 ── */
H1('10. 보안 원칙')
B('API Key는 safeStorage 암호화 또는 환경변수로만 저장 — 코드·로그·Git에 기록되지 않습니다.')
B('Jev에는 전체 HTML이 아닌 요약 데이터(선택자·상품명 일부·개수)만 전송됩니다.')
B('샘플 뷰어는 스크립트를 전부 제거하고 외부 네트워크를 차단합니다.')
B('로컬 검증(건수·금액)을 통과하지 못한 규칙은 Jev 결과와 무관하게 배포가 차단됩니다.')

doc.end()
console.log('생성 완료: ' + out)
