#!/usr/bin/env node
/*
 * test-autoselect-core.js — 물품 자동 선택 순수 로직(content/core.js) 단위 테스트
 * 실행: app/ 폴더에서 `node analysis/test-autoselect-core.js`
 * 성공 시 마지막 줄에 ALL PASS 출력, 실패 시 exit 1.
 */
'use strict';

const Core = require('../extension-autoselect/content/core.js');

let passCount = 0;
let failCount = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) { passCount++; return; }
  failCount++;
  failures.push(name + (detail ? ' :: ' + detail : ''));
}

function eq(name, actual, expected) {
  const a = typeof actual === 'string' ? actual : JSON.stringify(actual);
  const e = typeof expected === 'string' ? expected : JSON.stringify(expected);
  check(name, actual === expected, 'actual=' + a + ' expected=' + e);
}

// ---------- 1. URL 정규화 ----------
(function testUrlNormalization() {
  const base = Core.normalizeUrl('https://item.gmarket.co.kr/Item?goodscode=1234567&utm_source=naver&utm_medium=cpc#options');
  eq('normalize: hash 제거', base.includes('#'), false);
  eq('normalize: utm_* 제거', base.includes('utm_'), false);
  eq('normalize: 상품 ID 파라미터 보존', base.includes('goodscode=1234567'), true);
  eq('normalize: host+path 형태', base, 'item.gmarket.co.kr/Item?goodscode=1234567');

  const http = Core.normalizeUrl('http://item.gmarket.co.kr/Item?goodscode=1234567');
  const https = Core.normalizeUrl('https://item.gmarket.co.kr/Item?goodscode=1234567');
  eq('normalize: http/https 통일', http, https);

  const tracked = Core.normalizeUrl('https://brand.naver.com/myschool/products/777?trackingCode=cart&NaPm=ct%3Dxyz&sort=pop');
  eq('normalize: tracking 파라미터 제거', tracked.includes('trackingCode'), false);
  eq('normalize: NaPm 제거', tracked.includes('NaPm'), false);
  eq('normalize: 일반 파라미터 보존', tracked.includes('sort=pop'), true);
  eq('normalize: 경로 상품번호 보존', tracked.includes('/products/777'), true);

  eq('normalize: 빈 값', Core.normalizeUrl(''), '');
  eq('normalize: protocol-relative', Core.normalizeUrl('//item.gmarket.co.kr/Item?goodscode=9'), 'item.gmarket.co.kr/Item?goodscode=9');

  eq('productKey: goodscode', Core.extractProductKey('https://item.gmarket.co.kr/Item?goodscode=1234567'), '1234567');
  eq('productKey: 쿠팡 경로', Core.extractProductKey('https://www.coupang.com/vpdp/123456789'), '123456789');
  eq('productKey: products 경로', Core.extractProductKey('https://brand.naver.com/myschool/products/777'), '777');
  eq('productKey: 없으면 null', Core.extractProductKey('https://www.example.com/list?page=2'), null);

  eq('option: 공백 정규화', Core.normalizeOption(' 80g,  1박스 '), '80g, 1박스');
  eq('option: null → 빈 문자열', Core.normalizeOption(null), '');

  eq('toUnitPrice: 단가 그대로', Core.toUnitPrice(25000, 2, null), 25000);
  eq('toUnitPrice: lineTotal 환산', Core.toUnitPrice(50000, 2, 'lineTotal'), 25000);
  eq('toUnitPrice: lineTotal 나누어떨어지지 않음(반올림)', Core.toUnitPrice(100, 3, 'lineTotal'), 33);
  eq('toUnitPrice: 수량 미확 시 1개 취급', Core.toUnitPrice(25000, null, 'lineTotal'), 25000);
})();

