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
  '· 설정 화면에는 F9 관련 안내 표시가 없습니다(숨김 진입) — 설정을 연 뒤 F9를 직접 눌러 주세요.',
  '· 이 창의 [📖 매뉴얼] 버튼으로 언제든 이 문서를 다시 열 수 있습니다.'
], 'red')

H1('1. 도구가 하는 일')
P('샘플 캡처(장바구니/주문서 HTML·MHTML)와 정답 엑셀을 주면 Gemini가 CSS 선택자 기반 파싱 규칙 JSON을 만들고, 다음을 자동으로 수행합니다.')
P('① 소스 규칙 저장(app\\src\\main\\lib\\rules\\{id}.json) + analysis 사본 + 실행 사본 저장 ② rules.json 재생성(버전 자동 증가) ③ git add → commit → push (Git 체크 시). 일반 사용자는 [⬇ 업데이트 확인]으로 이 규칙을 자동으로 받습니다.')

H1('2. 사전 준비')
STEP(1, 'Gemini API 키: Google AI Studio(aistudio.google.com)에서 발급합니다. 입력 뒤 [💾 저장]을 누르면 settings.json에 저장되고 [💾 불러오기]로 다시 꺼낼 수 있습니다. [🔗 연결] 버튼으로 키·모델이 실제로 동작하는지 확인할 수 있습니다.')
STEP(2, 'Git 푸시 권한: 규칙 저장소(parkdongbae-afk/AutoRequisitionGenerator)에 push할 수 있는 계정이어야 합니다.')
STEP(3, '실행 위치: 포터블 exe는 저장소 루트(rules.json과 .git이 있는 폴더)에 두고 실행합니다 — 배포 대상 폴더를 찾는 기준이 됩니다. 개발 환경(npm run dev)은 자동 인식됩니다.')
STEP(4, '모델: 기본 Gemini 3.1 Flash Lite. 모델 목록에서 Gemini 3.5(Pro/Flash/Flash Lite)와 3.1·2.5·2.0·1.5 계열을 선택할 수 있습니다. 정확도가 부족하면 Pro를, 서버 과부하(503)가 잦으면 2.5-flash로 바꿔 보세요.')

H1('3. 화면 구성')
P('· Gemini API: API 키 입력 + [🔗 연결](키·모델 유효성 확인) + 모델 목록(라디오 선택) + [💾 저장](즉시 settings.json 저장) + [💾 불러오기](저장된 키·모델 재로드)')
P('· 신규 쇼핑몰: 쇼핑몰 이름(한글) 입력 시 규칙 id가 자동 파생됩니다 — 주문서 규칙 = 입력한 id(예: musinsa), 장바구니 규칙 = id-cart(예: musinsa-cart). 입력값이 -cart로 끝나면 자동 보정됩니다.')
P('· 샘플 파일: 장바구니/주문서 각각 최대 2개(HTML + MHTML 혼합 가능). 넣은 종류만 규칙이 만들어집니다 — 둘 다 넣으면 규칙 2건이 한 번에 생성됩니다. 같은 화면의 HTML·MHTML을 함께 넣으면 더 정확합니다.')
P('· 정답 엑셀(.xls/.xlsx): 필수. 품목명/규격/수량/단가/배송비가 담긴 서식 파일 — Gemini가 이 데이터와 일치하도록 선택자를 고릅니다.')
P('· Git 자동 커밋/푸시: 체크 시 배포까지 자동 수행(버전 +0.0.1). 해제 시 로컬 생성만 하고 버전을 유지합니다.')
P('· MHTML 폴더/파일 열기 버튼 표시: 일반 화면 상단의 파일 열기 버튼 2종을 켜거나 끕니다(기본: 끄기) — 이 토글은 관리자 전용으로, 일반 설정 화면에는 없습니다.')
P('· 구축된 쇼핑몰 목록: [▼ 목록 보기]로 현재 내장 규칙 전체를 보고, [삭제]로 제거할 수 있습니다(소스·analysis 사본·실행 사본 동시 삭제 + rules.json 재반영 + Git 체크 시 커밋/푸시).')

H1('4. 생성 절차')
STEP(1, '대상 쇼핑몰에서 실제 장바구니(체크된 상품 2개 이상) 또는 주문서 화면을 캡처해 저장합니다 — 가능하면 같은 화면을 .html과 .mhtml로 2장.')
STEP(2, '정답 엑셀을 만듭니다 — 화면의 품목·수량·단가·배송비와 정확히 같아야 품질이 나옵니다.')
STEP(3, '관리자 창에서 이름·id·샘플·정답을 채우고 [🚀 쇼핑몰 규칙 생성 및 자동 배포 시작]을 누릅니다.')
STEP(4, '진행 로그를 확인합니다 — 503이면 2→4→8초 간격 3회 재시도 후 gemini-2.5-flash → gemini-2.0-flash로 자동 전환됩니다.')
STEP(5, '생성 직후 샘플로 자동 검증합니다 — 추출 결과가 0건이거나 정답과 건수·금액이 다르면, 이전 규칙과 실제 추출 결과·문제를 Gemini에 다시 보내 최대 3회까지 스스로 수정합니다(로그에 "자가 수정"으로 표시).')
STEP(6, '완료 후 실제 캡처 파일을 열어 규칙 선택으로 재추출해 정답과 대조합니다. 부족하면 [구축된 쇼핑몰 목록]에서 삭제 후 샘플/정답을 보강해 재생성하세요.')

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

