// 4건 버그 수정 검증: 11st 수량/단가, 아이스크림 V체크 폴백, 티처몰 장바구니 신규, 다이소 수량 뷰어 주입
// + G마켓/네이버 새 캡처 배송비 회귀
// usage: node analysis/test-cart-fix.js
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { parseMhtml, decodeHtml } = require('../src/main/lib/mhtml');
const { extractItems, roundUpToTen } = require('../src/main/lib/extract');

function loadBuiltin() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'lib', 'rules.js'), 'utf-8');
  const fileByVar = new Map();
  for (const m of src.matchAll(/import\s+(\w+)\s+from\s+'\.\/rules\/([^']+)'/g)) fileByVar.set(m[1], m[2]);
  const arrMatch = src.match(/const builtin = \[([\s\S]*?)\]/);
  return arrMatch[1].split(',').map(s => s.trim()).filter(Boolean)
    .map(v => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'lib', 'rules', fileByVar.get(v)), 'utf-8')));
}
const builtin = loadBuiltin();
function matchRule(url) {
  for (const r of builtin) for (const pat of r.match || []) if (url && url.includes(pat)) return r;
  return null;
}

const ROOT = path.resolve(__dirname, '..', '..');
const results = [];
function check(name, ok, detail) { results.push({ name, ok, detail }); }

function extract(rel) {
  const parsed = parseMhtml(fs.readFileSync(path.join(ROOT, rel)));
  const url = parsed.rootHtml.location || '';
  const rule = matchRule(url);
  if (!rule) return { url, ruleId: null, res: {} };
  const res = extractItems(decodeHtml(parsed.rootHtml), rule);
  return { url, ruleId: rule.id, res };
}

function compareAnswer(name, mhtmlRel, xlsRel, expectRuleId) {
  try {
    const { ruleId, res } = extract(mhtmlRel);
    const wb = XLSX.readFile(path.join(ROOT, xlsRel));
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }).slice(1).filter(r => String(r[0]).trim());
    const ansItems = rows.filter(r => !/배송비/.test(String(r[0]))).map(r => ({ qty: Number(r[3]), price: Number(r[4]) }));
    const ansShip = rows.filter(r => /배송비/.test(String(r[0]))).reduce((s, r) => s + Number(r[4]) * Number(r[3]), 0);
    const pool = res.items.map(it => ({ qty: it.qty, price: roundUpToTen(it.unitPrice), used: false }));
    const missing = [];
    for (const a of ansItems) {
      const hit = pool.find(p => !p.used && p.qty === a.qty && Math.abs(p.price - a.price) <= 10);
      if (hit) hit.used = true; else missing.push(a);
    }
    const extras = pool.filter(p => !p.used);
    const extShip = (res.shippingFee || 0) + res.items.filter(it => it.isShipping).reduce((s, it) => s + it.unitPrice * it.qty, 0);
    check(`${name} 규칙=${expectRuleId}`, ruleId === expectRuleId, { ruleId });
    check(`${name} 품목 정답 일치`, missing.length === 0 && extras.length === 0, {
      extracted: pool.map(p => `${p.qty}x${p.price}`), missing, extras
    });
    check(`${name} 배송비 정답 일치`, extShip === ansShip, { extShip, ansShip });
  } catch (e) { check(name, false, String(e.message)); }
}

// 1. 티처몰 장바구니(신규 규칙): V체크 2건 + 그룹 배송비 6,000
compareAnswer('티처몰 장바구니', '장바구니_html/new/티처몰 _ 학급경영의 필수 파트너.mhtml', '장바구니_html/new/티처몰 _ 학급경영의 필수 파트너_품목내역(통합).xls', 'teachermall-cart');

// 2. 아이스크림 장바구니: 수동 저장 문서는 상태 소실 → 전체 추출 폴백이 맞는 동작
try {
  const { ruleId, res } = extract('장바구니_html/v_check_not_ok/아이스크림 _ 아이스크림몰.mhtml');
  check('아이스크림 규칙 유지', ruleId === 'icecream-cart', { ruleId });
  check('아이스크림 폴백 인지(안내 팝업 트리거)', res.checkedFallback === true, { checkedFallback: res.checkedFallback });
  check('아이스크림 전체 추출 4건', res.items.length === 4, { items: res.items.map(i => `${i.qty}x${roundUpToTen(i.unitPrice)}`) });
} catch (e) { check('아이스크림', false, String(e.message)); }