// ---------- 2. 매칭 우선순위 ----------
(function testMatching() {
  const cartItems = [
    { cartRowId: 'c1', productUrl: 'https://item.gmarket.co.kr/Item?goodscode=100&utm_source=x', name: '복사용지 A4', option: '80g, 1박스', quantity: 2, price: 50000, priceIs: 'lineTotal', checked: false },
    { cartRowId: 'c2', productUrl: 'https://item.gmarket.co.kr/Item?goodscode=200', name: '공책', option: '', quantity: 1, price: 3000, priceIs: null, checked: false },
    { cartRowId: 'c3', productUrl: 'https://item.gmarket.co.kr/Item?goodscode=300', name: '바인더', option: 'A4 흰색', quantity: 1, price: 5000, priceIs: null, checked: false },
    { cartRowId: 'c4', productUrl: 'https://item.gmarket.co.kr/Item?goodscode=300', name: '바인더', option: 'A4 흰색', quantity: 1, price: 5000, priceIs: null, checked: false },
    { cartRowId: 'c5', productUrl: 'https://item.gmarket.co.kr/Item?goodscode=400', name: '색종이', option: '혼합색', quantity: 1, price: 2000, priceIs: null, checked: false }
  ];
  const prepared = cartItems.map(Core.prepareCartItem);

  // 1) productKey + option 정확 일치 → 매칭됨
  const row1 = { rowId: 'r1', url: 'https://item.gmarket.co.kr/Item?goodscode=100&SrcCode=999', qty: 2, option: '80g, 1박스', basePrice: 25000, name: '복사용지 A4' };
  const m1 = Core.resolveMatch(row1, prepared);
  check('매칭1: key+option 정확 일치', m1.item && m1.item.cartRowId === 'c1', JSON.stringify(m1));

  // canonical URL + option 일치(key가 없어도 URL로 매칭)
  const row2 = { rowId: 'r2', url: 'https://item.gmarket.co.kr/Item?goodscode=200', qty: 1, option: '', basePrice: 3000, name: '공책' };
  const m2 = Core.resolveMatch(row2, prepared);
  check('매칭2: canonical URL + 옵션 둘 다 없음', m2.item && m2.item.cartRowId === 'c2', JSON.stringify(m2));

  // 모호: 같은 URL+옵션 카트 행이 2개 → AMBIGUOUS_MATCH, 체크 대상 없음
  const row3 = { rowId: 'r3', url: 'https://item.gmarket.co.kr/Item?goodscode=300', qty: 1, option: 'A4 흰색', basePrice: 5000, name: '바인더' };
  const m3 = Core.resolveMatch(row3, prepared);
  eq('매칭3: 다중 행 모호 → AMBIGUOUS_MATCH', m3.code, 'AMBIGUOUS_MATCH');
  eq('매칭3: 체크 안 함', m3.item, null);

  // 같은 URL, 다른 옵션 → OPTION_MISMATCH, 체크 안 함
  const row4 = { rowId: 'r4', url: 'https://item.gmarket.co.kr/Item?goodscode=400', qty: 1, option: '파란색', basePrice: 2000, name: '색종이' };
  const m4 = Core.resolveMatch(row4, prepared);
  eq('매칭4: URL 같고 옵션 다름 → OPTION_MISMATCH', m4.code, 'OPTION_MISMATCH');
  eq('매칭4: 체크 안 함', m4.item, null);
  check('매칭4: 장바구니 옵션 값 안내 포함', (m4.actualOptions || '').includes('혼합색'), m4.actualOptions);

  // 옵션이 없는 엑셀 vs 옵션 있는 카트 → OPTION_MISMATCH(§8.4 검토 경고)
  const row5 = { rowId: 'r5', url: 'https://item.gmarket.co.kr/Item?goodscode=400', qty: 1, option: '', basePrice: 2000, name: '색종이' };
  eq('매칭5: 엑셀 옵션 없음+카트 옵션 있음 → OPTION_MISMATCH', Core.resolveMatch(row5, prepared).code, 'OPTION_MISMATCH');

  // URL 없는 엑셀 행 → runMatch에서 INVALID_EXCEL_ROW, 체크 안 함
  const run1 = Core.runMatch([
    { rowId: 'rx', url: '', qty: 1, option: '', basePrice: 1000, name: 'URL 없는 행' },
    { rowId: 'ry', url: 'https://item.gmarket.co.kr/Item?goodscode=999', qty: 0, option: '', basePrice: 1000, name: '수량 0 행' }
  ], cartItems, { tolerance: 0 });
  eq('매칭6: URL 없는 행 → INVALID_EXCEL_ROW', run1[0].issues[0].code, 'INVALID_EXCEL_ROW');
  eq('매칭6: 체크 안 함', run1[0].checked, false);
  eq('매칭6: 수량 0 행도 INVALID', run1[1].issues[0].code, 'INVALID_EXCEL_ROW');

  // 카트에 아예 없는 상품 → MISSING
  const run2 = Core.runMatch([
    { rowId: 'rz', url: 'https://item.gmarket.co.kr/Item?goodscode=55555', qty: 1, option: '', basePrice: 1000, name: '없는 상품' }
  ], cartItems, { tolerance: 0 });
  eq('매칭7: 카트에 없음 → MISSING', run2[0].issues[0].code, 'MISSING');
})();

