# 파싱 및 사용자 학습(Mapping) 로직
**업데이트:** 2026-09-13 — 구현 완료 상태 기준 (엔진: `app/src/main/lib/extract.js`)

## 1. MHTML → HTML 디코딩 (`mhtml.js`)
1. 최상위 `Content-Type`의 `boundary`로 multipart 분할
2. 파트별 헤더 파싱 → `quoted-printable`/`base64` 디코딩
3. 첫 `text/html` 파트를 루트 HTML로 선정, charset은 ① 파트 헤더 ② BOM ③ `<meta charset>` 스니핑 순 판별 (iconv-lite 디코딩, U+FFFD 다량 시 대체 charset 재시도)

## 2. 규칙 엔진 스키마 (JSON)
```json
{
  "id": "gmarket", "name": "G마켓",
  "match": ["gmarket.co.kr"],
  "rowSelector": "li.list-item:has(.text__item-name)",
  "fields": {
    "name":  { "sel": ".text__item-name" },
    "qty":   { "sel": ".box__sum .text__sum--number", "regex": "(\\d+)개" },
    "price": { "sel": ".box__couponwrap strong.text__value", "regex": "([\\d,]+)" }
  },
  "shipping": { "mode": "selector", "sel": "...", "regex": "([\\d,]+)원" }
}
```
- 필드 해석: `rowSelector` 각 요소에서 `row.find(sel)` → `attr`(기본 text, value 등 가능) → 선택적 `regex`(group 기본 1) → 숫자 정리. `"match": "last"` 지정 시 첫 요소 대신 마지막 요소 사용 (G마켓 쿠폰적용가: 할인 행은 strong 2개 — 마지막이 할인가, 무할인 행은 1개)
- **`priceIs: "lineTotal"`** (선택): 화면 금액이 "단가×수량 라인 합계"인 쇼핑몰(G마켓·네이버·티처몰)에서 단가 = 합계÷수량로 자동 환산 (수량 1이면 그대로)
- **`qtyFromUnit: "셀렉터"`** (선택, v1.7.0): 수량 input에 value 속성이 없는 몰(다이소몰 Vue 카트)에서 수량 = 합계금액(price) ÷ 단가(qtyFromUnit 셀렉터 값)로 계산
- **`qtyInputSel: "셀렉터"`** (선택, v1.7.3): 뷰어 표시용 — 행 안의 수량 input에 계산된 수량을 value 속성으로 주입한 HTML을 반환(docstore가 서빙). 다이소몰처럼 수량 input에 value 속성 자체가 없어 mhtml 뷰에서 수량이 빈칸으로 보이는 몰용. extractItems 반환값에 `html` 추가
- **`data-arge-checked` 스탬프 → 뷰어 V표시** (v1.7.3, docstore `reflectCheckStates`): 캡처 채널이 박제한 스탬프를 서빙 HTML에서 checked 속성으로 반영(stamp=true→checked 추가, false→checked 제거)해 추출 결과와 뷰어 표시가 일치. 수동 저장 문서는 스탬프가 없어 변화 없음(아이스크림몰은 aria-checked·is-checked 등 흔적 전무 확인 — 폴백+안내 유지)
- **`checkedOnly: { "sel": "input[name=chkList]", "legacySel": "label.el-checkbox.is-checked" }`** (v1.7.1): 장바구니 V체크 필터. `sel` = 행의 체크박스. 판정 3단계 — ① 문서에 `data-arge-checked` 스탬프가 있으면(익스텐션 1.4.3+/북마크릿이 캡처 직전 `input.checked` 프로퍼티를 박제) `true` 행만 추출 ② 스탬프 없으면(수동 저장) 체크박스 `checked` 속성 또는 `legacySel` 요소 존재 ③ 행 어디에서도 상태를 읽지 못한 문서만 전체 추출으로 폴백(`checkedFallback: true` 반환 → 안내 팝업). 네이버는 `aria-checked`가 그대로 직렬화되므로 rowSelector 필터로 충분(checkedOnly 불필요), 쿠팡은 rowSelector `[data-selected=true]` + checkedOnly 조합
- **`textWhitespaceNormalize: true`** (선택, v1.7.2): text 노드 추출 시 내부 개행/탭을 단일 공백으로 정규화(오피스디포 주문서 상품명 `div.tit` 텍스트에 2차원 개행이 있어 `^\\(\\d+\\)\\s*(.*)$` 정규식이 `/m` 플래그 없이 실패 → 공백 정규화 후 `^\\(\\d+\\)\\s*([\s\S]*)$` 성공). 규칙 엔진 `extractField`: `attr === 'text'` → `el.text().replace(/\s+/g, ' ')` → `trim()`. 이름·배송비 금액 패턴 매칭에 유리. 기존에는 `.text()` 사용으로 내부 공백 유지 → 오피스디포/교보 상품명 정규식 실패 문제 해결
- 행 스킵 조건: 이름 비어있음 또는 가격 null. 수량 미지정 시 기본 1
- **`shipping.checkedScope: true`** (v1.7.3 하이브리드 판정): 그룹별 배송비에서 체크된(V) 상품이 없는 그룹의 배송비 제외. 그룹 구조 2형태 지원 — ① **그룹 컨테이너형**(G마켓: 상품+배송비 footer가 같은 div): 체크박스를 포함하는 가장 가까운 조상이 다른 배송비 요소를 품지 않으면 그 조상 안의 박스로 판정 ② **형제 행형**(티처몰: 배송비 행 tr.shop_info가 그룹 상품 행들 앞에 나열): 이 배송비 요소부터 다음 배송비 요소 전까지의 박스로 판정. 어느 쪽으로도 박스를 못 찾으면(구조 미지 문서) 유지. 박스 판정은 checkedOnly와 동일(스탬프 문서=스탬프값, 수동 문서=checked 속성)
- **장바구니 V체크 필터링 (v1.7.0):** 체크 상태가 MHTML의 DOM에 남는 몰은 rowSelector에 `:has(...)` 로 필터를 건다 — 교보/알라딘/G마켓/11번가 `input[checked]`, 네이버 `button[aria-checked=true]`, 쿠팡 `[data-selected=true]:has(input[checked])` (익스텐션 캡처=속성, 수동 저장=checked 속성이라 교집합), 다이소 `label.el-checkbox.is-checked`. 체크 상태가 소실되는 몰(드림디포·아이스크림몰·옥션·알파몰·예스24·오피스디포)은 전체 추출 후 안내 팝업(store.js `RULE_CART_NOTICES`)
- **배송비 모드 5종:**
  - `selector`: 페이지 요소들의 숫자 합산. `discountSel` 지정 시 할인액 차감(예: 아이스크림몰 배송비 5,000 - 할인 5,000 = 0). "무료"는 0원 처리. **`first: true`** (v1.7.0) 지정 시 첫 매칭 값만 사용(알파몰: 행마다 "3,000원 (5만원이상 무료)" 정책 표시라 합산하면 과대)
  - `row`: `rowSelector` 내에서 이름에 `rowMatch`(기본 "배송비") 포함된 행을 배송비로 합산
  - `conditional`: `fee` + `freeOver` — 상품 합계가 `freeOver` 이상이면 무료 (예: 드림디포 5만원, 예스24 1.5만원, 알파몰 5만원)
  - `perItem` (v1.7.0): 각 상품 행 안에서 배송비를 찾아 **"`<상품명> 배송비`" 행을 별도 아이템으로 추가**(11번가 장바구니 — 상품별 배송비가 다른 몰). 추출 결과의 `isShipping` 플래그가 true로 붙고 docstore가 규격/단위를 배송비 행으로 처리, 엑셀 저장 시 aggregateShipping가 기존처럼 가격별 합산
  - `none`: 배송비 미추출

