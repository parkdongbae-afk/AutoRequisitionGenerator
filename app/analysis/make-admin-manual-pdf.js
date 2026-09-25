// 관리자 전용 매뉴얼 PDF 생성기 (일반 사용자 매뉴얼과 분리 — make-manual-pdf.js 참고)
// 사용: node analysis\make-admin-manual-pdf.js → resources/admin-manual.pdf
const fs = require('fs')
const path = require('path')
const PDFDocument = require('pdfkit')

const out = path.join(__dirname, '..', 'resources', 'admin-manual.pdf')
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
  doc.moveTo(M, doc.y).lineTo(W - M, doc.y).lineWidth(1.2).strokeColor('#7c3aed').stroke()
  doc.moveDown(0.7)
}
const H2 = (t) => {
  ensure(34)
  doc.font('kb').fontSize(12.5).fillColor('#6d28d9').text(t, M, doc.y, { width: CW })
  doc.moveDown(0.35)
}
const P = (t) => {
  doc.font('kr').fontSize(10.5).fillColor('#334155').text(t, M, doc.y, { width: CW, lineGap: 3.5 })
  doc.moveDown(0.25)
}
const STEP = (n, t) => {
  ensure(20)
  doc.font('kb').fontSize(10.5).fillColor('#7c3aed').text(`${n}.`, M, doc.y, { width: 20, continued: false })
  const y0 = doc.y - doc.currentLineHeight()
  doc.font('kr').fillColor('#334155').text(t, M + 20, y0, { width: CW - 20, lineGap: 3.5 })
  doc.moveDown(0.2)
}
const BOX = (title, lines, tone = 'green') => {
  ensure(40)
  const c = tone === 'red' ? { t: '#991b1b', b: '#fca5a5' } : tone === 'green' ? { t: '#065f46', b: '#6ee7b7' } : { t: '#4c1d95', b: '#c4b5fd' }
  const y0 = doc.y
  doc.font('kb').fontSize(10.5).fillColor(c.t).text(title, M + 10, y0 + 8, { width: CW - 20 })
  let y = doc.y
  for (const l of lines) {
    doc.font('kr').fillColor(c.t).text(l, M + 10, y, { width: CW - 20, lineGap: 3 })
    y = doc.y
  }
  const h = y + 8 - y0
  doc.lineWidth(1).strokeColor(c.b).roundedRect(M, y0, CW, h, 6).stroke()
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
doc.fontSize(21).fillColor('#0f172a').font('kb').text('새 쇼핑몰 규칙 자동 생성 — 관리자 매뉴얼', M, 70, { width: CW, align: 'center' })
doc.moveDown(0.3)
doc.font('kr').fontSize(11).fillColor('#64748b').text('Gemini로 규칙 JSON을 만들고 rules.json 버전을 올려 배포까지 원클릭으로 처리하는 관리자 전용 도구', M, doc.y, { width: CW, align: 'center' })
doc.moveDown(1)

BOX('⚠ 관리자 전용 문서', [
  '· 이 문서와 도구는 관리자(배포 담당자)만 사용합니다. 일반 사용자 매뉴얼에는 포함되지 않습니다.',
  '· 도구 진입: 프로그램 [⚙ 설정] 화면이 열려 있는 상태에서 키보드 F9 → "새 쇼핑몰 규칙 자동 생성 (관리자)" 창이 열립니다.',
  '· 이 창의 [📖 매뉴얼] 버튼으로 언제든 이 문서를 다시 열 수 있습니다.'
], 'red')

H1('1. 도구가 하는 일')
P('샘플 캡처(장바구니/주문서 HTML·MHTML)와 정답 엑셀을 주면 Gemini가 CSS 선택자 기반 파싱 규칙 JSON을 만들고, 다음을 자동으로 수행합니다.')
P('① 소스 규칙 저장(app\\src\\main\\lib\\rules\\{id}.json) + analysis 사본 + 실행 사본 저장 ② rules.json 재생성(버전 자동 증가) ③ git add → commit → push (Git 체크 시). 일반 사용자는 [⬇ 업데이트 확인]으로 이 규칙을 자동으로 받습니다.')

H1('2. 사전 준비')
STEP(1, 'Gemini API 키: Google AI Studio(aistudio.google.com)에서 발급합니다. 키는 실행 시 로컬 settings.json에 저장되고 [💾 불러오기]로 다시 꺼낼 수 있습니다.')
STEP(2, 'Git 푸시 권한: 규칙 저장소(parkdongbae-afk/AutoRequisitionGenerator)에 push할 수 있는 계정이어야 합니다.')
STEP(3, '실행 위치: 포터블 exe는 저장소 루트(rules.json과 .git이 있는 폴더)에 두고 실행합니다 — 배포 대상 폴더를 찾는 기준이 됩니다. 개발 환경(npm run dev)은 자동 인식됩니다.')
STEP(4, '모델: 기본 Gemini 3.1 Flash Lite. 정확도가 부족하면 Gemini 3.1 Pro를, 서버 과부하(503)가 잦으면 gemini-2.5-flash로 바꿔 보세요.')

H1('3. 화면 구성')
P('· Gemini API: API 키 입력 + 모델 선택 + [💾 불러오기](저장된 키·모델 재로드)')
P('· 신규 쇼핑몰: 쇼핑몰 이름(한글) 입력 시 규칙 id가 자동 파생됩니다 — 주문서 규칙 = 입력한 id(예: musinsa), 장바구니 규칙 = id-cart(예: musinsa-cart). 입력값이 -cart로 끝나면 자동 보정됩니다.')
P('· 샘플 파일: 장바구니/주문서 각각 최대 2개(HTML + MHTML 혼합 가능). 넣은 종류만 규칙이 만들어집니다 — 둘 다 넣으면 규칙 2건이 한 번에 생성됩니다. 같은 화면의 HTML·MHTML을 함께 넣으면 더 정확합니다.')
P('· 정답 엑셀(.xls/.xlsx): 필수. 품목명/규격/수량/단가/배송비가 담긴 서식 파일 — Gemini가 이 데이터와 일치하도록 선택자를 고릅니다.')
P('· Git 자동 커밋/푸시: 체크 시 배포까지 자동 수행(버전 +0.0.1). 해제 시 로컬 생성만 하고 버전을 유지합니다.')
P('· 구축된 쇼핑몰 목록: [▼ 목록 보기]로 현재 내장 규칙 전체를 보고, [삭제]로 제거할 수 있습니다(소스·analysis 사본·실행 사본 동시 삭제 + rules.json 재반영 + Git 체크 시 커밋/푸시).')

H1('4. 생성 절차')
STEP(1, '대상 쇼핑몰에서 실제 장바구니(체크된 상품 2개 이상) 또는 주문서 화면을 캡처해 저장합니다 — 가능하면 같은 화면을 .html과 .mhtml로 2장.')
STEP(2, '정답 엑셀을 만듭니다 — 화면의 품목·수량·단가·배송비와 정확히 같아야 품질이 나옵니다.')
STEP(3, '관리자 창에서 이름·id·샘플·정답을 채우고 [🚀 쇼핑몰 규칙 생성 및 자동 배포 시작]을 누릅니다.')
STEP(4, '진행 로그를 확인합니다 — 503이면 2→4→8초 간격 3회 재시도 후 gemini-2.5-flash → gemini-2.0-flash로 자동 전환됩니다.')
STEP(5, '완료 후 실제 캡처 파일을 열어 규칙 선택으로 재추출해 정답과 대조합니다. 부족하면 [구축된 쇼핑몰 목록]에서 삭제 후 샘플/정답을 보강해 재생성하세요.')

H1('5. 배포와 버전 관리')
P('rules.json은 {version, generatedAt, count, rules} 형식입니다. Git 자동 커밋/푸시가 실행될 때 patch 버전이 0.0.1씩 오릅니다(예: v1.0.2 → v1.0.3). 커밋 메시지는 "feat: {몰} 쇼핑몰 규칙 추가 및 rules.json 갱신" / 삭제는 "chore: …삭제…"로 기록됩니다.')
P('수동 배포가 필요하면 node analysis\\make-rules-json.js를 실행해도 됩니다(이때도 버전이 0.0.1 올라갑니다). 사용자 앱의 [⬇ 업데이트 확인]은 이 rules.json의 규칙을 같은 id 기준으로 비교해 변경분만 적용합니다.')
BOX('주의', [
  '· rules.json 신형식은 구버전 exe에서 읽히지 않습니다 — 새 exe 배포를 마친 뒤 푸시하세요.',
  '· 생성된 규칙은 실행 중 앱에도 즉시 적용되는 사본이 userData\\rules에 만들어집니다. 규칙 관리 창에 같은 규칙이 "사용자"로 보이는 것은 정상입니다.'
])

H1('6. 오류 대처')
BOX('Q. 503 High Demand / 트래픽 안내 팝업', [
  '· 자동으로 3회 재시도 + 대체 모델 전환이 끝난 뒤의 최종 안내입니다. 몇 분 뒤 다시 시도하거나 모델을 바꿔 주세요.',
  '· 반복되면 gemini-2.5-flash(안정적)로 모델을 바꿔 실행하세요.'
])
BOX('Q. "규칙 id ~가 이미 있습니다"', [
  '· 관리자 도구가 만든 규칙이면 자동으로 덮어써서 재생성합니다(재시도 시 그냥 [시작]을 누르면 됩니다).',
  '· 클릭 매핑 등 사람이 만든 규칙과 충돌한 경우 — 오류에 표시된 파일 경로의 규칙을 삭제하거나 다른 id를 입력하세요.'
])
BOX('Q. git push 실패', [
  '· 네트워크·인증 문제입니다. 로컬 생성은 완료된 상태이므로 나중에 직접 git add/commit/push해도 됩니다.',
  '· 대상 파일: app/src/main/lib/rules/{id}.json + rules.json (+ app/analysis/rules/{id}.json)'
])
BOX('Q. 생성 품질이 나쁩니다', [
  '· 정답 엑셀과 샘플 화면이 같은 시점이어야 합니다(가격·체크 상태 불일치가 최대 원인).',
  '· 샘플을 2개(HTML+MHTML)로 늘리고, 모델을 Gemini 3.1 Pro로 올려 재생성하세요.'
])

doc.end()
console.log('PDF written:', out)