// ---------- 3. 가격 검증 ----------
(function testPrice() {
  const row = { rowId: 'p1', url: 'https://item.gmarket.co.kr/Item?goodscode=100', qty: 2, option: '80g, 1박스', basePrice: 25000, name: '복사용지 A4' };
  // lineTotal 52,000 ÷ 2 = 현재 단가 26,000 — 기준 25,000보다 1,000 높음
  const cart = [
    { cartRowId: 'c1', productUrl: 'https://item.gmarket.co.kr/Item?goodscode=100', name: '복사용지 A4', option: '80g, 1박스', quantity: 2, price: 52000, priceIs: 'lineTotal', checked: false }
  ];

  const overTight = Core.runMatch([row], cart, { tolerance: 500 });
  eq('가격: 26,000 vs 25,000 한도 500 → PRICE_HIGHER', overTight[0].issues[0].code, 'PRICE_HIGHER');
  eq('가격: 체크 안 함', overTight[0].checked, false);
  eq('가격: expected=25000', overTight[0].issues[0].expected, 25000);
  eq('가격: actual=26000(lineTotal 환산)', overTight[0].issues[0].actual, 26000);
  eq('가격: diff=+1000', overTight[0].issues[0].diff, 1000);

  const overLoose = Core.runMatch([row], cart, { tolerance: 1500 });
  eq('가격: 한도 1500 → 통과', overLoose[0].status, 'OK');
  eq('가격: 차이가 한도와 같으면 경고 없음(초과만)', Core.runMatch(
    [row], cart, { tolerance: 1000 })[0].status, 'OK');

  const cheaper = Core.runMatch([row], [
    { cartRowId: 'c1', productUrl: 'https://item.gmarket.co.kr/Item?goodscode=100', name: '복사용지 A4', option: '80g, 1박스', quantity: 2, price: 48000, priceIs: 'lineTotal', checked: false }
  ], { tolerance: 0 });
  eq('가격: 현재가 더 저렴 → OK', cheaper[0].status, 'OK');
  eq('가격: 저렴해도 경고 없음', cheaper[0].issues.length, 0);

  // 기준 단가 열이 없으면 가격 검증 보류(notes), 수량/옵션 검사는 계속
  const noBase = Core.runMatch([
    { rowId: 'p2', url: 'https://item.gmarket.co.kr/Item?goodscode=100', qty: 2, option: '80g, 1박스', basePrice: null, name: '복사용지 A4' }
  ], cart, { tolerance: 500 });
  eq('가격: 기준 단가 없음 → OK(가격만 보류)', noBase[0].status, 'OK');
  check('가격: 가격 검증 불가 안내 존재', noBase[0].notes.some((n) => n.includes('가격 검증')), JSON.stringify(noBase[0].notes));
})();