## 3. 단가 올림 로직
```javascript
function roundUpToTen(n) {
  return Math.ceil(n / 10) * 10 // 1568 -> 1570
}
```
품목 단가와 배송비 모두 적용. 총액 = 올림 단가 × 수량.

## 3.1 규격 자동 생성 (`spec.js` deriveSpec, v1.0.3)
품목명 + 옵션(G마켓 `.box__option` / 네이버 `ProductOption_name` 등 규칙의 `fields.option`)에서 정규식 토큰 추출 후 위치순 ", " 결합:
1. **AxN 수량형**: `216Gx6개` → `216g, 6개` / `200mlx24팩` → `200ml, 24개입`
2. **치수형**: `24x32`, `21X29.7cm` → `21x29.7cm`
3. **라벨형** (폭|너비|길이|높이|두께|지름|직경 화이트리스트): `폭 57cm`, `길이 1.0m`
4. **값+단위**: `324g`, `355ml`, `640g`, `24mm`
5. **개수 정규화**: 팩/페트/캔/병/타 → `N개입`, 박스/BOX → `N상자`, `N세트/N종/N색/N호/N매/N대용/N인치/N개`
6. **용지 규격**: A3~A6, B4~B6
- 옵션 라벨(색상/옵션/사이즈 등) 제거, `옵션없음` 무시, 중복 키/범위 중복 제거, 최대 5토큰
- 수치 토큰이 없고 옵션에 숫자가 없으면 옵션 텍스트 자체를 규격으로 (예: `은색 오링 세트`; 품목명 `/ A+B+C` 꼬리가 있으면 결합)
- 매칭 없으면 빈칸 (도서 등). test_OK 정답 대비 정확도 21/22 (예외: 골라담기 맛 조합은 정적 파싱 불가)

