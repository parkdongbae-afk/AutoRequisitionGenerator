// 장바구니 13몰 캡처 → 규칙 추출 → 정답 xls 대조
// usage: node analysis/test-cart-rules.js
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { parseMhtml, decodeHtml } = require('../src/main/lib/mhtml');
const { extractItems, roundUpToTen } = require('../src/main/lib/extract');

// rules.js는 electron을 import하므로 소스에서 import 매핑과 builtin 순서를 파싱해 재현
function loadBuiltin() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'lib', 'rules.js'), 'utf-8');
  const fileByVar = new Map();
  for (const m of src.matchAll(/import\s+(\w+)\s+from\s+'\.\/rules\/([^']+)'/g)) fileByVar.set(m[1], m[2]);
  const arrMatch = src.match(/const builtin = \[([\s\S]*?)\]/);
  if (!arrMatch) throw new Error('builtin 배열 파싱 실패');
  return arrMatch[1].split(',').map(s => s.trim()).filter(Boolean).map(v => {
    const f = fileByVar.get(v);
    if (!f) throw new Error('builtin 변수 매핑 없음: ' + v);
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'lib', 'rules', f), 'utf-8'));
  });
}
const builtin = loadBuiltin();

const BASE = path.resolve(__dirname, '..', '..', '장바구니_html');
const FILTERABLE = new Set(['cart_01', 'cart_02', 'cart_03', 'cart_04', 'cart_05', 'cart_10', 'cart_13']);
// 캡처 시점엔 체크되어 있었으나 사용자 정답에서 제외된 항목(수량+올림단가 키)
const KNOWN_EXTRAS = {
  cart_01: ['1x32400'],
  cart_05: ['1x69900']
};
const CASES = JSON.parse(fs.readFileSync(path.join(__dirname, 'cart-cases.json'), 'utf-8'));

function matchRule(url) {
  for (const r of builtin) for (const pat of r.match || []) if (url && url.includes(pat)) return r;
  return null;
}

const report = [];
let allPass = true;

for (const c of CASES) {
  const entry = { id: c.id, mall: null, pass: false, detail: [] };
  try {
    const buf = fs.readFileSync(path.join(BASE, c.folder, c.mhtml));
    const parsed = parseMhtml(buf);
    const url = parsed.rootHtml.location || '';
    const html = decodeHtml(parsed.rootHtml);
    const rule = matchRule(url);
    if (!rule) throw new Error('규칙 미매칭: ' + url);
    entry.mall = rule.name + ' (' + rule.id + ')';
    const res = extractItems(html, rule);

    // 정답 파일은 사용자 갱신본이 .xlsx로 저장되어 있을 수 있다(xlsx만 저장되는 환경) — 폴백 탐색
    const ansPath = path.join(BASE, c.folder, c.xls);
    const ansFile = fs.existsSync(ansPath) ? ansPath : ansPath.replace(/\.xls$/i, '.xlsx');
    const wb = XLSX.readFile(ansFile);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }).slice(1);
    const ansItems = rows.filter(r => !/배송비/.test(String(r[0]))).map(r => ({ name: String(r[0]), qty: Number(r[3]), price: Number(r[4]) }));
    const ansShipTotal = rows.filter(r => /배송비/.test(String(r[0]))).reduce((s, r) => s + Number(r[4]) * Number(r[3]), 0);

    const extItems = res.items.filter(it => !it.isShipping);
    const extShipTotal = (res.shippingFee || 0) + res.items.filter(it => it.isShipping).reduce((s, it) => s + it.unitPrice * it.qty, 0);

    // 정답 항목 매칭: (수량, 올림단가) 키 — 사용자 수작성 정답의 10원 단위 반올림 오차 허용
    const pool = extItems.map(it => ({ qty: it.qty, price: roundUpToTen(it.unitPrice), name: it.name, used: false }));
    const missing = [];
    for (const a of ansItems) {
      const hit = pool.find(p => !p.used && p.qty === a.qty && Math.abs(p.price - a.price) <= 10);
      if (hit) hit.used = true;
      else missing.push(a);
    }
    const known = new Set(KNOWN_EXTRAS[c.id] || []);
    const extras = pool.filter(p => !p.used && !known.has(`${p.qty}x${p.price}`));

    const shipOk = extShipTotal === ansShipTotal;
    const itemsOk = missing.length === 0 && (FILTERABLE.has(c.id) ? extras.length === 0 : true);
    entry.pass = itemsOk && shipOk;
    entry.detail = {
      items: extItems.map(it => `${it.qty}x${roundUpToTen(it.unitPrice)} ${it.name.slice(0, 34)}`),
      shipping: extShipTotal,
      ansShipping: ansShipTotal,
      missing: missing.map(a => `${a.qty}x${a.price} ${a.name.slice(0, 30)}`),
      extras: extras.map(p => `${p.qty}x${p.price} ${p.name.slice(0, 30)}`)
    };
  } catch (e) {
    entry.pass = false;
    entry.detail = { error: String(e.message) };
  }
  if (!entry.pass) allPass = false;
  report.push(entry);
}

fs.writeFileSync(path.join(__dirname, 'test-cart-rules-result.json'), JSON.stringify(report, null, 2), 'utf-8');
console.log(allPass ? 'ALL PASS' : 'FAIL EXISTS');
for (const r of report) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id} ${r.mall || ''} ${r.pass ? '' : JSON.stringify(r.detail).slice(0, 400)}`);
process.exitCode = allPass ? 0 : 1;
