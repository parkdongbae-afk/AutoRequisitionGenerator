const fs = require('fs');
const cheerio = require('cheerio');
const $ = cheerio.load(fs.readFileSync('analysis/decoded-new/ecbfa0ed8ca121205f20.html', 'utf8'));
const sel = 'div[data-component-id=price-area] span.twc-text-\\[20px\\]\\/\\[27px\\]';
$('div[id^=item_]').each((i, e) => {
  const t = $(e).find(sel).first().text().trim();
  const n = $(e).find('div#name span.twc-break-all').first().text().trim();
  console.log(i, t || 'MISS', '|', n.slice(0, 25));
});
