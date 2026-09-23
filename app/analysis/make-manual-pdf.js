const fs = require('fs')
const path = require('path')
const PDFDocument = require('pdfkit')

const out = path.join(__dirname, '..', 'resources', 'manual.pdf')
fs.mkdirSync(path.dirname(out), { recursive: true })

const W = 595.28
const M = 56
const CW = W - M * 2

const doc = new PDFDocument({ size: 'A4', margins: { top: 56, bottom: 56, left: M, right: M } })
doc.pipe(fs.createWriteStream(out))

doc.registerFont('kr', 'C:/Windows/Fonts/malgun.ttf')
doc.registerFont('kb', 'C:/Windows/Fonts/malgunbd.ttf')

const H1 = (t) => {
  ensure(40)
  doc.font('kb').fontSize(16).fillColor('#1e293b').text(t, M, doc.y, { width: CW })
  doc.moveDown(0.4)
  doc.moveTo(M, doc.y).lineTo(W - M, doc.y).lineWidth(1.2).strokeColor('#2563eb').stroke()
  doc.moveDown(0.7)
}
const H2 = (t) => {
  ensure(34)
  doc.font('kb').fontSize(12.5).fillColor('#1d4ed8').text(t, M, doc.y, { width: CW })
  doc.moveDown(0.35)
}
const P = (t, opts = {}) => {
  doc.font('kr').fontSize(10.5).fillColor('#334155').text(t, M, doc.y, { width: CW, lineGap: 3.5, ...opts })
  doc.moveDown(0.25)
}
const STEP = (n, t) => {
  ensure(20)
  doc.font('kb').fontSize(10.5).fillColor('#2563eb').text(`${n}.`, M, doc.y, { width: 20, continued: false })
  const y0 = doc.y - doc.currentLineHeight()
  doc.font('kr').fillColor('#334155').text(t, M + 20, y0, { width: CW - 20, lineGap: 3.5 })
  doc.moveDown(0.2)
}
const BOX = (title, lines) => {
  ensure(40)
  const y0 = doc.y
  doc.font('kb').fontSize(10.5).fillColor('#065f46').text(title, M + 10, y0 + 8, { width: CW - 20 })
  let y = doc.y
  for (const l of lines) {
    doc.font('kr').fillColor('#064e3b').text(l, M + 10, y, { width: CW - 20, lineGap: 3 })
    y = doc.y
  }
  const h = y + 8 - y0
  doc.lineWidth(1).strokeColor('#6ee7b7').roundedRect(M, y0, CW, h, 6).stroke()
  doc.y = y0 + h
  doc.moveDown(0.5)
}
const CODE = (t) => {
  doc.font('kb').fontSize(10.5).fillColor('#1e3a8a').text(t, M + 24, doc.y, { width: CW - 48 })
  doc.moveDown(0.3)
}

function ensure(h) {
  if (doc.y + h > 841.89 - 56) doc.addPage()
}

doc.font('kr')
doc.fontSize(21).fillColor('#0f172a').font('kb').text('자동 품의 요구 생성기 — 사용 매뉴얼', M, 70, { width: CW, align: 'center' })
doc.moveDown(0.3)
doc.font('kr').fontSize(11).fillColor('#64748b').text('쇼핑몰 주문 화면을 캡처해 품의 서식 엑셀에 자동 저장하는 프로그램', M, doc.y, { width: CW, align: 'center' })
doc.moveDown(1)

H1('1. 프로그램 개요')
P('쇼핑몰(쿠팡, G마켓, 네이버쇼핑, 옥션, 11번가, 교보문고, 예스24, 티처몰, 엘레파츠, IC114 등 13개 몰)의 주문서/장바구니 화면을 캡처하면 품목명·규격·수량·예상단가·배송비를 자동 추출하고, 품의 서식 엑셀(품목내역(통합).xls)에 저장합니다.')
P('캡처 방법은 두 가지입니다. ① 브라우저 확장 프로그램(익스텐션) 아이콘 클릭 ② 북마크릿 [품의캡처] 클릭. 어느 쪽이든 프로그램이 자동으로 받아 표시합니다.')
doc.moveDown(0.3)

