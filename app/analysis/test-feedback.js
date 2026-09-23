// 피드백 수정 검증: 드림디포 주문서 규칙, G마켓 배송비, 알파몰 실측 배송비, checkedScope
// usage: node analysis/test-feedback.js
const fs = require('fs');
const path = require('path');
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
  const res = extractItems(decodeHtml(parsed.rootHtml), rule);
  return { url, ruleId: rule.id, res };
}

// 1. 드림디포 주문서: 페이지 자체 총액(상품 49,200 + 배송비 3,000 = 52,200)으로 검증
try {
  const { url, ruleId, res } = extract('shoping_cart/드림디포 쇼핑몰 _ 사는 곳은 달라도 문구는 드림디포!.mhtml');
  const items = res.items.map(it => `${it.qty}x${roundUpToTen(it.unitPrice)}`).sort();
  const sub = res.items.reduce((s, it) => s + it.unitPrice * it.qty, 0);
  check('드림디포 주문서 규칙', ruleId === 'dreamdepot-order', { url, ruleId });
  check('드림디포 주문서 품목', JSON.stringify(items) === JSON.stringify(['1x38000', '2x5600']), { items });
  check('드림디포 주문서 상품합계=49,200', sub === 49200, { sub });
  check('드림디포 주문서 배송비=3,000', res.shippingFee === 3000, { shipping: res.shippingFee });
} catch (e) { check('드림디포 주문서', false, String(e.message)); }

// 2. G마켓 장바구니: 배송비(전 그룹 무료 → 행 없음) + 기존 품목 유지
try {
  const { ruleId, res } = extract('장바구니_html/v_check_not_ok/G마켓 - 장바구니.mhtml');
  const items = res.items.map(it => `${it.qty}x${roundUpToTen(it.unitPrice)}`);
  check('G마켓 카트 규칙 유지', ruleId === 'gmarket-cart', { ruleId });
  check('G마켓 카트 무료배송 → 배송비 행 없음', !res.shippingFee, { shipping: res.shippingFee });
  check('G마켓 카트 품목 3건(수동 폴백)', items.length === 3, { items });
} catch (e) { check('G마켓 카트', false, String(e.message)); }

// 3. 알파몰 주문서: 페이지 표시 배송비 3,000원
try {
  const { ruleId, res } = extract('shoping_cart/알파몰-배송지선택.mhtml');
  check('알파몰 주문서 배송비=3,000(페이지 실측)', res.shippingFee === 3000, { shipping: res.shippingFee, ruleId });
  check('알파몰 주문서 품목 2건', res.items.length === 2, {});
} catch (e) { check('알파몰 주문서', false, String(e.message)); }

// 4. checkedScope 단위 테스트(합성 G마켓형 문서): 미체크 그룹 배송비 제외
try {
  const g = (checked, fee, stamp) => `
  <div class="cart--basket">
    <div class="item"><input type="checkbox" class="input__checkbox" ${stamp ? `data-arge-checked="${stamp}"` : (checked ? 'checked' : '')}>
      <span class="item_name">상품${fee}</span><div class="item_price"><strong class="text__value">10,000</strong></div></div>
    <div class="shipping--info"><div class="delivery">
      <span class="text">배송비</span><strong class="text__value">${fee === 0 ? '무료배송' : fee.toLocaleString() + '원'}</strong>
    </div></div>
  </div>`;
  const rule = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'lib', 'rules', 'gmarket-cart.json'), 'utf-8'));
  const stampedHtml = `<html><body>${g(true, 3000, 'true')}${g(false, 4000, 'false')}</body></html>`;
  const r1 = extractItems(stampedHtml, rule);
  check('checkedScope: 미체크 그룹 배송비 제외(스탬프)', r1.shippingFee === 3000, { shipping: r1.shippingFee, items: r1.items.length });
  const manualHtml = `<html><body>${g(true, 3000, null)}${g(false, 0, null)}</body></html>`;
  const r2 = extractItems(manualHtml, rule);
  check('checkedScope: 수동 저장(속성) 그룹 배송비 3,000', r2.shippingFee === 3000, { shipping: r2.shippingFee });
  const allFree = extractItems(`<html><body>${g(true, 0, 'true')}</body></html>`, rule);
  check('checkedScope: 전 그룹 무료 → 배송비 null', !allFree.shippingFee, { shipping: allFree.shippingFee });
} catch (e) { check('checkedScope 단위', false, String(e.message)); }

// 5. 드림디포 카트 회귀: 기존 카트 파일은 여전히 dreamdepot(카트) 규칙
try {
  const { ruleId, res } = extract('장바구니_html/v_check_not_ok/드림디포 쇼핑몰 _ 사는 곳은 달라도 문구는 드림디포!.mhtml');
  const items = res.items.map(it => `${it.qty}x${roundUpToTen(it.unitPrice)}`).sort();
  check('드림디포 카트 규칙 유지', ruleId === 'dreamdepot', { ruleId, items, shipping: res.shippingFee });
  check('드림디포 카트 배송비=3,000', res.shippingFee === 3000, { shipping: res.shippingFee });
} catch (e) { check('드림디포 카트 회귀', false, String(e.message)); }

// 6~8. 신규 주문서 3종 정답 대조 (shoping_cart의 정답 xls)
const XLSX = require('xlsx');
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
compareAnswer('다이소 주문서', 'shoping_cart/택배배송 주문하기 _ 다이소몰.mhtml', 'shoping_cart/택배배송 주문하기 _ 다이소몰_품목내역(통합).xls', 'daisomall-order');
compareAnswer('알라딘 주문서', 'shoping_cart/배송정보 입력 _ 알라딘.mhtml', 'shoping_cart/배송정보 입력 _ 알라딘_품목내역(통합).xls', 'aladin-order');
compareAnswer('오피스디포 주문서', 'shoping_cart/오피스디포 공식쇼핑몰.mhtml', 'shoping_cart/오피스디포 공식쇼핑몰_품목내역(통합).xls', 'officedepot-order');

fs.writeFileSync(path.join(__dirname, 'test-feedback-result.json'), JSON.stringify(results, null, 2), 'utf-8');
const fail = results.filter(r => !r.ok);
console.log(fail.length === 0 ? 'ALL PASS' : `FAIL ${fail.length}/${results.length}`);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name} ${r.ok ? '' : JSON.stringify(r.detail).slice(0, 300)}`);
process.exitCode = fail.length ? 1 : 0;
