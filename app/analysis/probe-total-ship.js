const fs = require('fs');
const cheerio = require('cheerio');
const [, , file] = process.argv;
const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
// 텍스트에 '총 배송비' 포함 + 자식 적은 요소 찾아 부모 덤프
$('div,li,dl').each((_, e) => {
  const t = $(e).text().replace(/\s+/g, ' ');
  if (t.includes('총 배송비') && t.length < 200 && $(e).find('div,li,dl').length <= 6) {
    const p = $(e).parent();
    console.log('SELF: ' + t.slice(0, 120));
    console.log('PARENT: ' + (p.html() || '').replace(/\s{2,}/g, ' ').slice(0, 900));
    console.log('---');
  }
});