H1('2. 시작하기 — 북마크릿 등록')
P('프로그램 시작 화면(왼쪽 미리보기 영역)의 [등록] 버튼을 누르면 Chrome/Edge/웨일 북마크바 맨 앞에 [품의캡처]가 추가됩니다. 브라우저가 실행 중이면 잠시 닫았다가 다시 열 수 있습니다.')
BOX('안내', [
  '· 이미 등록되어 있으면 "이미 등록되어 있습니다"라고 알려드립니다.',
  '· 크롬 북마크 동기화가 켜져 있으면 북마크가 맨 뒤에 생길 수 있습니다 — 클릭 후 편리한 곳으로 드래그하세요.',
  '· [삭제] 버튼으로 등록된 북마크릿을 모두 제거할 수 있습니다.'
])
doc.moveDown(0.2)

H1('3. 브라우저 확장(익스텐션) 수동 설치 안내')
P('브라우저 정책상 프로그램이 자동으로 설치해 드릴 수 없습니다. 아래 순서대로 직접 설치해 주세요. 한 번만 설치하면 이후 계속 자동으로 사용 가능합니다. 프로그램의 [익스텐션 추가] 창에서는 확장 페이지 주소와 폴더 경로를 클릭 한 번으로 복사할 수 있습니다.')

H2('3.0 공통 준비 — 확장 프로그램 폴더 확인')
STEP(1, '프로그램에서 [익스텐션 추가] 버튼을 클릭합니다.')
STEP(2, '맨 위 "확장 프로그램 폴더" 항목의 경로를 확인합니다. 예:')
CODE('C:\\Users\\사용자명\\AppData\\Roaming\\자동 품의 요구 생성기\\extension')
STEP(3, '[폴더 열기] 버튼으로 실제 폴더가 열리는지 확인합니다. manifest.json 등 여러 파일이 보이면 정상입니다.')
STEP(4, '필요하면 [경로 복사] 버튼으로 경로를 클립보드에 복사해 둡니다. 아래 단계에서 이 폴더를 선택하게 됩니다.')

H2('3.1 크롬(Chrome)에서 설치')
STEP(1, '크롬 브라우저를 직접 실행합니다.')
STEP(2, '맨 위 주소창에 아래 주소를 입력하고 엔터를 누릅니다.')
CODE('chrome://extensions')
STEP(3, '페이지 오른쪽 위의 "개발자 모드" 스위치를 켬(파란색)으로 만듭니다.')
STEP(4, '상단의 "압축해제된 확장 프로그램 로드" 버튼을 클릭하면 폴더 선택 창이 열립니다.')
STEP(5, '폴더 선택 창 상단 경로 입력칸에 준비 단계의 확장 폴더 경로를 붙여넣고 엔터 → 해당 폴더 선택 후 [폴더 선택]을 누릅니다.')
STEP(6, '확장 목록에 "품의 생성기"가 추가되었는지, 이름 옆 토글이 켜짐(파란색)인지 확인합니다. 꺼져 있으면 클릭해 켭니다.')

H2('3.2 Microsoft Edge에서 설치')
STEP(1, 'Edge 브라우저를 직접 실행하고 주소창에 아래 주소를 입력해 확장 페이지를 엽니다.')
CODE('edge://extensions')
STEP(2, '페이지 오른쪽 위(또는 상단)의 "개발자 모드" 스위치를 켭니다.')
STEP(3, '"압축해제된 확장 프로그램 로드" 버튼을 클릭합니다 → 폴더 선택 창이 열립니다.')
STEP(4, '폴더 선택 창 상단 경로 칸에 확장 폴더 경로를 붙여넣고 엔터 → 해당 폴더 선택 후 [폴더 선택]/[열기]를 클릭합니다.')
STEP(5, '확장 페이지에서 "품의 생성기" 확장이 추가되었는지, 토글이 켜져 있는지 확인합니다.')

