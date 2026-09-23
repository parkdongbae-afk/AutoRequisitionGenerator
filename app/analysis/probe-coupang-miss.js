const fs = require('fs');
const cheerio = require('cheerio');
const [, , file] = process.argv;
const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
$('div[id^=item_]').each((i, e) => {
  const name = $(e).find('div#name span.twc-break-all').first().text().trim();
  const priceDiv = $(e).find('div[data-component-id=price-area] div.twc-text-rds-bluegray-900');
  const price = priceDiv.first().text().trim();
  if (!price) {
    console.log(`[${i}] ${name} — PRICE MISS`);
    const pa = $(e).find('div[data-component-id=price-area]').first();
    console.log((pa.html() || '(price-area 없음)').replace(/\s{2,}/g, ' ').slice(0, 1500));
  } else {
    console.log(`[${i}] ${name.slice(0, 30)} — ${price}`);
  }
});