// 3. 다이소 장바구니: 추출 정답 일치 + 수량이 뷰 html에 value 속성으로 주입되어야 함
compareAnswer('다이소 장바구니', '장바구니_html/v_check_not_ok/택배배송 장바구니 _ 다이소몰.mhtml', '장바구니_html/v_check_not_ok/택배배송 장바구니 _ 다이소몰_품목내역(통합).xls', 'daisomall');
try {
  const { res } = extract('장바구니_html/v_check_not_ok/택배배송 장바구니 _ 다이소몰.mhtml');
  const html = res.html || '';
  check('다이소 뷰 수량 주입(value=3, value=2)', html.includes('value="3"') && html.includes('value="2"'), {
    v3: html.includes('value="3"'), v2: html.includes('value="2"'), htmlLen: html.length
  });
  check('다이소 주입 html에 doctype 유지', /^\s*<!doctype/i.test(html) || /<html/i.test(html), { head: html.slice(0, 60) });
} catch (e) { check('다이소 뷰 주입', false, String(e.message)); }

// 4. 11번가 주문서: 수량 추출 + 총액→단가 환산 (봉투 10개, Lenovo 1개)
//    rowSelector가 li.group_prd(판매자 그룹) → div.c_order_prd_row(상품 블록)로 변경 —
//    그룹 내 상품 2개 이상일 때 첫 상품만 추출되던 문제 수정
try {
  const { ruleId, res } = extract('shoping_cart/주문_결제 - 11번가.mhtml');
  const items = res.items.map(it => `${it.qty}x${roundUpToTen(it.unitPrice)}`).sort();
  check('11st 규칙 유지', ruleId === '11st', { ruleId });
  check('11st 수량/단가', JSON.stringify(items) === JSON.stringify(['10x1060', '1x1324000']), { items });
  check('11st 배송비 3,500', res.shippingFee === 3500, { shipping: res.shippingFee });
} catch (e) { check('11st', false, String(e.message)); }

// 4-1. 11번가 주문서 그룹 내 복수 상품: 한 판매자 그룹에 상품 2개면 둘 다 추출되어야 함
//      (실측 구조: li.group_prd > ul > li > div.c_order_prd_row × N)
try {
  const cheerio = require('cheerio');
  const parsed = parseMhtml(fs.readFileSync(path.join(ROOT, 'shoping_cart', '주문_결제 - 11번가.mhtml')));
  const html = decodeHtml(parsed.rootHtml);
  const $ = cheerio.load(html);
  const rule11 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'lib', 'rules', '11st.json'), 'utf-8'));
  const row = $('div.c_order_prd_row').first();
  const clone = row.clone();
  clone.find('.prd_name a').text('테스트 상품 B');
  clone.find('.c_order_quantity .number').text('2');
  clone.find('.c_order_prd_price').text('할인모음가 5,000원');
  row.after(clone);
  const res2 = extractItems($.html(), rule11);
  const items2 = res2.items.map(it => `${it.qty}x${roundUpToTen(it.unitPrice)}`).sort();
  check('11st 주문서 그룹 내 복수 상품', res2.items.length === 3 && JSON.stringify(items2) === JSON.stringify(['10x1060', '1x1324000', '2x2500']), { items: items2 });
} catch (e) { check('11st 복수 상품', false, String(e.message)); }

