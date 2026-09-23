const fs = require('fs');
const cheerio = require('cheerio');
const [, , file] = process.argv;
const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
// JMOD 텍스트가 있는 요소의 구조 탐색
const target = $('*').filter((_, e) => /JMOD/.test($(e).text()) && $(e).children().length <= 3);
target.each((i, e) => {
  if (i >= 3) return;
  console.log(`[${i}] <${e.tagName} class=${$(e).attr('class') || ''}>`);
  console.log((($(e).html()) || '').replace(/\s{2,}/g, ' ').slice(0, 2500));
  console.log('');
});
