const fs = require('fs');
const cheerio = require('cheerio');
const [, , file, sel, maxLen] = process.argv;
const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
$(sel).each((i, e) => {
  if (i >= 4) return;
  const html = ($(e).html() || '').replace(/\n/g, ' ').replace(/\s{2,}/g, ' ');
  console.log(`[${i}] ` + html.slice(0, Number(maxLen || 2500)));
  console.log('');
});