// 4-2. 11번가 장바구니 체크박스 prefix: bcktSeq_B_1 등 그룹 내 2번째 상품도 체크 판정되어야 함
try {
  const rule = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'lib', 'rules', 'st11-cart.json'), 'utf-8'));
  const cartRow = (name, stamp) => `<html><body><li id="bunchPrdWrap_x_${name}">
    <input type="checkbox" name="${name}" ${stamp ? 'data-arge-checked="true"' : 'data-arge-checked="false"'}>
    <div class="prd_name"><a>상품 ${name}</a></div>
    <button title="수량변경">2개</button>
    <div class="total_price"><span class="number">10,000</span></div>
    <div class="c-order-delivery__price"><span class="number">2,500</span></div>
  </li></body></html>`;
  const twoRows = `<html><body>${cartRow('bcktSeq_B_0', true)}${cartRow('bcktSeq_B_1', true)}</body></html>`;
  const r2 = extractItems(twoRows, rule);
  const prods = r2.items.filter(i => !i.isShipping);
  const ships = r2.items.filter(i => i.isShipping);
  check('11st 장바구니 그룹 내 복수 상품(prefix 체크)', prods.length === 2 && ships.length === 2, { prods: prods.map(i => i.name), ships: ships.length });
} catch (e) { check('11st 장바구니 prefix', false, String(e.message)); }

// 5. G마켓 장바구니(신규 캡처, 2026-09-23 사용자 갱신본): 확장 캡처(saveAsMHTML, 스탬프 존재).
//    체크 상태는 볼링 3개·깃털 1개(행 2개). 2026-09-23 사용자 교정 2차: 한 행 안에 옵션 라인이
//    여러 개면(dl.unit--item 복수) 각 라인이 독립 품목 — 깃털 행은 천연깃털 1개@3,990 +
//    날개깃털 1개@1,990 2유닛이라 3건으로 분리 추출된다. 정답 4품목(바구니·멀티바스켓1호·2호·방석)은
//    이 캡처에서 미체크(stamp false) 행이라 제외되는 것이 맞고, 계산기 '상품수 4개'와 추출 3건의
//    차이는 부분저장 경고(expected 4 / actual 3)로 표시된다.
try {
  const { ruleId, res } = extract('장바구니_html/new/G마켓 - 장바구니.mhtml');
  const items = res.items.filter(i => !i.isShipping).map(it => `${it.qty}x${roundUpToTen(it.unitPrice)}`).sort();
  check('G마켓 신규 규칙 유지', ruleId === 'gmarket-cart', { ruleId });
  check('G마켓 신규 품목 3건(유닛 분리)', JSON.stringify(items) === JSON.stringify(['1x1990', '1x3990', '3x78000']), { items });
  check('G마켓 신규 배송비 6,000(개별 3,000×2 행)', res.shippingFee == null && res.items.filter(i => i.isShipping).length === 2 && res.items.filter(i => i.isShipping).every(i => i.unitPrice === 3000 && i.qty === 1), { ship: res.items.filter(i => i.isShipping).map(i => `${i.qty}x${i.unitPrice}`), shippingFee: res.shippingFee });
  check('G마켓 신규 감지 제거(카운터 불일치 무경고)', res.countMismatch == null, { countMismatch: res.countMismatch });
} catch (e) { check('G마켓 신규 캡처', false, String(e.message)); }

// 5-1. G마켓 할인 행 단위 테스트: item_price strong 2개(원가 60,000 취소선 + 할인가 55,200)
//      → match:last로 55,200 채택(수량 10 → 단가 5,520, 정답 xls와 동일). 무할인 행은 strong 1개.
try {
  const rule = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'lib', 'rules', 'gmarket-cart.json'), 'utf-8'));
  const row = (stamped) => `<html><body><div class="item">
    <div class="item_check"><input type="checkbox" class="input__checkbox" ${stamped ? 'data-arge-checked="true"' : 'checked'}></div>
    <span class="item_name">플라스틱 바구니 바스켓 소쿠리</span>
    <input class="item_qty_count" type="number" value="10">
    <div class="item_price"><strong class="for_a11y">상품 금액 : </strong>
      <span class="format-price" role="deletion"><span class="box__format-amount"><strong class="text__value">60,000</strong><span class="text__unit">원</span></span></span>
      <span class="box__sale-amount" role="insertion"><strong class="text__value">55,200</strong><span class="text__unit">원</span></span>
    </div></div></body></html>`;
  const rStamped = extractItems(row(true), rule);
  check('G마켓 할인행 match:last(스탬프)', rStamped.items.length === 1 && roundUpToTen(rStamped.items[0].unitPrice) === 5520, { items: rStamped.items.map(i => `${i.qty}x${i.unitPrice}`) });
  const rManual = extractItems(row(false), rule);
  check('G마켓 할인행 match:last(수동 checked 속성)', rManual.items.length === 1 && roundUpToTen(rManual.items[0].unitPrice) === 5520, { items: rManual.items.map(i => `${i.qty}x${i.unitPrice}`) });
} catch (e) { check('G마켓 할인행 단위', false, String(e.message)); }