## 4. 내장 규칙 29종 요약 (`rules/*.json` 참조. v1.7.0부터 `-cart` 접미사 규칙이 같은 도메인의 주문서 규칙보다 우선 매칭)
| 규칙 | rowSelector | 핵심 필드 | 배송비 |
|---|---|---|---|
| gmarket | `div.box__goods-info.product__list` (판매자 그룹 li에 다중 상품) | 이름 `.text__item-name`, 수량 `.text__sum--number`, **priceIs: lineTotal** | selector `li.benefit_item:contains('배송비')` |
| kyobo | `table.tbl_prod tbody tr` | `span.prod_name` / `span.prd_num` / `span.price > .val` | selector `li.payments_info_item` |
| naver | `[class*=ProductItem_article]` | CSS모듈 해시클래스 prefix 매칭, **priceIs: lineTotal** | selector `[class*=ProductStore_delivery]` |
| dreamdepot | `tr:has(input.pm_number)` | 수량 `input.pm_number.value` | conditional 3,000/50,000 |
| icecreammall | `div.relative.flex.items-start.border-b:has(p.body3)` | Tailwind 클래스 구조 | selector + discountSel |
| alphamall | `table.list-product-a tbody tr` | `p.name` / `td.mount` / `p.price-after` | conditional 3,000/50,000 |
| 11st | `li.group_prd` | `.prd_name a` / 수량 `.c_order_quantity .number` + **priceIs: lineTotal**(할인모음가, v1.7.3) | selector `#dlvTotalAmountView` |
| yes24 | `table.tbl_l tbody tr:has(td)` | 4/5번째 td (수량/할인단가) | conditional 2,500/15,000 |
| teachermall | `tr[class*=goods_][class*=_delivery]` | 2/3번째 td, **priceIs: lineTotal** | selector `.std_delivery_price` |
| teachermall-cart | `tr:has(input.chk01)` | 이름 `a.order_name`, 수량 `input[id^=cart_cnt]` value, 단가 cost_info '개당 N원' | selector `em.fc_blue1` + checkedScope(판매자 그룹, v1.7.3) |
| dreamdepot-order | `tr:has(td.qt)` | 이름 `td.info` (정규식 `^\\(\\d+\\)\\s*(.*)$`), priceIs: lineTotal, qty `div.goods-num` | selector `div.val` (첫 직계 자손, 중첩 '기본 배송비' 제외) |
| daisomall-order | `div.goods-unit.order` | 이름 `div.tit` (빈 a태그 앞), priceIs: lineTotal, qty `div.goods-num` | selector `div.val` (첫 직계 자손, 중첩 '기본 배송비' 제외) |
| aladin-order | `tr.product-row` | 이름 `td.prod-name` (앞의 가격 제거), price: `td.prod-price` (regex `^\\d{1,3}(?:[,\s]\\d{3})*원`) | none (가격=0이면 배송비 없음) |
| officedepot-order | `tr:has(td.qt)` | 이름 `td.info` (정규식 `^\\(\\d+\\)\\s*(.*)$`), price `td.bm` (regex `^\\d{1,3}(?:[,\s]\\d{3})*원`), qty `td.qt` | none (선불 결제이므로 배송비 별도 없음) |

## 5. 사용자 학습(매핑) 로직 (`picker.js` + MappingModal)
1. iframe을 피커 모드(`app-mhtml://<id>/?picker=1`)로 로드 → 클릭 수집 스크립트 주입
2. 클릭 시 요소에서 **고유 CSS Selector 자동 생성**: 태그 + (id 있으면 id, 없으면 클래스 최대 2개) + 형제 순서(`:nth-of-type`) 체인. 행 기준 상대 경로로 생성
3. 단계별 수집: 행 → 상품명 → 수량(선택) → 단가 → 배송비(선택). 수량/배송비는 건너뛰기 가능
4. 규칙명/ID/URL 패턴 확인 후 저장 → `userData/rules/<id>.json` → 해당 문서에 즉시 재적용
5. 이후 로드 시 `match` 패턴으로 자동 인식. 규칙 ID는 영문 소문자/숫자/하이픈 제한

## 6. 파싱 시 사전 처리
- `<script>` 제거(실행 방지) 및 `<meta http-equiv=Content-Security-Policy>` 제거(피커 주입 허용)
- 원본 URL → `app-mhtml://<docId>/<partIndex>` 문자열 치환으로 이미지 등 리소스 복원
