// usage: node inspect-teacher.js <decodedHtml>
// 티처몰 장바구니 행 구조 덤프: 체크/이름/수량/단가/배송비요약
const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync(process.argv[2], 'utf-8');
const $ = cheerio.load(html);

console.log('== fc_blue1 ems ==');
$('em.fc_blue1').each((i, el) => console.log(i, $(el).text().replace(/\s+/g, ' ').trim()));

console.log('\n== rows with input.chk01 ==');
$('tr').each((i, tr) => {
  const chk = $(tr).find('input.chk01');
  if (chk.length === 0) return;
  if ($(tr).find('input.chk01').length && $(tr).parents('tr').length) return; // 최상위 행만
  const name = $(tr).find('a.order_name').text().replace(/\s+/g, ' ').trim();
  const qty = $(tr).find('input[id^=cart_cnt]').attr('value');
  const stamped = chk.attr('data-arge-checked');
  const checkedAttr = chk.attr('checked');
  // 행 내 텍스트에서 금액 후보
  const texts = $(tr).find('.cost_info > p.flexbox').map((_, p) => $(p).text().replace(/\s+/g, ' ').trim()).get();
  console.log(`[${i}] checked(stamp)=${stamped} checked(attr)=${checkedAttr ?? '-'} qty=${qty} name=${name} | cost_info: ${texts.join(' / ')}`);
});

console.log('\n== tr class 목록(상위 30) ==');
const classes = new Set();
$('tr').each((_, tr) => { const c = $(tr).attr('class'); if (c) classes.add(c); });
console.log([...classes].slice(0, 30).join('\n'));
