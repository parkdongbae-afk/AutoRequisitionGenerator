const fs = require('fs');
const cheerio = require('cheerio');
const file = process.argv[2];
const sel = process.argv[3];
const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
const rows = $(sel);
console.log(`rows(${sel}): ${rows.length}`);
rows.each((i, el) => {
  if (i >= 3) return;
  const $r = $(el);
  console.log(`--- row ${i} ---`);
  // 이름 후보
  ['.text__item-name', 'a.text__link', '.box__goods-name', '.link__goods', 'a[class*=name]', '[class*=item-name]', '.title__goods', 'a[href*=product]', '.box__info-tit', '[class*=goods-name]'].forEach(s => {
    const t = $r.find(s).first().text().trim().replace(/\s+/g, ' ');
    if (t) console.log(`  NAME? ${s} => ${t.slice(0, 50)}`);
  });
  // 수량 후보
  ['.box__sum .text__sum--number', '.text__count', '[class*=count]', '[class*=qty]', '[class*=quantity]', '.box__option-etc'].forEach(s => {
    const t = $r.find(s).first().text().trim().replace(/\s+/g, ' ');
    if (t) console.log(`  QTY? ${s} => ${t.slice(0, 40)}`);
  });
  // 가격 후보
  ['.box__couponwrap strong.text__value', 'strong.text__value', '.text__price', '.format-price strong', 'em.text__value', '[class*=price]'].forEach(s => {
    const arr = [];
    $r.find(s).each((_, e) => arr.push($(e).text().trim().replace(/\s+/g, ' ')));
    if (arr.length) console.log(`  PRICE? ${s} => [${arr.map(x => x.slice(0, 20)).join(' | ')}]`);
  });
  // 옵션
  ['.box__option', '[class*=option]'].forEach(s => {
    const t = $r.find(s).first().text().trim().replace(/\s+/g, ' ');
    if (t) console.log(`  OPT? ${s} => ${t.slice(0, 60)}`);
  });
});
// 배송비 요소
['li.benefit_item', '[class*=delivery]', '.text__delivery', '[class*=shipping]'].forEach(s => {
  const arr = [];
  $(s).each((_, e) => { const t = $(e).text().trim().replace(/\s+/g, ' '); if (/배송/.test(t)) arr.push(t.slice(0, 50)) });
  if (arr.length) console.log(`SHIP ${s} => ${arr.slice(0, 5).join(' // ')}`);
});
