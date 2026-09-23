const fs = require('fs');
const cheerio = require('cheerio');
const [, , file] = process.argv;
const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
$('span.twc-pr-\\[2px\\]').filter((_, e) => $(e).text().trim() === '배송비').each((i, e) => {
  const wrap = $(e).closest('div.twc-flex-wrap');
  console.log(`[${i}] wrap text: ` + wrap.text().replace(/\s+/g, ' ').slice(0, 100));
  console.log('    html: ' + (wrap.html() || '').replace(/\s{2,}/g, ' ').slice(0, 800));
});
