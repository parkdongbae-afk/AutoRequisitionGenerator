const fs = require('fs');
const cheerio = require('cheerio');
const [, , file] = process.argv;
const $ = cheerio.load(fs.readFileSync(file, 'utf8'));

// 1) id/data-* 속성으로 아이템 컨테이너 후보 탐색
const cands = {};
$('[id]').each((_, e) => {
  const id = $(e).attr('id');
  if (/cart|item|product|prod|line|goods/i.test(id)) {
    const key = e.tagName + '#' + id;
    cands[key] = (cands[key] || 0) + 1;
  }
});
Object.entries(cands).filter(([, n]) => n >= 1).forEach(([k, n]) => console.log(`ID ${k} x${n}`));

// 2) 장바구니 "총" 금액 텍스트 근처 구조
console.log('--- total candidates ---');
$('div,span,strong,em').filter((_, e) => $(e).children().length === 0).each((_, e) => {
  const t = $(e).text().trim().replace(/\s+/g, '');
  if (/^(총)?(결제|주문)?(예정)??금?액?[\d,]+원?$/.test(t) && /[\d,]{4,}/.test(t)) {
    let path = [];
    let cur = $(e);
    for (let i = 0; i < 5 && cur.length; i++) {
      path.unshift((cur.attr('id') ? '#' + cur.attr('id') : '') + (cur.attr('class') ? '.' + cur.attr('class').split(/\s+/).slice(0, 2).join('.') : '') || cur.get(0).tagName);
      cur = cur.parent();
    }
    console.log(t.slice(0, 30), '::', path.join(' > ').slice(0, 160));
  }
});
