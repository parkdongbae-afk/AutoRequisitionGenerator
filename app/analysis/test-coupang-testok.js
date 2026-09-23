const fs = require('fs');
const path = require('path');
const { parseMhtml, decodeHtml } = require('../src/main/lib/mhtml');
const cheerio = require('cheerio');
const XLSX = require('xlsx');

const src = 'C:\\Users\\dongbae\\Desktop\\Automatic_generation_of_approval_requests_html\\test_OK\\new';
const outDir = path.join(__dirname, 'decoded-testok');
fs.mkdirSync(outDir, { recursive: true });

for (const f of fs.readdirSync(src)) {
  if (!/\.mhtml$/i.test(f)) continue;
  const { rootHtml } = parseMhtml(fs.readFileSync(path.join(src, f)));
  const html = decodeHtml(rootHtml);
  const safe = 'coupang-testok.html';
  fs.writeFileSync(path.join(outDir, safe), html, 'utf8');
  console.log('decoded:', f, '->', safe, '| loc=', rootHtml.location.slice(0, 70));
}

const $ = cheerio.load(fs.readFileSync(path.join(outDir, 'coupang-testok.html'), 'utf8'));
console.log('\n=== items with checkbox state ===');
$('div[id^=item_]').each((i, e) => {
  const name = $(e).find('div#name span.twc-break-all').first().text().trim();
  const checked = $(e).find('input[type=checkbox][checked]').length;
  const qty = $(e).find('input.cart-quantity-input').attr('value');
  const price = $(e).find('div[data-component-id=price-area] span.twc-text-\\[20px\\]\\/\\[27px\\]').first().text().trim();
  console.log(`[${i}] checked=${checked ? 'V' : '-'} qty=${qty} price=${price} | ${name.slice(0, 45)}`);
});
console.log('finalOrderPrice:', $('#finalOrderPrice').text().trim());

console.log('\n=== 정답 xls ===');
const wb = XLSX.readFile(path.join(src, '품목내역(통합).xls'));
const ws = wb.Sheets[wb.SheetNames.includes('품목내역') ? '품목내역' : wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
rows.forEach((r, i) => console.log(i, JSON.stringify(r)));
