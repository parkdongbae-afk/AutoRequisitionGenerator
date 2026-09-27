# 물품 자동 선택 (Auto Cart V-Check)

자동 품의 요구 생성기로 만든 `품목내역(통합).xls`의 **행정실용 시트**를 읽어,
쇼핑몰 장바구니에서 일치하는 상품만 자동으로 V체크하는 Chrome Manifest V3 확장 프로그램입니다.

- 엑셀 파일은 팝업 안에서 **로컬로만** 파싱되며 외부로 전송되지 않습니다.
- 수량·옵션·기준 단가가 모두 일치한 상품만 체크합니다. 누락·수량 불일치·가격 인상(한도 초과)·옵션 불일치는
  자동 체크하지 않고 교원에게 보낼 안내문을 복사할 수 있습니다.
- 기존에 체크된 무관한 상품을 해제하지 않으며, 수량·옵션·주문/결제 버튼은 자동으로 만지지 않습니다.
- **네이버 장바구니**: 화면 가상화·노드 재활용 때문에 실행 순간 브라우저 배율을 25%로 낮춰 목록 전체를
  렌더링한 뒤 실행하고, 끝나면 원래 배율로 복원합니다(품의캡처와 동일한 방식).

## 설치 (개발자 모드 — 압축해제된 확장 프로그램 로드)

1. Edge/Chrome/웨일 주소창에 `edge://extensions` (또는 `chrome://extensions`) 입력
2. 우측 상단 **개발자 모드** 켜기
3. **압축해제된 확장 프로그램을 로드** → 이 폴더(`app/extension-autoselect`) 선택
4. 학교 공용 계정으로 쇼핑몰에 로그인 후 장바구니를 열고 툴바의 **물품 자동 선택** 아이콘 클릭

## 지원 쇼핑몰 (장바구니 규칙 14종 — rules-data.js 자동 생성)

| 쇼핑몰 | 규칙 ID | 도메인 |
|---|---|---|
| 알라딘 | aladin | aladin.co.kr |
| 알파몰 | alphamall-cart | alpha.co.kr/order/cart |
| 옥션 | auction-cart | cart.auction.co.kr |
| 쿠팡 | coupang | coupang.com |
| 다이소몰 | daisomall | daisomall.co.kr |
| 드림디포 | dreamdepot | dreamdepot.co.kr |
| G마켓 | gmarket-cart | cart.gmarket.co.kr |
| 아이스크림몰 | icecream-cart | i-screammall.co.kr/order/cart, screammall.co.kr/order/cart |
| 교보문고 | kyobo-cart | order.kyobobook.co.kr/cart |
| 네이버쇼핑 | naver-cart | shopping.naver.com/cart |
| 오피스디포 | officedepot | officedepot.co.kr |
| 11번가 | st11-cart | 11st.co.kr/cart |
| 티처몰 | teachermall-cart | teacherville.co.kr/order/cart |
| 예스24 | yes24-cart | yes24.com/dMyCart/CartMain |

> e마트몰(ssg.com) 장바구니는 주문서 전용 지원으로 자동 선택 대상에서 제외됩니다.
> 알리익스프레스는 교육청 사용 불가로 v1.48.0부터 지원이 제외되었습니다.

## 구성

| 파일 | 역할 |
|---|---|
| `manifest.json` | MV3 설정 — 지원 쇼핑몰 도메인에만 권한 부여 |
| `popup/` | 엑셀 드롭/선택, 금액 무시 한도 설정, 실행, 결과·안내문 복사 |
| `content/core.js` | URL 정규화·매칭·검증·안내문 생성 (순수 로직, node 테스트 가능) |
| `content/rules-data.js` | **자동 생성 파일** — 캡처 규칙에서 셀렉터를 그대로 가져옴 |
| `content/cart-router.js` | 장바구니 DOM 읽기, 안전한 V체크 실행 |
| `background.js` | 팝업↔콘텐츠 메시지 중계, 선택 수 배지 |
| `vendor/xlsx.full.min.js` | SheetJS (로컬 .xls/.xlsx 읽기) |

규칙 재생성: `app/` 폴더에서 `node analysis/make-autoselect-rules.js`
로직 테스트: `app/` 폴더에서 `node analysis/test-autoselect-core.js`
