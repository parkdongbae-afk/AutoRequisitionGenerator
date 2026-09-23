const fs = require('fs');
const cheerio = require('cheerio');
for (const [label, file] of [['A(shoping_cart)', 'analysis/decoded-new/ecbfa0ed8ca121205f20.html'], ['B(test_OK)', 'analysis/decoded-testok/coupang-testok.html']]) {
  const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
  console.log('=== ' + label + ' ===');
  $('div[id^=item_]').each((i, e) => {
    const name = $(e).find('div#name span.twc-break-all').first().text().trim();
    console.log(`  data-selected=${$(e).attr('data-selected')} | ${name.slice(0, 40)}`);
  });
}