// ---------- 4. 수량 불일치 ----------
(function testQty() {
  const row = { rowId: 'q1', url: 'https://item.gmarket.co.kr/Item?goodscode=100', qty: 2, option: '80g, 1박스', basePrice: 25000, name: '복사용지 A4' };
  const cart = [
    { cartRowId: 'c1', productUrl: 'https://item.gmarket.co.kr/Item?goodscode=100', name: '복사용지 A4', option: '80g, 1박스', quantity: 1, price: 50000, priceIs: null, checked: false }
  ];
  const res = Core.runMatch([row], cart, { tolerance: 0 });
  eq('수량: QTY_MISMATCH', res[0].issues[0].code, 'QTY_MISMATCH');
  eq('수량: expected 2', res[0].issues[0].expected, 2);
  eq('수량: actual 1', res[0].issues[0].actual, 1);
  eq('수량: 체크 안 함', res[0].checked, false);

  // 수량을 못 읽는 몰(예: 예스24) — 수량 검증 보류, 나머지는 검사
  const noQty = Core.runMatch([row], [
    { cartRowId: 'c2', productUrl: 'https://item.gmarket.co.kr/Item?goodscode=100', name: '복사용지 A4', option: '80g, 1박스', quantity: null, price: 25000, priceIs: null, checked: false }
  ], { tolerance: 0 });
  eq('수량: 읽지 못하면 보류(OK)', noQty[0].status, 'OK');
  check('수량: 보류 안내 존재', noQty[0].notes.some((n) => n.includes('수량')), JSON.stringify(noQty[0].notes));
})();

// ---------- 5. 안내문 생성(§9.2 템플릿) ----------
(function testMessages() {
  const row = { rowId: 'm1', url: 'https://item.gmarket.co.kr/Item?goodscode=100', qty: 2, option: '80g, 1박스', basePrice: 25000, name: '복사용지 A4' };
  const item = Core.prepareCartItem({ cartRowId: 'c1', productUrl: 'https://item.gmarket.co.kr/Item?goodscode=100', name: '복사용지 A4', option: '80g, 1박스', quantity: 1, price: 52000, priceIs: 'lineTotal' });
  // 가격 안내문용: lineTotal 52,000 ÷ 2 = 현재 단가 26,000
  const itemQty2 = Core.prepareCartItem({ cartRowId: 'c1', productUrl: 'https://item.gmarket.co.kr/Item?goodscode=100', name: '복사용지 A4', option: '80g, 1박스', quantity: 2, price: 52000, priceIs: 'lineTotal' });
  const ctx = { teacherName: '홍길동', mallName: 'G마켓 장바구니', row: row, item: item, tolerance: 500 };
  const line = (s) => s.split('\n');

  // 상품 누락
  const miss = Core.buildIssueMessage('MISSING', ctx);
  check('누락: 교원 이름', miss.startsWith('홍길동 선생님, 많이 바쁘시죠?'), miss);
  check('누락: 쇼핑몰명', miss.includes('G마켓 장바구니에 아래 물품이 없습니다.'), miss);
  check('누락: 물품명', miss.includes('- 물품명: 복사용지 A4'), miss);
  check('누락: 옵션', miss.includes('- 옵션: 80g, 1박스'), miss);
  check('누락: 요청 수량', miss.includes('- 요청 수량: 2'), miss);
  check('누락: 상품 URL', miss.includes('- 상품 URL: ' + row.url), miss);
  check('누락: 협조적 마무리', miss.includes('장바구니에 다시 담아 주시면 감사하겠습니다.'), miss);

  // 수량 불일치
  const qty = Core.buildIssueMessage('QTY_MISMATCH', ctx);
  check('수량: 머리말', qty.includes('홍길동 선생님, 많이 바쁘시죠?'), qty);
  check('수량: 쇼핑몰명 + 안내', qty.includes('G마켓 장바구니의 아래 물품 수량이 품목내역과 다릅니다.'), qty);
  check('수량: 품목내역 값', qty.includes('- 품목내역 수량: 2'), qty);
  check('수량: 장바구니 값', qty.includes('- 장바구니 수량: 1'), qty);
  check('수량: 협조적 마무리', qty.includes('확인 후 장바구니 수량을 수정해 주세요.'), qty);

  // 가격 인상
  const price = Core.buildIssueMessage('PRICE_HIGHER', { teacherName: '홍길동', mallName: 'G마켓 장바구니', row: row, item: itemQty2, tolerance: 500 });
  check('가격: 쇼핑몰명 + 안내', price.includes('G마켓 장바구니의 아래 물품 가격이 품목내역과 다릅니다.'), price);
  check('가격: 기준 단가', price.includes('- 품목내역 기준 단가: 25,000원'), price);
  check('가격: 현재 단가', price.includes('- 장바구니 현재 단가: 26,000원'), price);
  check('가격: 차이(+1,000원)', price.includes('- 차이: +1,000원'), price);
  check('가격: 금액 무시 한도', price.includes('- 금액 무시 한도: 500원'), price);
  check('가격: 마무리', price.includes('대체 상품 선택 또는 품의 금액 확인이 필요합니다.'), price);

  // 옵션 불일치
  const opt = Core.buildIssueMessage('OPTION_MISMATCH', {
    teacherName: '홍길동', mallName: 'G마켓 장바구니',
    row: row, item: { option: '80g, 2박스' }
  });
  check('옵션: 쇼핑몰명 + 안내', opt.includes('G마켓 장바구니의 아래 물품 옵션이 품목내역과 다릅니다.'), opt);
  check('옵션: 물품명', opt.includes('- 물품명: 복사용지 A4'), opt);
  check('옵션: 품목내역 옵션', opt.includes('- 품목내역 옵션: 80g, 1박스'), opt);
  check('옵션: 장바구니 옵션', opt.includes('- 장바구니 옵션: 80g, 2박스'), opt);
  check('옵션: 협조적 마무리', opt.includes('확인 후 올바른 옵션의 물품을 장바구니에 담아 주세요.'), opt);

  // 이름이 없으면 '선생님' 대체
  const noName = Core.buildIssueMessage('MISSING', { teacherName: '', mallName: '쿠팡', row: row, item: item });
  check('이름 없음 → 선생님 대체', noName.startsWith('선생님, 많이 바쁘시죠?'), line(noName)[0]);
})();

