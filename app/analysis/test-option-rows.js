// v1.49.8 optionRows 합성 테스트 — 체크 시 생기는 형제 옵션 행을 독립 품목으로 추출하는지 검증
const { extractItems } = require('../src/main/lib/extract');

const html = `<!doctype html><html><body><table>
<tr class="item"><td><input type="checkbox" checked></td><td class="nm">마이크로비트 모터구동 KIT</td><td class="qty-box"><input value="2"></td><td class="amt">20,000</td></tr>
<tr class="optrow"><td></td><td class="nm">모터드라이버 확장보드</td><td class="qty-box"><input value="2"></td><td class="amt">20,000</td></tr>
<tr class="item"><td><input type="checkbox" checked></td><td class="nm">USB 디지털 현미경</td><td class="qty-box"><input value="1"></td><td class="amt">50,000</td></tr>
<tr class="optrow"><td></td><td class="nm">교배렌즈 세트</td><td class="qty-box"><input value="3"></td><td class="amt">30,000</td></tr>
<tr class="optrow"><td></td><td class="etc">소프트웨어 라이선스 신청</td><td class="qty-box"><input value="1"></td><td class="amt">5,000</td></tr>
<tr class="item"><td><input type="checkbox"></td><td class="nm">체크 안한 상품</td><td class="qty-box"><input value="1"></td><td class="amt">9,999</td></tr>
</table></body></html>`;

const rule = {
  id: 'opt-test',
  name: '옵션행 테스트',
  match: ['example.com'],
  rowSelector: 'tr.item',
  priceIs: 'lineTotal',
  checkedOnly: { sel: 'input[type=checkbox]' },
  optionRows: { sel: 'tr.optrow' },
  fields: {
    name: { sel: 'td.nm' },
    qty: { sel: '.qty-box input', attr: 'value' },
    price: { sel: 'td.amt', regex: '([\\d,]+)' }
  },
  shipping: { mode: 'none' },
  user: true
};

const { items } = extractItems(html, rule);
console.log('추출:', items.length, '건');
items.forEach(it => console.log(' -', JSON.stringify({ name: it.name, qty: it.qty, unitPrice: it.unitPrice })));

let fail = 0;
function eq(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (ok ? '' : ` actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`));
  if (!ok) fail++;
}
function check(name, cond, detail) {
  const ok = !!cond;
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (ok ? '' : ` :: ${detail}`));
  if (!ok) fail++;
}

eq('품목 수 (상품2 + 옵션3, 체크된 것만)', items.length, 5);
eq('상품1 이름', items[0] && items[0].name, '마이크로비트 모터구동 KIT');
eq('상품1 lineTotal 환산 (20,000÷2)', items[0] && items[0].unitPrice, 10000);
eq('옵션1: 옵션 행의 자체 이름 사용', items[1] && items[1].name, '모터드라이버 확장보드');
eq('옵션1: lineTotal 환산 (20,000÷2)', items[1] && items[1].unitPrice, 10000);
eq('상품2 존재', items[2] && items[2].name, 'USB 디지털 현미경');
eq('옵션2: 자체 이름', items[3] && items[3].name, '교배렌즈 세트');
eq('옵션2: lineTotal 환산 (30,000÷3)', items[3] && items[3].unitPrice, 10000);
check('옵션3: 이름 없는 행 → 상품명 — 옵션내용 폴백', items[4] && /^USB 디지털 현미경 — 소프트웨어 라이선스 신청/.test(items[4].name), items[4] && items[4].name);
eq('옵션3: 금액', items[4] && items[4].unitPrice, 5000);

// optionRows 없는 기존 규칙 회귀 — 옵션 행을 품목으로 만들지 않는다(상품 2건만)
const { items: legacy } = extractItems(html, { ...rule, optionRows: undefined });
console.log('optionRows 없는 규칙 추출:', legacy.length, '건');
eq('회귀: 기존 동작(옵션 행 미추출)', legacy.length, 2);

console.log(fail === 0 ? 'ALL PASS' : `FAIL ${fail}건`);
process.exit(fail ? 1 : 0);
