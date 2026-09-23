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
try {
  const { ruleId, res } = extract('shoping_cart/주문_결제 - 11번가.mhtml');
  const items = res.items.map(it => `${it.qty}x${roundUpToTen(it.unitPrice)}`).sort();
  check('11st 규칙 유지', ruleId === '11st', { ruleId });
  check('11st 수량/단가', JSON.stringify(items) === JSON.stringify(['10x1060', '1x1324000']), { items });
  check('11st 배송비 3,500', res.shippingFee === 3500, { shipping: res.shippingFee });
} catch (e) { check('11st', false, String(e.message)); }

// 5. G마켓 장바구니(새 캡처): 그룹 footer 배송비 4그룹 = 12,000
try {
  const { ruleId, res } = extract('장바구니_html/new/G마켓 - 장바구니.mhtml');
  check('G마켓 카트 규칙 유지', ruleId === 'gmarket-cart', { ruleId });
  check('G마켓 카트 배송비 12,000', res.shippingFee === 12000, { shipping: res.shippingFee });
  check('G마켓 카트 품목 4건', res.items.length === 4, { items: res.items.map(i => `${i.qty}x${roundUpToTen(i.unitPrice)}`) });
} catch (e) { check('G마켓 새 캡처', false, String(e.message)); }

// 6. G마켓 장바구니(구 캡처 회귀): 전 그룹 무료 → 배송비 없음 + 품목 3건
try {
  const { ruleId, res } = extract('장바구니_html/v_check_not_ok/G마켓 - 장바구니.mhtml');
  check('G마켓 구 캡처 배송비 없음', !res.shippingFee, { shipping: res.shippingFee });
  check('G마켓 구 캡처 품목 3건', res.items.length === 3, { items: res.items.length });
} catch (e) { check('G마켓 구 캡처', false, String(e.message)); }

// 7. 네이버 장바구니(새 캡처): 예상금액 패널 '총 배송비 +3,000원' 채택
try {
  const { ruleId, res } = extract('장바구니_html/new/장바구니_네이버.mhtml');
  check('네이버 카트 규칙 유지', ruleId === 'naver-cart', { ruleId });
  check('네이버 카트 배송비 3,000', res.shippingFee === 3000, { shipping: res.shippingFee });
  check('네이버 카트 품목 3건', res.items.length === 3, { items: res.items.length });
} catch (e) { check('네이버 새 캡처', false, String(e.message)); }

// 8. 네이버 장바구니(구 캡처 회귀): 배송비 행 없음
try {
  const { ruleId, res } = extract('장바구니_html/v_check_ok/장바구니_네이버.mhtml');
  check('네이버 구 캡처 배송비 없음', !res.shippingFee, { shipping: res.shippingFee });
  check('네이버 구 캡처 품목 2건', res.items.length === 2, { items: res.items.length });
} catch (e) { check('네이버 구 캡처', false, String(e.message)); }

fs.writeFileSync(path.join(__dirname, 'test-cart-fix-result.json'), JSON.stringify(results, null, 2), 'utf-8');
const fail = results.filter(r => !r.ok);
console.log(fail.length === 0 ? 'ALL PASS' : `FAIL ${fail.length}/${results.length}`);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name} ${r.ok ? '' : JSON.stringify(r.detail).slice(0, 300)}`);
process.exitCode = fail.length ? 1 : 0;