// ---------- 6. checkboxEl 전달(체크 클릭 가능성) ----------
// cart-router는 runMatch 결과의 item.checkboxEl.click()으로 V체크한다.
// prepareCartItem이 DOM 요소를 누락하면 'Cannot read properties of undefined (reading click)'로 실패한다(실측 버그).
(function testCheckboxElPassthrough() {
  const fakeBox = { click: () => {}, checked: false };
  const cart = [
    { cartRowId: 'c1', productUrl: 'https://item.gmarket.co.kr/Item?goodscode=100', name: '복사용지 A4', option: '80g, 1박스', quantity: 2, price: 50000, priceIs: 'lineTotal', checked: false, checkboxEl: fakeBox }
  ];
  const prepared = Core.prepareCartItem(cart[0]);
  check('checkboxEl: prepareCartItem이 보존', prepared.checkboxEl === fakeBox, prepared.checkboxEl);

  const res = Core.runMatch([
    { rowId: 'r1', url: 'https://item.gmarket.co.kr/Item?goodscode=100', qty: 2, option: '80g, 1박스', basePrice: 25000, name: '복사용지 A4' }
  ], cart, { tolerance: 0 });
  eq('checkboxEl: OK 판정', res[0].status, 'OK');
  check('checkboxEl: OK 결과 item이 요소 보유(클릭 가능)', res[0].item && typeof res[0].item.checkboxEl === 'object' && typeof res[0].item.checkboxEl.click === 'function', res[0].item && res[0].item.checkboxEl);
})();

