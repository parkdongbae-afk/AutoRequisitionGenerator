const fs = require('fs');
const cheerio = require('cheerio');
const [, , file] = process.argv;
const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
function dump(sel, limit) {
  console.log(`### ${sel}`);
  $(sel).each((i, e) => {
    if (i >= (limit || 8)) { console.log('  ...'); return }
    const t = $(e).text().trim().replace(/\s+/g, ' ');
    const cls = $(e).attr('class') || '';
    console.log(`  [${i}] class="${cls}" text="${t.slice(0, 70)}"`);
  });
}
dump("li.benefit_item");
dump(".text__delivery");
dump("[class*=benefit]");
// 주문 요약 영역
$('*').filter((_, e) => { const t = $(e).text(); return /결제.?예정|총.?결제|주문.?금액/.test(t) }).each((i, e) => {
  if (i >= 6) return;
  console.log('SUM? <' + e.tagName + ' class=' + ($(e).attr('class') || '') + '> ' + $(e).text().trim().replace(/\s+/g, ' ').slice(0, 90));
});
