const fs = require('fs');
const cheerio = require('cheerio');

function itemBlock(file, idPrefix) {
  const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
  let out = '';
  $('div[id^=item_]').each((_, e) => {
    if ($(e).attr('id').startsWith(idPrefix)) out = $(e).html();
  });
  return out;
}

const a = itemBlock('analysis/decoded-new/ecbfa0ed8ca121205f20.html', 'item_45645082438');
const b = itemBlock('analysis/decoded-testok/coupang-testok.html', 'item_45645082438');

function tokenize(html) {
  return html.split(/(?=<)/).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

const ta = tokenize(a);
const tb = tokenize(b);
console.log('tokens A=' + ta.length + ' B=' + tb.length);

// 순차 비교 (같은 구조 가정) — 다른 토큰 쌍 출력
const setA = new Set(ta);
const setB = new Set(tb);
console.log('--- only in A (shoping_cart, selected=V) ---');
ta.filter(t => !setB.has(t)).slice(0, 30).forEach(t => console.log('  ' + t.slice(0, 200)));
console.log('--- only in B (test_OK, unselected=X) ---');
tb.filter(t => !setA.has(t)).slice(0, 30).forEach(t => console.log('  ' + t.slice(0, 200)));