// ---------- 7. 체크박스 공유 카드(멀티 유닛) 클릭 계획 ----------
// G마켓 등은 상품 카드 1개 체크박스에 옵션 유닛 N개가 묶여 있다.
// 유닛별로 독립 품목이어도 실제 클릭은 카드 체크박스 1번 — 재클릭하면 해제된다(실측 버그:
// 1호 클릭(체크) → 2호 재클릭(해제) → CHECK_FAILED).
(function testPlanCheckboxClicks() {
  const box = { id: 'boxM' };
  const boxByRowId = new Map([['A', box], ['B', box]]);
  const membersByBox = new Map([[box, ['A', 'B']]]);

  // 사용자 시나리오: 1호·2호 둘 다 엑셀에 있고 둘 다 OK → 첫 행 click, 둘째 행 skip(재클릭 금지)
  const both = [
    { status: 'OK', item: { cartRowId: 'A' } },
    { status: 'OK', item: { cartRowId: 'B' } }
  ];
  let plan = Core.planCheckboxClicks(both, boxByRowId, membersByBox, []);
  eq('계획1: 첫 행 click', plan.get('A').action, 'click');
  eq('계획1: 둘째 행 skip(재클릭 금지)', plan.get('B').action, 'skip');

  // 부분 커버: 1호만 엑셀에 있으면 2호가 함께 선택되므로 hold
  const partial = [{ status: 'OK', item: { cartRowId: 'A' } }];
  plan = Core.planCheckboxClicks(partial, boxByRowId, membersByBox, []);
  eq('계획2: 유닛 미커버 → hold', plan.get('A').action, 'hold');
  check('계획2: 보류 사유 안내 존재', !!plan.get('A').note, plan.get('A'));

  // 같은 박스의 다른 행이 ISSUE(가격 인상 등)면 OK 행도 hold
  const mixed = [
    { status: 'OK', item: { cartRowId: 'A' } },
    { status: 'ISSUE', item: { cartRowId: 'B' } }
  ];
  plan = Core.planCheckboxClicks(mixed, boxByRowId, membersByBox, []);
  eq('계획3: 짝 행 문제 → OK 행도 hold', plan.get('A').action, 'hold');

  // 이미 체크된 카드(읽기 시점 checked) → 두 행 모두 skip
  plan = Core.planCheckboxClicks(both, boxByRowId, membersByBox, ['A', 'B']);
  eq('계획4: 초기 체크됨 → skip', plan.get('A').action, 'skip');
  eq('계획4: 초기 체크됨 → skip(2)', plan.get('B').action, 'skip');

  // 단일 유닛 카드(형제 없음) → click
  const single = new Map([['S', { id: 'boxS' }]]);
  const singleMembers = new Map([[{ id: 'boxS' }, ['S']]]);
  plan = Core.planCheckboxClicks([{ status: 'OK', item: { cartRowId: 'S' } }], single, singleMembers, []);
  eq('계획5: 단일 유닛 → click', plan.get('S').action, 'click');
})();

// ---------- 8. 상품 키 전용 매칭(URL 없는 몰 — 네이버) ----------
// 네이버 장바구니는 SPA라 행 안에 앵커가 없어 상품 URL을 저장할 수 없다.
// 캡처 규칙의 productKey(data-shp-contents-id)로만 매칭해야 한다(실측 버그: URL 필수라 INVALID_EXCEL_ROW로 전부 거부).
(function testKeyOnlyMatching() {
  // URL 없이 상품 키만 있는 엑셀 행 → 유효 행으로 매칭된다
  const cart = [
    { cartRowId: 'n1', productUrl: '', productKey: '10796470805', name: '라익미 BC10 스피커', option: '단품', quantity: 2, price: 59600, priceIs: 'lineTotal', checked: false }
  ];
  const row = { rowId: 'r12', url: '', productKey: '10796470805', qty: 2, option: '단품', basePrice: 29800, name: '라익미 BC10 스피커' };
  const res = Core.runMatch([row], cart, { tolerance: 0 });
  eq('키전용: OK(수량·단가 일치, lineTotal 환산 29,800)', res[0].status, 'OK');
  eq('키전용: 매칭된 카트 행', res[0].item.cartRowId, 'n1');

  // URL도 키도 없으면 INVALID_EXCEL_ROW(기존 정책 유지)
  const bad = Core.runMatch([{ rowId: 'rx', url: '', productKey: '', qty: 2, option: '', basePrice: 100, name: 'x' }], cart, { tolerance: 0 });
  eq('키전용: URL·키 모두 없음 → INVALID', bad[0].issues[0].code, 'INVALID_EXCEL_ROW');

  // 키 불일치 → MISSING
  const miss = Core.runMatch([{ rowId: 'ry', url: '', productKey: '999', qty: 1, option: '', basePrice: 100, name: 'y' }], cart, { tolerance: 0 });
  eq('키전용: 키 불일치 → MISSING', miss[0].issues[0].code, 'MISSING');

  // MISSING 안내문 — URL 없으면 상품 키 줄로 대체
  const msg = Core.buildIssueMessage('MISSING', { teacherName: '홍길동', mallName: '네이버 장바구니', row: row, item: null });
  check('키전용: 안내문에 상품 키 줄', msg.includes('- 상품 키: 10796470805'), msg);
  check('키전용: 안내문에 빈 URL 줄 없음', !msg.includes('- 상품 URL: '), msg);
})();

