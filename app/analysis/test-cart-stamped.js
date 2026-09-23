// 스탬핑된 캡처(data-arge-checked) 시뮬레이션: 정답 행의 체크박스만 true로 박제했을 때
// 정확히 정답만 추출되는지 검증 — 익스텐션/북마크릿 캡처 경로와 동일한 입력 형태
// usage: node analysis/test-cart-stamped.js
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const cheerio = require('cheerio');
const { parseMhtml, decodeHtml } = require('../src/main/lib/mhtml');
const { extractItems, roundUpToTen, cleanInt } = require('../src/main/lib/extract');

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

// extract.js의 extractField와 동일 규칙 (행 키 계산용)
function field(scope, spec) {
  if (!spec) return null;
  let el = scope;
  if (spec.sel) {
    const m = scope.find(spec.sel);
    if (!m.length) return null;
    el = spec.match === 'last' ? m.last() : m.first();
  }
  let val = spec.attr && spec.attr !== 'text' ? el.attr(spec.attr) : el.text();
  if (val == null) return null;
  val = String(val).trim();
  if (!val) return null;
  if (spec.regex) {
    const mm = new RegExp(spec.regex).exec(val);
    if (!mm) return null;
    val = mm[spec.group != null ? spec.group : 1] || mm[0];
  }
  return val;
}

function rowKey(row, rule) {
  const name = field(row, rule.fields.name);
  const priceStr = field(row, rule.fields.price);
  let qtyStr = field(row, rule.fields.qty);
  if (qtyStr != null && !/[0-9]/.test(qtyStr)) qtyStr = null;
  let qty = qtyStr != null ? cleanInt(qtyStr) : null;
  const price = priceStr != null ? cleanInt(priceStr) : null;
  if (!name || price == null) return null;
  if (qty == null && price != null && rule.qtyFromUnit) {
    const unit = cleanInt(field(row, { sel: rule.qtyFromUnit }) || '');
    if (unit > 0) qty = Math.max(1, Math.round(price / unit));
  }
  const effQty = qty || 1;
  const unitPrice = rule.priceIs === 'lineTotal' && effQty > 1 ? Math.round(price / effQty) : price;
  return `${effQty}x${roundUpToTen(unitPrice)}`;
}

const BASE = path.resolve(__dirname, '..', '..', '장바구니_html');
const CASES = JSON.parse(fs.readFileSync(path.join(__dirname, 'cart-cases.json'), 'utf-8'));

let allPass = true;
const report = [];

for (const c of CASES) {
  const entry = { id: c.id, mall: null, pass: false };
  // 네이버 장바구니는 aria-checked 속성이 그대로 직렬화되므로 스탬핑 대상 아님
  if (c.id === 'cart_03') {
    entry.mall = '네이버 장바구니 (스탬프 불필요 — aria-checked)';
    entry.pass = true;
    entry.detail = { skipped: true };
    report.push(entry);
    continue;
  }
  try {
    const buf = fs.readFileSync(path.join(BASE, c.folder, c.mhtml));
    const parsed = parseMhtml(buf);
    const url = parsed.rootHtml.location || '';
    const rule = matchRule(url);
    if (!rule) throw new Error('규칙 미매칭: ' + url);
    entry.mall = rule.name;

    const wb = XLSX.readFile(path.join(BASE, c.folder, c.xls));
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }).slice(1);
    const ansKeys = rows.filter(r => !/배송비/.test(String(r[0]))).map(r => `${Number(r[3])}x${Number(r[4])}`).sort();
    const ansShip = rows.filter(r => /배송비/.test(String(r[0]))).reduce((s, r) => s + Number(r[4]) * Number(r[3]), 0);

    // 스탬핑 시뮬레이션: 행 키가 정답(수량 일치·단가 ±10원)에 있으면 true, 없으면 false.
    // 사용자 수작성 정답의 10원 단위 반올림 오차는 허용한다.
    const $ = cheerio.load(decodeHtml(parsed.rootHtml));
    const spec = rule.checkedOnly;
    if (!spec) throw new Error('checkedOnly 없음');
    const ansCount = new Map()
    for (const k of ansKeys) ansCount.set(k, (ansCount.get(k) || 0) + 1)
    const ansUsed = new Map()
    const ansMatch = (key) => {
      if (!key) return null
      const [q, p] = key.split('x').map(Number)
      return ansKeys.find(k => {
        const [q2, p2] = k.split('x').map(Number)
        return q2 === q && Math.abs(p2 - p) <= 10
      }) || null
    }
    let stamped = 0;
    $(rule.rowSelector).each((_, el) => {
      const row = $(el);
      const box = row.find(spec.sel).first();
      if (!box.length) return;
      const matched = ansMatch(rowKey(row, rule));
      let ans = false;
      if (matched && (ansUsed.get(matched) || 0) < ansCount.get(matched)) {
        ans = true;
        ansUsed.set(matched, (ansUsed.get(matched) || 0) + 1);
      }
      box.attr('data-arge-checked', ans ? 'true' : 'false');
      stamped++;
    });
    if (!stamped) throw new Error('스탬프 대상 없음');

    const res = extractItems($.html(), rule);
    const extItems = res.items.filter(it => !it.isShipping);
    const extKeys = extItems.map(it => `${it.qty}x${roundUpToTen(it.unitPrice)}`).sort();
    const extShip = (res.shippingFee || 0) + res.items.filter(it => it.isShipping).reduce((s, it) => s + it.unitPrice * it.qty, 0);

    // 다중집합 비교(수량 동일·단가 ±10원 허용) — 남는 키 없이 전부 짝 지어지면 통과
    const remaining = [...ansKeys];
    const unmatched = [];
    for (const k of extKeys) {
      const [q, p] = k.split('x').map(Number);
      const i = remaining.findIndex(rk => {
        const [q2, p2] = rk.split('x').map(Number);
        return q2 === q && Math.abs(p2 - p) <= 10;
      });
      if (i >= 0) remaining.splice(i, 1);
      else unmatched.push(k);
    }
    const keysOk = unmatched.length === 0 && remaining.length === 0;
    const shipOk = extShip === ansShip;
    const noFallback = res.checkedFallback === false;
    entry.pass = keysOk && shipOk && noFallback;
    entry.detail = {
      stampedBoxes: stamped,
      extracted: extKeys, expected: ansKeys,
      shipping: extShip, ansShipping: ansShip,
      checkedFallback: res.checkedFallback
    };
  } catch (e) {
    entry.pass = false;
    entry.detail = { error: String(e.message) };
  }
  if (!entry.pass) allPass = false;
  report.push(entry);
}

fs.writeFileSync(path.join(__dirname, 'test-cart-stamped-result.json'), JSON.stringify(report, null, 2), 'utf-8');
console.log(allPass ? 'ALL PASS' : 'FAIL EXISTS');
for (const r of report) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id} ${r.mall || ''} ${r.pass ? '' : JSON.stringify(r.detail).slice(0, 400)}`);
process.exitCode = allPass ? 0 : 1;
