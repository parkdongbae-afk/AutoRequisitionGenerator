# 프로젝트 작업 요약 (다른 세션 인계용)

**작성일:** 2026-09-23 | **현재 버전:** v1.7.2 | **작업 폴더:** `C:\Users\dongbae\Desktop\Automatic_generation_of_approval_requests_html`

## 1. 프로젝트 개요

중학교 교사용 **"자동 품의 요구 생성기"** — 쇼핑몰 주문/장바구니 화면을 캡처(MHTML/HTML)하여 품목(품목명·규격·수량·예상단가·배송비)을 자동 추출하고, 서식 엑셀 `품목내역(통합).xls`에 누적 저장하는 Electron 데스크톱 앱.

- **배포 산출물:** `자동품의요구생성기_Portable.exe` (72MB, 작업폴더 루트) = `app\release\AutoRequisitionGenerator-Portable.exe` 사본
- **원본 소스:** `app\` 폴더 전체 (명세 MD 4종은 루트에 있으며 as-built로 갱신 완료: RPD/SYSTEM/ALGO/UIUX)

## 2. 현재 구현 기능 (v1.7.1)

| 기능 | 상태 |
|---|---|
| [📌📌 캡처 시점 V체크 박제(data-arge-checked)] v1.7.0의 checked 속성 필터는 **수동 MHTML 저장에서만** 동작 — 익스텐션(saveAsMHTML)/북마크릿(outerHTML)은 체크박스의 checked **프로퍼티를 직렬화하지 않아** G마켓 장바구니가 0건 추출→거부 팝업되던 것 수정. 익스텐션(1.4.3)·북마크릿이 캡처 직전 `input.checked` 프로퍼티를 `data-arge-checked="true/false"` **속성으로 박제**해 상태가 캡처에 함께 전송됨. 엔진 신규 `checkedOnly: {sel, legacySel}` — ① 스탬프 문서: true 행만 추출(스탬프 시뮬레이션 13몰 정답 정확 일치, 교보 AI페인팅·G마켓 한우도 정답대로 제외) ② 수동 저장: checked 속성/legacySel(다이소 label.is-checked) ③ 상태 전혀 없으면 전체 추출 폴백+안내 팝업(doc.checkedFallback → store.js `CART_FALLBACK_NOTICE`, 기존 몰별 고정 안내 대체). 12몰 카트 규칙에 checkedOnly 적용(예스24·옥션·드림디포·아이스크림·알파몰·오피스디포도 이제 캡처 채널에선 V체크만 추출). 카트 몰 0건 시 거부 메시지 "V체크된 상품이 없습니다…" 추가. bookmarks.js — 북마크릿 URL 변경 시 옛 URL 변종(`javascript:…127.0.0.1:573x…/html`)도 같은 🛒품의캡처 노드로 취급해 **기존 guid 보존·URL 갱신 교체**(중복 생성 방지) | ✅ v1.7.1 |
| [🛒🛒 장바구니 V체크 캡처 전면 지원] 주문서뿐 아니라 **장바구니 상태에서 품의캡처 → V체크한 상품만 자동 추가** (v1.7.0, 13몰 정답 대조 전수 통과 `analysis/test-cart-rules.js`). ① 체크 상태가 MHTML DOM에 보존되는 몰은 V체크만 추출: 교보(`input[checked]`)·알라딘·G마켓·11번가·쿠팡(`data-selected=true`∩`input[checked]` — 익스텐션/수동저장 두 경로 모두 정확)·네이버(`aria-checked=true`)·**다이소(`label.is-checked` Vue 클래스 — not_ok 폴더였지만 DOM엔 보존)** ② 체크가 소실되는 몰(드림디포·아이스크림몰·옥션·알파몰·예스24·오피스디포)은 전체 추출 + "선택하지 않은 상품은 삭제해 주세요" 안내 팝업(store.js `RULE_CART_NOTICES`) ③ 신규 몰: 알라딘·오피스디포·다이소몰 ④ 엔진 확장: `shipping.mode:'perItem'`(상품별 배송비 → "`<상품명> 배송비`" 행, 11번가), `shipping.first`(첫 값만, 알파몰), `qtyFromUnit`(합계÷단가 수량 계산, 다이소) ⑤ 내장 규칙 15종 → **25종**(`-cart` 접미사 규칙이 같은 도메인 주문서 규칙보다 우선) | ✅ v1.7.0 |
| 15종 내장 규칙 자동 추출 (G마켓·교보문고·네이버(주문+**장바구니**)·드림디포·아이스크림몰·알파몰·11번가·예스24·티처몰(주문+장바구니) + 옥션·쿠팡(장바구니)·엘레파츠·IC114·**롯데마트 제타**) | ✅ 총액 검증 완료 — IC114는 배송비 3,000원 고정(페이지에 배송비 없음), 주문서 캡처 거부 메시지 별도 |
| [🛒 네이버 장바구니 규칙] shopping.naver.com/cart 지원 — 해시클래스 prefix 매칭(`product--`/`title--` match:last로 배지 제외·'네이버플러스멤버십' 접두어 제거), em.price=합계(lineTotal→단가=합계÷수량), input number-- value=수량, 상점별 '총 배송비' 라벨 매칭(무료=0원). **rules.js builtin 순서: naver가 naver-cart보다 앞**(주문서 URL의 backUrl 쿼리에 shopping.naver.com/cart 원문이 포함되는 충돌 방지) | ✅ v1.6.8 |
| [ 🔤 charset 스마트 디코딩] mhtml.js `smartDecode` — 선언(헤더/meta)과 실제 바이트가 어긋나는 파일(BOM, euc-kr 라벨의 UTF-8, 64KB 이후 meta, UTF-16)을 후보별 디코딩 점수(한글×2−U+FFFD×50−mojibake×4)로 판별. MHTML 루트/HTML 파일/receiver /html 수신(메타 utf-8 재기록)/serveDoc 텍스트·CSS 파트 전 경로 적용 | ✅ v1.6.8 |
| [📌 북마크 중복 근본 수정] 프로필마다 다른 guid로 생성되면 Chrome 동기화가 서로 다른 북마크로 병합해 프로필마다 복제(P1·P3에 2개씩 실측) — ① add-bookmarklets가 **settings.json에 저장한 안정 guid(bookmarkGuid)를 모든 프로필에서 재사용**(생성 시·중복 정리 시 우선 보존) ② `/bookmark-info`·`/install`은 실제 바인드 포트와 무관히 **항상 57330 캐노니컬 북마크릿 URL** 반환(폴백 포트 URL을 내보내면 확장 self-heal이 포트별 변종을 계속 생성) ③ 확장(1.4.0) self-heal이 **전 폴더 url+title 중복 제거 + 예전 포트(57331~35) 변종 정리** | ✅ v1.6.8 |
| [📌📌 북마크 부활(v1.6.8 재발) 대응] 실측: 앱이 파일로 1개로 정리해도 옛 guid 복제본 부활(동기화 서버 재전송), 확장은 전 프로필 미설치(런타임 힐 무력). 원인: (a) 백그라운드 프로세스(시작 부스트)가 옛 북마크 모델을 다시 플러시 (b) 파일 삭제는 동기화 서버에 tombstone으로 반영되지 않음. 대응: ① `Bookmarks.bak` 동일 내용 기록 ② closeBrowserGracefully 강제종료 후 프로세스 완전 소멸 확인 + read-back 검증·재시도(isCaptureBookmarkAtFront) ③ 사전/사후(30초 뒤) 중복 감지 → 북마크 관리자 열기 다이얼로그 ④ 재시작 `--load-extension` | ✅ v1.6.9 |
| [📌📌📌 북마크 "삭제 직후 버튼" 함정 방지(v1.6.9 재발-2 대응)] | 사용자가 북마크 관리자에서 중복을 삭제한 직후 바로 버튼을 누르면, 앱이 크롬을 강제종료하며 **tombstone(삭제 기록)이 동기화 서버에 업로드되기 전에 크롬이 죽어** 옛 복제본이 재전송됨(교사박동배=Default 프로필에서 19개 부활 실측: 옛 guid 18 + 신규 1). 대응: ① 버튼 시작 시 **직전 실행 때 북마크가 있던(settings.bookmarkCounts) 프로필이 지금 0개 + 브라우저 실행 중**이면 "2~3분 더 열어둔 뒤 직접 닫고 다시 눌러주세요" 경고(취소/계속 선택) ② 쓰기 후 현재 개수를 settings.bookmarkCounts로 저장 | ✅ v1.6.10 |
| [🚨🚨 확장 무한 생성 루프 사고 수정(v1.6.10 재발-3 대응)] | v1.6.9가 브라우저 재시작에 붙인 `--load-extension`을 Chrome 153이 **실제로 로드** → 확장 self-heal이 북마크릿 URL의 Chromium 저장 시 **URL 정규화 차이**로 자기가 만든 북마크를 검색하지 못해 **무한 생성 루프**(교사박동배 프로필 361개, 확장 삭제로 정지 확인). 수정: ① 재시작 플래그 **완전 제거** ② 확장(1.4.1) heal **생성 금지·이동/중복제거 전용** 재작성 ③ heal **회로차단기**(8회/60초) | ✅ v1.6.11 |
| [🛒 롯데마트 제타 규칙] lottemartzetta.com/basket 지원 — `data-test` 속성 기반(fop-product-link=상품명, summary-cost-delivery-charge=배송비, input._counter__input value=수량), 가격은 `_display_` 클래스 첫 매칭(합계, lineTotal→단가=합계÷수량) — 정답 대조 완료(쉐푸드 치킨 3@8,320 · 미네랄워터 1@2,000 · 배송비 3,000, test_OK/롯데마트) | ✅ v1.6.12 |
| [🎨 캡처 스타일 누락 수정] Chrome `saveAsMHTML`/outerHTML은 **CSSOM 주입 스타일(adoptedStyleSheets·shadow DOM)을 캡처에서 누락** → 롯데마트 등에서 요소가 세로로 나열됨(실측: 실시간 캡처엔 인라인 스타일시트 파트 0개 vs 수동 저장엔 58KB). 확장(1.4.2, scripting 권한 추가)은 캡처 직전 `document.adoptedStyleSheets`(+shadowRoot 1단계)를 DOM `<style data-arge-adopted>`로 박제 후 saveAsMHTML, 북마크릿도 동일 주입 — 앱의 URL 재작성 파이프라인은 검증 결과 무결(CSS 3종 모두 app-mhtml:// 로컬화 확인) | ✅ v1.6.12 |
| [🧭 매핑 UX 개선] ① 캡처 대기 화면(좌측 뷰어+매핑 배너)에 "2개 이상 상품" 안내 ② 매핑 패널에 **상품 개수 입력** 추가 — 행 클릭 시 `count-selector` IPC(cheerio)로 선택자 매칭 행 수를 계산해 일치/불일치 배지 표시 | ✅ v1.6.12 |
| [🐞 잠복 버그: 문서 ID 대문자 → app-mhtml 무작위 404] docstore가 UUID 앞 8자를 id로 쓰는데 **URL hostname은 대문자를 소문자로 강제 변환** — 대문자 포함 id가 나오면 뷰어 iframe·프로토콜 조회가 `doc not found`로 실패. id를 **항상 소문자 생성**으로 수정. E2E에 cssPartCheck(CSS 파트 응답 검증)·renderCheck(프레임 내 스타일시트 적용 수/li 가로배치/폰트 실측)·E2E_SHOT(스크린샷) 추가, E2E_DIR을 shoping_cart보다 우선 적용하도록 수정 | ✅ v1.6.13 |
| [🧭 매핑 행 다중 선택·일반화] "한 품목만으로 규칙 생성 시 2개 이상에서 항목 누락" 수정 — picker cssPath가 남기는 `:nth-of-type(n)`이 다른 행 매칭을 막았음. ① 행 클릭 시 **서수 제거한 선택자로 일반화** ② 행 단계가 자동 진행되지 않고 **여러 행을 계속 클릭** 가능(공통 선택자 자동 계산, [다음: 상품명 지정] 버튼으로 진행) ③ 안내 문구 "2개 이상의 상품을 선택 하세요."로 통일(대기 화면·배너·시작 토스트) | ✅ v1.6.13 |
| [🧭 행/열 구분 선택 매핑] 상품이 **행(세로 나열)**이 아닌 **열(표에서 가로 나열)**로 구분되는 쇼핑몰 지원 — ① 매핑 ①단계에 **상품 구분 [행/열] 라디오** ② 열 모드: 첫 상품 셀 클릭으로 표+첫 상품 열 지정 → 상품명/수량/가격/배송비 클릭이 각각 표의 **줄 번호**로 기록 ③ 규칙 스키마 `orientation:'column'`(tableSelector·firstProductCol·nameRow/qtyRow/priceRow/shippingRow) ④ extract.js `extractItemsByColumn`(표 열 순회, 단가=합계÷수량 동일) ⑤ picker가 클릭에 표/셀 좌표(rowIndex·cellIndex) 동봉 ⑥ count-selector IPC 열 모드 상품 수 계산 — 합성 열-표 테스트(3품목·lineTotal·배송비) 통과 | ✅ v1.6.14 |
| 캡처 채널: 익스텐션(MV3, Chrome/Edge/웨일 호환) MHTML / 북마크릿 🛒품의캡처 HTML+소스URL | ✅ |
| [⭐ 북마크바 추가] 브라우저 북마크바 제일 앞에 자동 삽입(실행 중이면 확인→종료→삽입→재시작, 프로필별 백업/중복제거) | ✅ v1.5.3 3중 안전장치: 체크섬 삭제 + 쓰기 후 2초 간격 3회 검증·재적용(시작부스트 복귀 방어) + 확장 self-heal(런타임 API로 index 0 생성/이동, onStartup/onInstalled) |
| [🧩 익스텐션 추가] 모달: 확장페이지 링크 / 개발자모드 강조 / 브라우저별 자동 로드(--load-extension) / 경로 복사 | ✅ v1.5.3 "확장 프로그램 로드"는 브라우저를 실행하지 않고 경로 클립보드 복사+하단 안내만 |
| [💰 배송비 합산 저장] 최종 xls 저장 시 배송비를 가격별로 합산 (3000원x1+3000원x2+4000원x1 → 3000원x3 + 4000원x1) | ✅ v1.5.0 excel.js appendRows에서 처리(누적/다른경로 저장 모두 적용) |
| [🚫 주문서 아닌 캡처 거부] 캡처에서 품목 0건 추출 시 문서·inbox 파일 삭제 후 팝업(매핑 대기 중 제외) — 몰별 메시지: 기본 "주문서 상태에서~" / 네이버 "V버튼을 눌러~" / 쿠팡 "장바구니 상태에서~" / IC114 "장바구니 상태에서 품의캡쳐를 누르세요. 주문하기 화면에서 배송비는 반드시 확인해 보세요." | ✅ v1.6.1 |
| [💾 저장 교체 의미론] "엑셀에 저장"은 선택한 파일을 **현재 표 내용으로 교체**(.bak 백업 후 재생성) — 0% 저장 후 10% 재저장 시 중복 행 발생 버그 수정, 누적은 "불러오기→추가→저장" 플로우로 | ✅ v1.6.1 |
| [↔️ 분할바 개선] 드래그 중 iframe 이벤트 차단 오버레이 + 설정 저장은 드롭 시 1회 — 끊김 없는 좌우 드래그 | ✅ v1.6.1 |
| [🔍 뷰어 줌/스크롤 개편] 단일 스크롤 컨테이너(패널 `overflow:auto`) + sizer(측정 문서크기×zoom) + iframe 자연 크기 고정 후 `scale(zoom)` — 축소 시 이중 세로 스크롤바·빈 공간·문서 하단 가로바 제거, 배율 변경 시 중심점 유지 | ✅ v1.6.2 |
| [📌 북마크 런타임 self-heal] 확장이 `onMoved`/`onChildrenReordered`/`onCreated`(800ms 디바운스)로 맨앞 재고정 + 동일 url+title 중복 정리 + 시작 5초 후 재확인 — Chrome 시작 직후 동기화 등이 북마크를 맨뒤로 밀어내는 현상 방어 | ✅ v1.6.2 |
| [📌 북마크 동기화 근본 수정] `addBookmarkToFront`가 기존 노드를 **삭제 후 새 guid로 재생성하지 않고 기존 guid/id/date_added 노드를 그대로 맨 앞으로 이동** — 새 guid로 재생성하면 Chrome 동기화가 서버의 옛 guid 노드를 원래 위치(맨뒤)로 부활시켜 밀려나던 것. 북마크바·other·synced 전체에서 기존 노드 탐색→있으면 **생성 금지·이동만**, 없을 때만 생성. 확장 runtime heal도 `bookmarks.search` 전체 검색 후 기존 노드 이동(없을 때만 create) | ✅ v1.6.3 |
| [✋ 뷰어 pan] 왼쪽 미리보기에서 **우클릭 또는 휠버튼 드래그로 화면 잡아끌기** — iframe 내부는 주입 스크립트가 movement 델타를 postMessage로 전달, iframe 밖(배경/엑셀뷰)은 컨테이너 mousedown, pan 중 오버레이로 마우스 이벤트 통합·커서 grabbing 표시, pan 중 우클릭 메뉴/휠클릭 기본동작 차단 | ✅ v1.6.3 |
| [🔔 북마크 추가 완료 팝업] 북마크바 추가 후 안내 팝업 — "크롬 브라우져인 경우 북마크바 동기화 상태일 때는 북마크바가 제일 뒷쪽에 생성 됩니다. 클릭 후 편리한 곳으로 드래그 해주세요." (브라우저 재시작 후 표시) | ✅ v1.6.4 |
| [🌐 확장 페이지 열기 수정] browser-action이 **URL 단독 첫 인수 + `--load-extension`** 로 실행 — 기존 `--profile-directory` 플래그 동반 시 실행 중 인스턴스 릴레이에서 URL이 무시되어 빈 창만 열리던 것 수정(Chrome/Edge/웨일 공통). 브라우저 미실행 시 확장 페이지에 '품의 생성기' 자동 등록까지 시도 | ✅ v1.6.4 |
| [🧩 익스텐션 모달 초보자 개편] ①브라우저 큰 버튼 → ②'품의 생성기' 카드 확인(성공 안내) → ③안 보이면 3-1/3-2/3-3 세분계(개발자모드→로드→경로붙여넣기) 구조, 글자 크기·단계 강조 개선 | ✅ v1.6.4 |
| [🔍 휠 줌] 왼쪽 미리보기에서 **마우스 휠로 확대/축소**(노치당 10%, 25~300%) — 커서 위치를 줌 기준점으로 유지, iframe 내부는 주입 스크립트가 휠 이벤트 전달(preventDefault로 스크롤 체이닝 차단), 트랙패드 대비 delta 누적 처리. 문서 뷰에서만 동작(엑셀뷰/대기화면 제외), 스크롤은 pan/스크롤바로 | ✅ v1.6.4 |
| [🔍 휠 줌 감도 절반] 노치당 10% → **5%**로 감소 | ✅ v1.6.5 |
| [🧩 익스텐션 모달 → 수동 설치서] 자동 시도 대신 **완전 수동 설치 안내**로 재구성(브라우저 탭 Chrome/Edge/웨일 × 6단계, 0. 공통 준비 폴더 확인, 설치 후 공통 확인) — 확장 페이지 주소·폴더 경로는 **버튼 클릭 시 클립보드 자동 복사** | ✅ v1.6.5 |
| [⚙ 설정 패널] 헤더 우측 ⚙ 설정 — ① "새 쇼핑몰 규칙 추가" 버튼 표시 토글(**기본 끄기**, settings.json showRuleAdd) ② **사용 매뉴얼(PDF) 보기** — 매뉴얼은 `app/resources/manual.pdf`(pdfkit+맑은고딕, `analysis/make-manual-pdf.js`로 생성, extraResources로 패키징 후 userData에 복사해 열기) | ✅ v1.6.5, v1.6.6 확장 |
| [🗑 시작화면 등록카드 제거] v1.6.5의 시작화면 북마크 등록 카드는 사용자 혼란으로 **완전 제거** — 관련 IPC(bookmark-status/remove-bookmarklets)·store 액션·bookmarks.js removeBookmarklet도 함께 정리 | ✅ v1.6.6 |
| [🖱 휠 줌 감도 설정] 설정 패널에 슬라이더(0.5~10%, 기본값 버튼) — **기본 1.7%/노치**(v1.6.5 감도 5%의 1/3), settings.json zoomSensitivity 저장, zoom 정밀도 0.001로 확대 | ✅ v1.6.6 |
| [🚀 시작 프로그램 등록/삭제] 설정 패널 — HKCU Run 레지스트리(AutoRequisitionGenerator 값), 등록 상태 배지+대상 경로 표시, [등록] 시 **이미 등록되면 "등록 되어 있습니다." 알림**, portable exe는 PORTABLE_EXECUTABLE_DIR의 원본 exe 경로 등록(TEMP 경로 방지), IPC startup-status/register/remove | ✅ v1.6.6 |
| [🔍 텍스트 노드 공백 정규화] extract.js `extractField`: text 노드는 내부 개행/탭을 단일 공백으로 정규화(오피스디포 주문서 상품명 포함 2개 항목 추출). 공백 정규화는 이름·배송비 금액 패턴 매칭에 유리. 기존에는 `.text()` 사용으로 내부 공백 유지 → 오피스디포 상품명 정규식 `^\(\d+\)\s*(.*)$` 실패. 공백 정규화 후 `^\(\d+\)\s*([\s\S]*)$` 성공 → 모든 상품 추출 정상 작동. | ✅ v1.7.2 |
| [🛒 드림디포 주문서 규칙] dreamdepot-order 신규 (드림디포 공식쇼핑몰 /or/ora/SCR_ORA_0001). ① rowSelector: `tr:has(td.qt)` (수량 체크 → 2행). ② name: `td.info`에서 `^\\(\\d+\\)\\s*(.*)$` 정규식 + 공백 정규화. ③ price: `div.goods-price` (페이지에서 합계표시, 단가 아님). ④ qty: `div.goods-num`에서 "N개". ⑤ 배송비: 결제창 `div.val` (중첩된 "기본 배송비" 제외, 첫 직계 자손). ⑥ checkedFallback: true (주문서는 체크 상태 유지 → 수동 저장에서도 V체크됨). 정답: 상품 2건 49,200원 + 배송비 3,000원. | ✅ v1.7.2 |
| [🛒 다이소몰 주문서 규칙] daisomall-order 신규 (다이소몰 주문 페이지 /or/ora/SCR_ORA_0001). ① rowSelector: `div.goods-unit.order` (2행). ② name: `div.tit` (빈 a태그 앞에 위치). ③ price: **lineTotal** (화면에서 합계만 표시 → 단가=합계÷수량: 3,000원→1,000원, 10,000원→5,000원). ④ qty: `div.goods-num`에서 "N개". ⑤ 배송비: 결제창 `div.val` (중첩된 "기본 배송비" 제외, 첫 직계 자손). ⑥ checkedFallback: true. 정답: 상품 2건 (3×1,000원 + 2×5,000원) + 배송비 3,000원. | ✅ v1.7.2 |
| [🛒 알라딘 주문서 규칙] aladin-order 신규 (알라딘 배송정보 입력 페이지). ① rowSelector: `tr.product-row` (2행). ② name: `td.prod-name`에서 `^[^0-9](.*)` (앞의 가격 제거). ③ price: `td.prod-price`에서 `^\\d{1,3}(?:[,\s]\\d{3})*원` (존재 여부 확인). ④ 배송비: 0 (가격=0이면 배송비 없음). ⑤ checkedFallback: true. 정답: 상품 2건, 배송비 0원. | ✅ v1.7.2 |
| [🛒 오피스디포 주문서 규칙] officedepot-order 신규 (오피스디포 공식쇼핑몰 주문 페이지). ① rowSelector: `tr:has(td.qt)` (2행). ② name: `td.info`에서 `^\\(\\d+\\)\\s*(.*)$` + 공백 정규화. ③ price: `td.bm`에서 `^\\d{1,3}(?:[,\s]\\d{3})*원` (선불 결제 금액). ④ qty: `td.qt`. ⑤ 배송비: 0 (선불 결제이므로 배송비 별도 표시 없음). ⑥ checkedFallback: true. 정답: 상품 2건 157,480원 + 배송비 0원. | ✅ v1.7.2 |
| [📊 E2E checkedScriptOk 검증] E2E 결과에 `checkedScriptOk` 추가 — 뷰어 HTML에 data-arge-checked/data-selected 스크립트 존재 여부 확인. v1.6.12의 checkedState 동기화가 잘 적용되었는지 정량 검증. 18개 캡처 파일 전수에서 checkedScriptOk=true, rendererCheck.errs=[], mappingCheck={started:true,waiting:true,frame:"ok",rowClick:true,nameClick:true}. E2E_RESULT JSON에 `checkedScriptOk: true` 포함. | ✅ v1.7.2 |
| [🧹 매핑 화면 렌더링 개편] MHTML 리소스 로컬 해석 정밀화 — ① rewriteUrls가 **`&amp;` 이스케이프 URL도 매칭**(파트 헤더는 raw `&`라 기존엔 쿼리 붙은 CSS/이미지 전부 미매칭→깨진 렌더링이었음) ② **CSS 파트 내부 `url()`/`@import` 재작성**(파트 매칭→app-mhtml://, 미매칭 상대경로→원본 절대 URL, data: 보존) ③ **매핑 모드 iframe 최소 폭 1280px** 보장(반응형 몰의 모바일 레이아웃 붕괴 방지, 일반 뷰어는 기존 자연 폭 유지) | ✅ v1.6.7 |
| [👁 자동 포커스] 파일 열기/품의캡쳐 수신 시 해당 문서를 자동 선택해 좌측 뷰어에 즉시 표시 | ✅ v1.5.1 |
| 쿠팡 장바구니 V체크된 상품만 추출(div[data-selected=true] — 미체크 제외, test_OK/new 정답 xls와 251,770원 일치 검증) | ✅ v1.5.1 |
| [📸 북마크릿 HTML→MHTML 변환] /html 캡처 수신 시 CSS/이미지 리소스를 net.fetch로 받아 MHTML로 저장해 좌측 뷰어가 정돈되게 표시(실패 시 .html 폴백) — 쿠팡 등 Tailwind 페이지 필수 | ✅ v1.5.2 |
| [📊 엑셀 불러오기 개편] 불러오기 시 좌측 엑셀 그리드 뷰(행/열 번호·병합·시트 드롭다운·확대) + 우측 테이블 자동 반영(교체/뒤에 추가/취소 다이얼로그, source:'excel') — excel.MD v2 구현 | ✅ v1.6.0 |
| [💾 저장 단일화] "엑셀에 누적 저장하기" 삭제, "📂 다른 경로에 저장"→**"엑셀에 저장"**(primary) 승격 | ✅ v1.6.0 |
| [↔️ 분할바] 좌/우 패널 드래그 조절(기본 좌 2/3·우 1/3, 더블클릭 복원, 비율 settings 저장) | ✅ v1.6.0 |
| [％ 단가 인상] 상태바 우측 단가 인상 % 선택(기본 0%) — 엑셀에 저장 시 예상단가에 반영, **배송비는 제외** | ✅ v1.6.0 |
| [✏️ 규칙 이름 수정] 내장 규칙 포함 전체 이름 수정 가능(overrides.json) | ✅ v1.5.0 |
| [📊 북마크 진행률] 북마크바 추가 작업 중 브라우저/프로필 진행 상황 오버레이(Book.MD 반영) | ✅ v1.5.0 |
| [새 쇼핑몰 규칙 추가] 캡처 대기 방식: 앱 대기 → 사용자 본인 브라우저에서 캡처 → 파일로 저장·표시 → 6단계 클릭 매핑 | ✅ v1.3.0 |
| 매핑 4단계 "주문금액" → 예상단가 = 주문금액÷수량 자동 환산 | ✅ v1.4.0 |
| 규격 자동 생성(품목명/옵션 정규식, test_OK 정답 패턴, 정확도 21/22) | ✅ |
| 그리드 셀 클릭 편집 / ＋행 추가(수동 문서 폴백) / 행 삭제 | ✅ |
| [🗑 규칙 관리] 사용자 규칙 삭제 | ✅ |
| 엑셀 누적 저장 + [📂 다른 경로에 저장] (.bak 백업, BIFF8) | ✅ |
| 뷰어: iframe 줌(25~300%), 단일 스크롤 컨테이너 방식(v1.6.2 — 문서 전체 크기 iframe + sizer×zoom), `<base href>`로 캡처 이미지 웹 로드 | ✅ |
| 단일 인스턴스 잠금, 포트 폴백 57330~57335, 앱 Ctrl+휠 줌 고정 | ✅ |

## 3. 핵심 아키텍처 (app/)

```
src/main/index.js        창/IPC/프로토콜(app-mhtml://)/수신서버/E2E(runE2E, env E2E=1)
src/main/lib/
  mhtml.js               MIME 파서(QP/base64, charset 스니핑)
  extract.js             규칙 엔진 (아래 §4 스키마)
  spec.js                deriveSpec 규격 자동 생성
  rules.js + rules/*.json  내장 25종 규칙 (사본: analysis/rules/) — builtin 배열 순서=매칭 우선순위(-cart 규칙이 같은 도메인 주문서 규칙보다 앞 / naver가 naver-cart보다 앞: backUrl 쿼리 충돌 방지 / teachermall-cart가 teachermall보다 앞, overrides.json으로 이름 오버라이드)
  docstore.js            문서 로드(MHTML/HTML 자동 판별, fixLazyImages, base href), reextract
  excel.js               SheetJS .xls 읽기/추가/생성 (bookType biff8) + loadExcelFull(헤더 별칭 탐지·품목 행 파싱, excel.MD §3)
  receiver.js            HTTP 수신 /mhtml /html(GET /ping /install) — /html은 mhtmlsave.js로 HTML→MHTML 변환 후 저장(리소스 포함, 뷰어 정돈)
  mhtmlsave.js           북마크릿 HTML → MHTML 변환(cheerio로 CSS/이미지 URL 수집·절대경로화 → net.fetch 다운로드 → multipart/related 조립)
  bookmarks.js           북마크바 JSON 편집(제일 앞 삽입, .arge-bak 백업, 중복 제거)
  bookmarklet.js         북마크릿 URL 빌더 (57330 고정, receiver와 공유)
  picker.js              PICKER_SCRIPT(iframe 주입용; GUEST_PRELOAD_SOURCE는 미사용 레거시)
src/preload/index.js     contextBridge API
src/renderer/            React+Zustand+Tailwind v4 (Header/Viewer/Grid/StatusBar/MappingModal/ExtensionModal/RulesModal/Toasts)
extension/               Chrome/Edge/웨일 MV3 확장 (패키징 시 extraResources로 복사) — bookmarks 권한으로 북마크바 맨 앞 self-heal(onStartup/onInstalled, /bookmark-info에서 이름·URL 동기 수신)
analysis/                규칙 도구: decode_all.js, peek.js, probe-rows.js, test-rule.js, test-spec.js, test-bookmarks.js, test-bookmarklet.js, test-browseraction.js + decoded/(디코드된 샘플 HTML)
```

**IPC 목록:** open-mhtml-files/folder, load-mhtml-path, remove-doc, get-doc-url, reextract-doc, update-rows, list-rules, save-user-rule, delete-user-rule, rename-rule, reject-doc, alert-box, read-excel, pick-excel, load-excel-full, excel-load-confirm, append-excel(호환 유지), save-excel-as, get/set-setting, open-extension-folder, extension-info, copy-text, browser-action(key, action: open-extensions|load-extension), add-bookmarklets, startup-status/register/remove, open-manual, reveal-file + 이벤트 mhtml-received, bookmark-progress

**사용자 데이터:** `%APPDATA%\자동 품의 요구 생성기\` — settings.json(excelPath, lastSourceUrl), rules/(사용자 규칙), inbox/(캡처 저장+sidecar .url.txt), extension/(패키징시 고정 복사 — portable 임시경로 문제 해결용)

## 4. 규칙 엔진 스키마 (중요)

```json
{
  "id": "gmarket", "name": "G마켓", "match": ["gmarket.co.kr"],
  "rowSelector": "div.box__goods-info.product__list",
  "priceIs": "lineTotal",            // 화면금액=단가×수량 합계 → 단가=금액÷수량 환산 (gmarket/naver/teachermall)
  "fields": {
    "name":  { "sel": "...", "attr": "text|value|...", "regex": "...", "group": 1, "match": "last" },
    "qty":   { ... }, "price": { "match": "last" },   // match:last = 여러 strong 중 마지막(G마켓 쿠폰할인가)
    "option": { "sel": ".box__option" }               // 규격 생성에 사용 (gmarket/naver)
  },
  "shipping": { "mode": "selector|row|conditional|perItem|none", "sel": "...", "regex": "...", "first": true, "fee": 3000, "freeOver": 50000, "rowMatch": "배송비" },
  "qtyFromUnit": "셀렉터"  // 수량 속성이 없는 몰: 수량=합계÷단가 (다이소)
}
```

- 사용자 매핑 규칙은 `priceIs: 'lineTotal'` 고정(v1.4.0 요청)
- test_OK/품목내역(통합).xls = 정답 파일: 파워에이드 23,970 = 239,660(쿠폰가)÷10 올림 등으로 검증

## 5. 빌드/배포/테스트 (환경 특이사항 포함)

```powershell
cd app
npm install            # 최초 1회. 이후 npm approve-scripts electron esbuild 필요(allowScripts 정책)
npm run build          # electron-vite 번들 (out/)
# E2E (dev): 개발 E2E는 싱글인스턴스 잠금/포트 충돌과 무관하게 userData 격리됨
$env:E2E='1'; $env:E2E_DIR="..\shoping_cart"; $env:E2E_OUT="<json경로>"; npx electron .
# 패키징 (winCodeSign 심볼릭링크 이슈로 아래 플래그 필수)
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npx electron-builder --win portable --config.win.signAndEditExecutable=false
# 배포 교체 (사용자 앱 실행 중이면 파일 잠김 → question 도구로 닫아달라고 요청)
Copy-Item release\AutoRequisitionGenerator-Portable.exe "..\자동품의요구생성기_Portable.exe" -Force
# 패키징 exe E2E: exe 직접 실행 + 같은 env. **E2E_DIR/E2E_OUT은 절대경로 필수** (portable exe는 %TEMP%에서 실행되어 상대경로가 틀어짐)
```

**E2E 검증 항목(runE2E):** 10개 샘플 전수 파싱(shoping_cart; G마켓 2개=8+6건) · app-mhtml 프로토콜/피커 서빙 · receiver(/ping,/install,/html 캡처→G마켓 인식) · 엑셀 생성/추가/재독 · 렌더러 콘솔 에러 0 · **매핑 클릭 시뮬레이션**(webFrameMain.frames → iframe 내 요소 .click() → rowSelector/picks.name 검증) — 결과 JSON의 `mappingCheck`
**장바구니 규칙 정답 대조:** `node analysis/test-cart-rules.js` — `장바구니_html/` v_check_ok·v_check_not_ok 13몰 캡처 × 정답 xls 전수 비교(수량·올림단가·배송비). 교보 'AI 인공지능 페인팅'·G마켓 '농협안심한우'는 캡처 시점 체크된 정답 외 항목으로 KNOWN_EXTRAS 등록
**스탬핑 캡처 시뮬레이션:** `node analysis/test-cart-stamped.js` — 정답 행의 체크박스만 data-arge-checked=true로 박제한 HTML(=익스텐션/북마크릿 실제 캡처 형태)로 추출해 13몰 정답과 정확 일치 검증(폴백 없음 확인 포함)

**환경 주의:**
- PowerShell 5.1 콘솔 한글 깨짐 → 파일 조작/한글 포함 로직은 node 스크립트로 (analysis/ 참조)
- omo 서브에이전트: 2026-09-16 `~/.config/opencode/oh-my-openagent.json`의 모델 ID를 전부 `zai-coding-plan/glm-5.2`(무거운 에이전트)/`glm-5-turbo`(explore·librarian·quick)로 교체해 수정 — 이전엔 opencode 프로바이저 API 키 무효 + glm-4.6v/glm-5 미존재로 "Sisyphus-Junior not found"·Sisyphus 스트림 오류 발생. 백업: `oh-my-openagent.json.backup-2026-09-16T20-39-03`. **설정 변경 후 opencode 재시작 필요**
- 사용자 앱이 자주 실행 중 → 배포 교체 전 프로세스 확인(`*품의*`,`*Portable*`), question 도구로 종료 요청
- E2E 후 좀비 프로세스 정리 습관화 (이전에 EADDRINUSE 사고 발생)

## 6. 알려진 제약/유의점

- 아이스크림몰 lazy-load 상품명은 MHTML에 없음 → "로딩 중" 추출, 수동 수정
- G마켓 기존 주문서: 추출 합계 567,160 vs 페이지 상품금액 575,110 (7,950원 = 정적 HTML 미표기 옵션금 추정)
- 카프리썬류 "골라담기" 맛 조합은 정적 파싱 불가 → 40개입, 200ml 등으로 대체
- 최신 Chrome stable(v137+)은 --load-extension 차단 → 북마크릿 안내 (Edge/웨일은 바로가기/자동 로드 동작)
- 북마크 편집은 브라우저 **완전 종료 상태**에서만 유효 (실행 중 종료 요청→삽입→재시작 자동화로 처리)
- **동기화 로그인 프로필의 북마크는 파일 삭제로 지워지지 않는다** — 파일 삭제는 동기화 서버에 tombstone으로 반영되지 않아 옛 엔티티가 계속 부활함. 중복 수렴은 반드시 브라우저(북마크 관리자 또는 확장 런타임) 삭제로 1회 처리해야 계정 전체에 전파됨 (v1.6.9 교훈)
- iframe 피커는 앱이 `picker-mode` 메시지를 iframe에 postMessage로 전송해야 단계 진행(v1.0.x의 "클릭 안 됨" 원인 — 재발 주의)
- `findBrowserByKey` 등 **async 호출부 await 누락 주의** (v1.4.1 버그의 원인, Promise가 객체처럼 쓰임)

## 7. 버전 이력 요약

v1.0.0 초기(9몰 규칙·portable exe) → v1.0.1 포트폴백/단일인스턴스 → v1.0.2 G마켓 다중상품 버그+lineTotal 환산 → v1.0.3 규격 자동생성+셀 클릭 편집 → v1.0.4 경로지정 저장·뷰어 스크롤·매핑 모달 우측 배치·G마켓 할인가(match:last) → v1.1.0 브라우저 원클릭 연동/북마크릿 /html → v1.2.0 라이브 브라우저 매핑 → v1.2.1 base href 이미지 수정·웹뷰 표시·클립보드 → v1.2.2 웹뷰 줌/크기 방어 → v1.3.0 캡처 대기 매핑+picker-mode 버그 수정 → v1.4.0 주문금액·규칙삭제·행추가·익스텐션 추가 모달·북마크바 추가 → v1.4.1 await 버그 수정 → v1.5.0 신규 4몰·배송비 합산 저장·캡처 거부 팝업·규칙 이름 수정·북마크 진행률 → v1.5.1 확장페이지 프로필 인식·뷰어 자동 표시·몰별 거부 메시지·쿠팡 V체크 추출 → v1.5.2 북마크 체섬검사·티처몰장바구니 규칙 통합·HTML→MHTML 변환·익스텐션 모달 안내 → v1.5.3 북마크 3중 안전장치·확장 로드 브라우저 미실행 → v1.6.0 엑셀 불러오기 개편·"엑셀에 저장" 승격·좌우 분할바(2/3)·단가 % 인상 저장 → v1.6.1 IC114 규칙(배송비 3,000 고정+전용 거부 메시지)·저장 교체 의미론(0%/10% 중복 해결)·분할바 드래그 매끄럽게 → v1.6.2 뷰어 줌/스크롤 개편(단일 스크롤 컨테이너, 이중 스크롤바·빈 공간 제거)·북마크 런타임 self-heal(이벤트 리스너 재고정)·앱 시작 시 %APPDATA% 확장 자동 갱신(extensionFolder 호출)·확장 manifest 1.2.0 → v1.6.3 북마크 동기화 근본 수정(기존 노드 guid 보존 이동 — 재생성 시 동기화가 옛 guid를 맨뒤로 부활시키던 것 방지, 전체 트리 탐색 후 있으면 생성 금지)·뷰어 우클릭/휠버튼 pan·확장 manifest 1.3.0 → v1.6.4 북마크 추가 완료 팝업(동기화 시 뒤쪽 생성 안내)·확장 페이지 열기 수정(URL 단독 전달+--load-extension, 빈 창만 열리던 버그)·익스텐션 모달 초보자 개편(①②③ 단계 구조)·뷰어 휠 줌(커서 기준점, 노치당 10%) → v1.6.5 휠 줌 감도 절반(5%)·익스텐션 모달 완전 수동 설치서화(주소/경로 클립보드 복사 유지)·⚙ 설정(규칙 추가 버튼 토글 기본 끄기+매뉴얼 PDF 뷰어, pdfkit으로 resources/manual.pdf 생성·번들) → v1.6.6 시작화면 등록카드 제거(오해 소지)·휠 줌 감도 사용자 설정(기본 1.7%=이전의 1/3, 슬라이더)·시작 프로그램 등록/삭제(HKCU Run, 이미 등록 시 "등록 되어 있습니다." 알림, portable 원본 경로 등록) → v1.6.7 매핑 화면 렌더링 개편 — MHTML 리소스 로컬 해석 정밀화(&amp; 엔티티 URL 매칭, CSS 파트 내부 url()/@import 재작성으로 로컬 파트/절대 URL 해석) + 매핑 모드 최소 렌더 폭 1280px → v1.6.8 네이버 장바구니 규칙(shopping.naver.com/cart, naver-cart — builtin 순서 naver 우선) · charset 스마트 디코딩(smartDecode 전 경로, /html 수신 메타 utf-8 재기록, serveDoc 파트 변환) · 북마크 중복 근본 수정(안정 bookmarkGuid 재사용 + bookmark-info 캐노니컬 57330 고정 + 확장 1.4.0 전 폴더 중복·포트 변종 정리) → v1.6.9 북마크 부활 재발 대응 — Bookmarks.bak 동시 기록, 브라우저 완전 소멸 확인 후 쓰기 + read-back 검증 재시도, 동기화 중복 사전/사후 감지 → 북마크 관리자 열기 안내(파일 삭제는 동기화 tombstone이 안 되므로 브라우저 삭제로 1회 수렴), 재시작 --load-extension → v1.6.10 "삭제 직후 버튼" 함정 방지 — 관리자 삭제 직후(브라우저 실행 중 + 직전 있던 프로필이 0개) 버튼 누르면 tombstone 업로드 전에 크롬이 죽어 복제본이 재전송되므로 "2~3분 대기 후 직접 닫고 재시도" 경고 추가, 쓰기 후 bookmarkCounts 저장. E2E 매핑 프레임 선택 정밀화(picker=1)·shoping_cart 샘플 변동 대응 → v1.6.11 확장 무한 생성 루프 사고 수정 — 재시작 --load-extension 완전 제거(Chrome 153이 실제 로드했었음), 확장 1.4.1 heal 생성 금지·이동/중복제거 전용 재작성 + 회로차단기(8회/60초) → v1.6.12 롯데마트 제타 규칙(data-test 기반, 정답 대조 완료) · 캡처 스타일 누락 수정(확장 1.4.2+북마크릿: adoptedStyleSheets를 DOM style로 박제 후 캡처 — saveAsMHTML의 CSSOM 누락 대응) · 매핑 UX(2개 이상 상품 안내 + 상품 개수 입력·count-selector IPC 행 매칭 검증) → v1.6.13 문서 ID 소문자 생성(대문자→hostname 강제 소문자화로 app-mhtml 무작위 404 — 실증: 롯데 캡처 렌더링 renderCheck로 검증, 스타일시트 3종 2,148룰·Pretendard·가로nav 적용 확인) · 매핑 행 다중 선택·nth-of-type 제거 일반화(한 품목 규칙의 품목 누락 방지) · E2E 강화(cssPartCheck·renderCheck·E2E_SHOT·E2E_DIR 우선) → v1.6.14 행/열 구분 선택 매핑 — 열(표 가로 나열) 쇼핑몰 규칙 지원(orientation:'column' 스키마·extractItemsByColumn·picker 셀 좌표·count-selector 열 모드), 매핑 ①단계 행/열 라디오 → **v1.7.0 장바구니 V체크 캡처 전면 지원 — 13몰 정답 대조 전수 통과(analysis/test-cart-rules.js): 신규 10규칙(kyobo-cart·aladin·gmarket-cart·st11-cart·auction-cart·icecream-cart·alphamall-cart·yes24-cart·officedepot·daisomall) + naver-cart(aria-checked 필터)·coupang(data-selected∩input[checked])·dreamdepot(기본배송비 표시값) 수정, 엔진 확장(perItem 배송비 행·shipping.first·qtyFromUnit), V체크 소실 몰 안내 팝업(RULE_CART_NOTICES), 다이소는 label.is-checked 클래스로 필터링 성공** → **v1.7.1 캡처 시점 V체크 박제 — 모든 쇼핑몰 장바구니에서 V체크한 상품만 추출: 익스텐션(1.4.3)·북마크릿이 캡처 직전 input.checked 프로퍼티를 data-arge-checked 속성으로 박제(saveAsMHTML/outerHTML은 프로퍼티를 직렬화하지 않아 G마켓 카트 0건→거부 팝턴 사고 수정), 엔진 checkedOnly{sel,legacySel}(스탬프 우선→수동저장 checked 속성→상태 없으면 전체 추출 폴백+안내), 12몰 카트 규칙 적용·카트 몰 0건 거부 메시지, bookmarks.js 옛 북마크릿 URL 변종 교체(guid 보존)**

## 8. 사용자 협업 패턴

- 응답은 간결한 한국어, 표/불릿 선호
- 사용자 개입 필요 시(앱 종료 요청 등) **question 도구** 적극 활용 — 즉시 응답해줌
- 모든 변경은 "단독 exe 재생성 → 루트 배포 파일 교체"까지 완료해야 작업 완료로 간주
