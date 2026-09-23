// usage: node inspect-naver.js <decodedHtml>
const cheerio = require('cheerio');
const fs = require('fs');
const $ = cheerio.load(fs.readFileSync(process.argv[2], 'utf-8'));
$("div[class*='price_area--']:has(em)").each((i, el) => {
  const t = $(el).text().replace(/\s+/g, ' ');
  if (/총\s*배송비\s*\+/.test(t)) console.log(i, JSON.stringify($(el).attr('class')), '->', JSON.stringify(t.slice(0, 140)));
});
