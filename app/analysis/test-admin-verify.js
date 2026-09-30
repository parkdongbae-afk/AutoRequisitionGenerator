// v1.49.9 verifyRuleSamples 합성 테스트 — 자가 검증 판정(0건 실패·정답 대조·두 종류 실행) 검증
const { verifyRuleSamples } = require('../src/main/lib/admin-verify.js');

const goodHtml = '<table><tr class="i"><td class="n">상품 A</td><td class="q"><input value="2"></td><td class="p">20,000</td></tr></table>';
const badHtml = '<table><tr class="hdr"><td>목록</td></tr></table>';
const samples = [
  { label: '주문서 화면', html: goodHtml }
];
const rule = {
  id: 't', name: 'T', match: ['example.com'], rowSelector: 'tr.i',
  priceIs: 'lineTotal',
  fields: { name: { sel: 'td.n' }, qty: { sel: '.q input', attr: 'value' }, price: { sel: 'td.p', regex: '([\\d,]+)' } },
  shipping: { mode: 'none' }
};
const answer = { mode: 'parsed', items: [{ name: '상품 A', qty: 2, unitPrice: 10000, isShipping: false }] };

let fail = 0;
function eq(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (ok ? '' : ` actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`));
  if (!ok) fail++;
}

// 1. 정확한 규칙 + 단일 종류 + 정답 일치 → ok
let v = verifyRuleSamples(rule, samples, answer, true);
eq('정답 일치 → ok', v.ok, true);
eq('요약에 건수 포함', /주문서 화면 1건\/20,000원/.test(v.summary), true);

// 2. 잘못된 선택자(0건) → 실패 + 0건 문제 지적
v = verifyRuleSamples({ ...rule, rowSelector: 'tr.wrong' }, samples, answer, true);
eq('0건 → 실패', v.ok, false);
check('0건 원인 지적', v.problems.some(p => p.includes('하나도 추출하지 못')), v.problems.join(' | '));

// 3. 건수 불일치(2건 추출 vs 정답 1건) → 실패
const twoRow = goodHtml + '<table><tr class="i"><td class="n">상품 B</td><td class="q"><input value="1"></td><td class="p">5,000</td></tr></table>';
v = verifyRuleSamples(rule, [{ label: '주문서 화면', html: twoRow }], answer, true);
eq('건수 불일치 → 실패', v.ok, false);
check('건수 문제 지적', v.problems.some(p => p.includes('상품 수가 다릅니다')), v.problems.join(' | '));

// 4. 두 종류 동시 생성(expectAnswer=false) → 0건만 실패, 건수 불일치는 통과
v = verifyRuleSamples(rule, [{ label: '주문서 화면', html: twoRow }], answer, false);
eq('두 종류 실행: 0건 아니면 ok', v.ok, true);

// 5. 두 종류 실행에서 0건 → 실패
v = verifyRuleSamples({ ...rule, rowSelector: 'tr.wrong' }, samples, answer, false);
eq('두 종류 실행: 0건 → 실패', v.ok, false);

// 6. 배송비 행은 정답 대조에서 제외된다
const answerWithShip = { mode: 'parsed', items: [...answer.items, { name: '배송비', qty: 1, unitPrice: 3000, isShipping: true }] };
v = verifyRuleSamples(rule, samples, answerWithShip, true);
eq('배송비 행 제외 대조 → ok', v.ok, true);

function check(name, cond, detail) {
  const ok = !!cond;
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (ok ? '' : ` :: ${JSON.stringify(detail)}`));
  if (!ok) fail++;
}

console.log(fail === 0 ? 'ALL PASS' : `FAIL ${fail}건`);
process.exit(fail ? 1 : 0);
