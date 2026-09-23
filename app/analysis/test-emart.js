// e마트몰(SSG.COM) 규칙 검증: 장바구니(mhtml) + 주문서(mhtml)
// 정답 xls는 다른 시점 기준(가격/담기 상태 상이)이라 구조 추출(화면 표시값) 기준으로 검증
// usage: node analysis/test-emart.js
const fs = require('fs');
const path = require('path');
const { parseMhtml, decodeHtml } = require('../src/main/lib/mhtml');
const { extractItems, roundUpToTen } = require('../src/main/lib/extract');

const ROOT = path.resolve(__dirname, '..', '..');
const DIR = path.join(ROOT, '장바구니_html', 'new', 'e마트몰');
const results = [];
function check(name, ok, detail) { results.push({ name, ok, detail }); }

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

// 1. 장바구니 — 2026-09-24 사용자 지정: e마트몰은 주문서에서만 추출. 장바구니 캡처 파일은 폴더에서 제거됨
//    (거부 전용 규칙 emartmall-cart가 URL을 잡아 0건 → store 거부 팝업 '주문서 상태에서 눌러 주세요.')

// 2. 주문서(바나나 주문, 2026-09-24 갱신 — 정답 파일 없음, 구조 추출 검증)
try {
  const parsed = parseMhtml(fs.readFileSync(path.join(DIR, '결제하기, 믿고 사는 즐거움 SSG.COM_주문서.mhtml')));
  const rule = matchRule(parsed.rootHtml.location || '');
  check('주문서 규칙=emartmall', rule && rule.id === 'emartmall', { ruleId: rule && rule.id });
  const res = extractItems(decodeHtml(parsed.rootHtml), rule);
  check('주문서 품목 2건', res.items.length === 2, { items: res.items.map(i => `${i.qty}x${i.unitPrice}`) });
  const names = res.items.map(i => (i.name || '').slice(0, 12));
  check('주문서 바나나 품목', names.every(n => n.includes('바나나')), { names });
  check('주문서 쿠폰 접두사 제거', res.items.every(i => !(i.name || '').startsWith('[')), { names: res.items.map(i => i.name) });
} catch (e) { check('주문서', false, String(e.message)); }

// 3. 정답 파일 참고 — 현재 폴더에는 정답 파일이 없음(사용자가 제거), 파일 존재 시에만 대조
try {
  const XLSX = require('xlsx');
  const dirFiles = fs.readdirSync(DIR);
  const ansFile = dirFiles.find(f => f.includes('품목내역') && f.endsWith('.xlsx')) || dirFiles.find(f => f.includes('품목내역') && f.endsWith('.xls'));
  if (!ansFile) check('정답 파일 없음(주문서 갱신 후 미제공)', true, {});
  else {
    const wb = XLSX.readFile(path.join(DIR, ansFile));
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }).slice(1).filter(r => String(r[0]).trim());
    check('정답 파일 로드(참고용)', rows.length >= 2, { file: ansFile, rows: rows.length });
  }
} catch (e) { check('정답 파일', false, String(e.message)); }

fs.writeFileSync(path.join(__dirname, 'test-emart-result.json'), JSON.stringify(results, null, 2), 'utf-8');
const fail = results.filter(r => !r.ok);
console.log(fail.length === 0 ? 'ALL PASS' : `FAIL ${fail.length}/${results.length}`);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name} ${r.ok ? '' : JSON.stringify(r.detail).slice(0, 300)}`);
process.exitCode = fail.length ? 1 : 0;