// 5-2. G마켓 복수 유닛 행 단위 테스트: 한 행에 옵션 라인 2개(멀티바스켓 1호·2호 각 5개, 8,280원)
//      → 유닛별로 2품목 분리(단가 8,280÷5=1,656→1,660, 규격은 가격 접미사 제거), 미체크 행은 폴백 전체 추출
try {
  const rule = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'lib', 'rules', 'gmarket-cart.json'), 'utf-8'));
  const unitRow = (stamp) => `<html><body><div class="item">
    <div class="item_check"><span class="input_custom"><input type="checkbox" class="input__checkbox" ${stamp ? 'data-arge-checked="true"' : ''}></span></div>
    <span class="item_name">플라스틱 정리함 수납함 바구니 바스켓 소쿠리 적층 문구상자</span>
    <dl class="unit--item"><dd class="unit--item_desc">
      <span class="option_value">멀티바스켓(1호) (-1,700원)</span>
      <input class="item_qty_count" type="number" value="5">
      <div class="item_price"><strong class="text__value">9,000</strong><strong class="text__value">8,280</strong></div>
    </dd></dl>
    <dl class="unit--item"><dd class="unit--item_desc">
      <span class="option_value">멀티바스켓(2호) (-1,700원)</span>
      <input class="item_qty_count" type="number" value="5">
      <div class="item_price"><strong class="text__value">9,000</strong><strong class="text__value">8,280</strong></div>
    </dd></dl>
  </div></body></html>`;
  const rStamped = extractItems(unitRow(true), rule);
  check('G마켓 복수 유닛 분리(스탬프 true → 2품목)', rStamped.items.length === 2
    && rStamped.items.every(i => i.qty === 5 && roundUpToTen(i.unitPrice) === 1660)
    && rStamped.items[0].option === '멀티바스켓(1호)' && rStamped.items[1].option === '멀티바스켓(2호)', { items: rStamped.items });
  const rFallback = extractItems(unitRow(''), rule);
  check('G마켓 복수 유닛 폴백(상태 없음 → 2품목 전체 추출)', rFallback.checkedFallback === true && rFallback.items.length === 2, { items: rFallback.items.length, fb: rFallback.checkedFallback });
} catch (e) { check('G마켓 복수 유닛 단위', false, String(e.message)); }

// 6. G마켓 장바구니(구 캡처 회귀): 전 그룹 무료 → 배송비 없음 + 품목 3건
try {
  const { ruleId, res } = extract('장바구니_html/v_check_not_ok/G마켓 - 장바구니.mhtml');
  check('G마켓 구 캡처 배송비 없음', !res.shippingFee, { shipping: res.shippingFee });
  check('G마켓 구 캡처 품목 3건', res.items.length === 3, { items: res.items.length });
} catch (e) { check('G마켓 구 캡처', false, String(e.message)); }

// 7. 네이버 장바구니(새 캡처): 확장 캡처 전제 — 부분저장 파일(체크 6건 중 4카드 저장)로
//    verifyCount 감지 6→4, 추가상품 없는 카드 4건 추출
try {
  const { ruleId, res } = extract('장바구니_html/new/장바구니-네이버.mhtml');
  check('네이버 카트 규칙 유지', ruleId === 'naver-cart', { ruleId });
  check('네이버 카트 배송비 6,000', res.shippingFee === 6000, { shipping: res.shippingFee });
  check('네이버 카트 품목 4건(저장분)', res.items.length === 4, { items: res.items.length });
  check('네이버 카트 부분저장 감지 6→4', res.countMismatch && res.countMismatch.expected === 6 && res.countMismatch.actual === 4, { countMismatch: res.countMismatch });
} catch (e) { check('네이버 새 캡처', false, String(e.message)); }