// ---------- 9. 다른 쇼핑몰 품목 그룹화 ----------
// 엑셀 쇼핑몰 열(캡처 시 규칙 이름)이 지원 몰 이름과 정확히 일치하면 장바구니 링크,
// 아니면 주문서 등 다른 화면에서 온 물품으로 링크 없이 안내한다.
(function testGroupOtherRows() {
  const malls = [
    { id: 'coupang', name: '쿠팡' },
    { id: 'gmarket-cart', name: 'G마켓 장바구니' },
    { id: 'st11-cart', name: '11번가 장바구니' }
  ];
  const otherRows = [
    { mall: '쿠팡' }, { mall: '쿠팡' }, { mall: '쿠팡' },
    { mall: '11번가' }, { mall: '11번가' },
    { mall: 'G마켓 장바구니' },
    { mall: '무신사' },
    { mall: '' }
  ];
  const groups = Core.groupOtherRows(otherRows, malls);
  eq('그룹: 그룹 수', groups.length, 5);

  const coupang = groups.find((g) => g.kind === 'cart' && g.label === '쿠팡');
  check('그룹: 쿠팡 → cart 링크', !!coupang, JSON.stringify(groups));
  eq('그룹: 쿠팡 건수', coupang && coupang.count, 3);
  eq('그룹: 쿠팡 홈페이지 URL', coupang && coupang.homeUrl, 'https://www.coupang.com');

  const st11 = groups.find((g) => g.kind === 'order' && g.label === '11번가');
  check('그룹: 11번가(주문서 규칙명) → 링크 없음', !!st11 && !st11.homeUrl, JSON.stringify(groups));
  eq('그룹: 11번가 건수', st11 && st11.count, 2);

  // 카트 규칙 이름("11번가 장바구니")은 정확 일치 시 링크 대상이 된다
  const gmarket = groups.find((g) => g.kind === 'cart' && g.label === 'G마켓');
  check('그룹: G마켓 장바구니 → cart 링크', !!gmarket && !!gmarket.homeUrl, JSON.stringify(groups));

  const musinsa = groups.find((g) => g.label === '무신사');
  check('그룹: 미지원 몰 → 링크 없음', !!musinsa && musinsa.kind === 'order', JSON.stringify(groups));

  const empty = Core.groupOtherRows([], malls);
  eq('그룹: 빈 목록', empty.length, 0);

  // 같은 라벨은 하나의 그룹으로 합쳐진다(첫 등장 순서 유지)
  const dup = Core.groupOtherRows([{ mall: '쿠팡' }, { mall: '11번가' }, { mall: '쿠팡' }], malls);
  eq('그룹: 동일 라벨 병합', dup.length, 2);
  eq('그룹: 병합 후 쿠팡 건수', dup[0].count, 2);
})();

// ---------- 결과 ----------
console.log('passed: ' + passCount + ', failed: ' + failCount);
if (failCount > 0) {
  failures.forEach((f) => console.log('FAIL: ' + f));
  process.exit(1);
}
console.log('ALL PASS');
