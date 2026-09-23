const fs = require('fs');
const cheerio = require('cheerio');

function itemAttrs(file, idPrefix) {
  const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
  let out = null;
  $('div[id^=item_]').each((_, e) => {
    if ($(e).attr('id').startsWith(idPrefix)) {
      const chain = [];
      let c = $(e);
      for (let i = 0; i < 8 && c.length && c.get(0).tagName !== 'body'; i++) {
        chain.push(`<${c.get(0).tagName} id=${c.attr('id') || ''} class="${(c.attr('class') || '').slice(0, 120)}" style="${(c.attr('style') || '').slice(0, 80)}" data-selected=${c.attr('data-selected') || ''}>`);
        c = c.parent();
      }
      out = chain;
    }
  });
  return out;
}

const a = itemAttrs('analysis/decoded-new/ecbfa0ed8ca121205f20.html', 'item_45645082438');
const b = itemAttrs('analysis/decoded-testok/coupang-testok.html', 'item_45645082438');
console.log('--- A (shoping_cart: 선택됨) ---');
(a || []).forEach(l => console.log('  ' + l));
console.log('--- B (test_OK: 선택해제) ---');
(b || []).forEach(l => console.log('  ' + l));