H1('7. 쇼핑몰 개편(업데이트) 시 관리자 대응 절차')
P('쇼핑몰이 화면을 개편하면 해당 몰의 파싱 규칙 셀렉터가 깨져 추출이 실패하거나 틀려집니다. 아래 순서로 대응합니다.')
BOX('증상으로 원인 구분하기', [
  '· 캡처 시 "주문서 상태에서 품의캡처 해주세요" 거부 팝업 → 규칙 미매칭(개편으로 셀렉터 불일치)',
  '· 품목 누락·중복, 단가·규격·배송비 오류 → 셀렉터는 맞지만 화면 내부 구조가 일부 변경',
  '· 특정 몰이 아니라 전 몰이 실패 → 앱·확장 버전 문제이거나 캡처 채널 문제(규칙과 무관)'
], 'purple')
STEP(1, '증상 접수·범위 확인: 어느 쇼핑몰인지, 주문서/장바구니 중 무엇인지, 확장·북마크릿 중 어느 채널에서 문제가 나오는지 확인합니다.')
STEP(2, '문제 캡처 + 정답 엑셀 확보: 해당 몰에서 실제 주문 직전 화면을 캡처하고(가능하면 .html과 .mhtml 2장), 화면과 같은 시점의 품목명·규격·수량·단가·배송비 정답표를 만듭니다 — §4의 1~2단계와 동일합니다.')
STEP(3, '원인 분석: 현재 규칙으로 문제 캡처를 다시 추출해 어디가 깨졌는지 확인합니다.')
CODE('node analysis\\test-rule.js app\\src\\main\\lib\\rules\\{id}.json <capture.mhtml>')
STEP(4, '규칙 재생성: F9 관리자 도구로 규칙을 다시 생성(§4)하거나, 기존 rules/{id}.json의 셀렉터만 수정합니다. 같은 id로 다시 만들면 관리자 도구가 만든 규칙은 자동 덮어쓰기됩니다(§6 참고).')
STEP(5, '검증: 정답 엑셀과 일치하는지 아래 스크립트로 확인한 뒤 배포합니다.')
CODE('node analysis\\test-cart-stamped.js    # 확장/북마크릿 캡처 형태(스탬핑) 시뮬레이션')
CODE('node analysis\\test-cart-fix.js & node analysis\\test-feedback.js    # 회귀 스위트')
STEP(6, 'builtin 등록·우선순위: 새 규칙이면 [🧩 미등록 규칙 builtin에 등록] 버튼으로 rules.js builtin 배열에 추가합니다. 배열 순서가 곧 매칭 우선순위입니다 — 장바구니 전용(id-cart) 등 특화 규칙을 일반 규칙보다 앞에 두세요(예: teachermall-cart가 teachermall보다 앞).')
STEP(7, '배포: Git 자동 커밋/푸시 체크 시 rules.json이 GitHub에 올라가고, 교원 앱의 [⬇ 업데이트 확인]으로 전파됩니다(§5). push 실패 시 수동 git add/commit/push(§6 참고).')
STEP(8, '교원 안내: 앱 → 설정 → 쇼핑몰 규칙 [⬇ 업데이트 확인]을 눌러 최신 규칙을 받도록 공지합니다. 이미 열어 둔 화면은 뷰어 위 규칙 선택으로 재적용하고, 확장이 오래됐으면 브라우저 재시작 또는 [🧩 확장 프로그램 추가] 재설치를 안내합니다.')
STEP(9, '기록: SUMMARY.MD(세션 인계)와 RPD.MD(문제 이력)에 변경 내용을 남겨 다음 담당자가 따라갈 수 있게 합니다.')
BOX('주의 — 새 exe 배포가 필요한 경우', [
  '· 규칙 삭제: 업데이트 채널로 전파되지 않습니다 — 새 exe 배포로만 반영됩니다.',
  '· 파서 코드(extract.js 등) 수정이 동반된 경우: 새 exe 재생성 + 루트 배포 파일(자동품의요구생성기_Portable.exe) 교체까지가 작업 완료입니다.',
  '· rules.json 신형식은 구버전 exe가 읽지 못합니다 — 새 exe 배포를 마친 뒤 푸시하세요(§5 참고).'
], 'red')

H1('8. 부록 — 추출 표의 숨겨진 열 보기(F8)')
P('자동 품의 요구 생성기 v1.47부터 추출 결과 표에는 "물품 자동 선택" 기능용 열 2개가 추가되었지만 기본적으로 숨겨져 있습니다.')
P('· 상품 URL: 캡처 시점의 개별 상품 주소 — 장바구니 자동 선택(V체크)이 이 URL과 상품 키로 물품을 대조합니다.')
P('· 옵션: 상품의 선택 옵션 원문 — 같은 상품을 옵션별로 구분하는 값입니다.')
P('· 보는 방법: 앱 창 어디서든 키보드 F8 → 두 열이 표 오른쪽에 나타납니다. 다시 F8 → 숨겨집니다. (설정에 저장되지 않는 임시 보기)')
P('· 용도: 자동 선택이 물품을 찾지 못해 "누락"으로 나올 때, URL·옵션이 비어 있는지 확인하는 검수용입니다. 알리익스프레스처럼 화면 구조상 URL을 저장할 수 없는 쇼핑몰은 URL 대신 상품 키가 엑셀의 상품 키 열에 저장됩니다.')
P('· 열 폭은 머리글 경계를 드래그해 조절할 수 있고, 옵션 열은 클릭해 수정할 수 있습니다.')

doc.end()
console.log('PDF written:', out)