H2('3.3 네이버 웨일(Whale)에서 설치')
STEP(1, '웨일 브라우저를 실행하고 주소창에 아래 주소를 입력해 확장 페이지를 엽니다.')
CODE('whale://extensions')
STEP(2, '확장 페이지 오른쪽 위(또는 상단 메뉴)의 "개발자 모드"를 켭니다.')
STEP(3, '"압축해제된 확장 프로그램 로드" 버튼이 활성화되면 클릭합니다 → 폴더 선택 창이 열립니다.')
STEP(4, '폴더 선택 창 상단 경로 칸에 확장 폴더 경로를 붙여넣고 엔터 → 해당 폴더 선택 후 [폴더 선택]/[열기]를 클릭합니다.')
STEP(5, '확장 페이지에서 "품의 생성기" 확장이 추가되었는지, 토글이 켜져 있는지 확인합니다.')

H2('3.4 설치 후 공통 확인 사항')
STEP(1, '브라우저 오른쪽 위 확장 아이콘(퍼즐 모양)을 눌러 "품의 생성기" 확장이 목록에 있는지 확인합니다.')
STEP(2, '확장이 보이고 토글이 켜져 있으면 설치 완료입니다.')
STEP(3, '자동 품의 요구 생성기 프로그램을 실행한 뒤 브라우저를 열면 확장이 연동되어 기능이 동작합니다.')
doc.moveDown(0.2)

H1('4. 기본 사용 흐름')
STEP(1, '브라우저에서 쇼핑몰 로그인 후 주문서/장바구니 화면을 엽니다.')
STEP(2, '익스텐션 아이콘 또는 북마크릿 [품의캡처]를 누릅니다 — 프로그램이 자동으로 받아 왼쪽에 표시합니다.')
STEP(3, '오른쪽 표에서 품목을 확인·수정합니다(셀 클릭으로 편집, 행 추가/삭제 가능).')
STEP(4, '필요 시 상태바 우측에서 단가 인상 %를 선택합니다(배송비 제외).')
STEP(5, '[엑셀에 저장] 버튼으로 저장 위치를 지정해 저장합니다 — 기존 파일은 현재 표 내용으로 교체되며 .bak 백업이 만들어집니다.')
doc.moveDown(0.2)

H1('5. 미리보기 조작')
P('· 마우스 휠: 확대/축소 (커서 위치 기준, 25~300%)')
P('· 오른쪽 클릭 또는 휠 버튼 드래그: 화면 잡아끄기(pan)')
P('· 도구 모음의 [＋ 확대] [－ 축소] [100%] 버튼도 사용할 수 있습니다.')
doc.moveDown(0.2)

H1('6. 한 페이지 요약')
BOX('확장 설치 요약', [
  '1. 프로그램 [익스텐션 추가] → [폴더 열기]로 확장 폴더 위치를 확인한다.',
  '2. 브라우저를 직접 열고 주소창에 chrome://extensions (Edge: edge://extensions, 웨일: whale://extensions)를 입력해 확장 페이지를 연다.',
  '3. 확장 페이지 오른쪽 위에서 "개발자 모드"를 켠다.',
  '4. "압축해제된 확장 프로그램 로드" 버튼을 클릭한다.',
  '5. 폴더 선택 창에서 프로그램에 표시된 확장 폴더(...\\자동 품의 요구 생성기\\extension)를 선택하고 [폴더 선택]/[열기]를 누른다.',
  '6. 확장 목록에 "품의 생성기" 확장이 추가되고 토글이 켜져 있으면 설치 완료.'
])

doc.end()
console.log('PDF written:', out)