// 7-1. 네이버 장바구니 추가상품 라인 분리(2026-09-24 사용자 캡처, v_check_ok):
//      남성 특대형 고무장갑 카드 = 본품(마미손질긴 L 1@23,900) + 추가상품(블랙 290mm 1@45,000)
//      units(div[class^=product_item--])로 라인별 분리 — 정답 5품목 + 설거지(정답 미포함 카드) = 6건.
//      verifyCount(카운터 5=카드 수)는 행 수 기준 비교로 경고 미발동.
try {
  const { ruleId, res } = extract('장바구니_html/v_check_ok/장바구니_네이버.mhtml');
  const items = res.items.map(it => `${it.qty}x${roundUpToTen(it.unitPrice)}`).sort();
  const opts = res.items.map(it => it.option || '').sort();
  check('네이버 추가상품 규칙 유지', ruleId === 'naver-cart', { ruleId });
  check('네이버 추가상품 6건(라인 분리)', JSON.stringify(items) === JSON.stringify(['1x12000', '1x23900', '1x45000', '2x1590', '3x21300', '3x9500'].sort()), { items });
  check('네이버 추가상품 옵션 접두사 제거', opts.includes('마미손질긴 L (5켤레)') && opts.includes('블랙 290mm'), { opts });
  check('네이버 추가상품 부분저장 감지 없음(카운터 5=카드 수)', !res.countMismatch, { countMismatch: res.countMismatch || null });
  check('네이버 추가상품 배송비 3,000', res.shippingFee === 3000, { shipping: res.shippingFee });
} catch (e) { check('네이버 추가상품', false, String(e.message)); }

// 8. 네이버 구 캡처 회귀 체크는 7-1(같은 경로를 사용자가 갱신)로 통합 대체

// 9. 엑셀 배송비 금액별 유지: 3000원×3 + 2500원×2 → 한 줄 합산(5500×5 등) 금지,
//    '배송비 3@3000' + '배송비 2@2500' 두 행으로 저장되어야 함
try {
  const excel = require('../src/main/lib/excel');
  const tmp = path.join(__dirname, 'tmp-ship-test.xls');
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  excel.createNewWorkbook(tmp);
  const shipRows = [
    { name: '상품1', spec: '', unit: '개', qty: 1, price: 1000 },
    { name: '상품1 배송비', unit: '식', qty: 1, price: 3000, isShipping: true },
    { name: '상품2 배송비', unit: '식', qty: 1, price: 3000, isShipping: true },
    { name: '상품3 배송비', unit: '식', qty: 1, price: 3000, isShipping: true },
    { name: '상품4 배송비', unit: '식', qty: 1, price: 2500, isShipping: true },
    { name: '상품5 배송비', unit: '식', qty: 1, price: 2500, isShipping: true }
  ];
  excel.appendRows(tmp, shipRows);
  const after = excel.readExcelRows(tmp);
  const feeRows = after.rows.filter(r => /배송비/.test(String(r[0])));
  const norm = feeRows.map(r => `${Number(r[4])}x${Number(r[3])}`).sort();
  const ok = feeRows.length === 2 && JSON.stringify(norm) === JSON.stringify(['2500x2', '3000x3']);
  check('엑셀 배송비 금액별 유지(3000×3+2500×2)', ok, { feeRows });
  fs.unlinkSync(tmp);
} catch (e) { check('엑셀 배송비 금액별 유지', false, String(e.message)); }

fs.writeFileSync(path.join(__dirname, 'test-cart-fix-result.json'), JSON.stringify(results, null, 2), 'utf-8');
const fail = results.filter(r => !r.ok);
console.log(fail.length === 0 ? 'ALL PASS' : `FAIL ${fail.length}/${results.length}`);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name} ${r.ok ? '' : JSON.stringify(r.detail).slice(0, 300)}`);
process.exitCode = fail.length ? 1 : 0;
