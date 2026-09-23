const fs = require('fs');
const cheerio = require('cheerio');
const [, , file, sel] = process.argv;
const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
$(sel).each((i, e) => {
  const name = $(e).find('a.order_name').first().text().trim();
  const qty = $(e).find('div.list_cnt input').attr('value');
  const price = $(e).find('div.cost p.cost_after strong').first().text().trim();
  const each = $(e).find('p.flexbox span').last().text().trim();
  const opt = $(e).find('div.mt5').first().text().trim().replace(/\s+/g, ' ');
  console.log(`[${i}] name=${name.slice(0, 40)} | qty=${qty} | total=${price} | each=${each} | opt=${opt.slice(0, 30)}`);
});
console.log('shop_info 배송비:', $('tr.shop_info em.fc_blue1').map((_, e) => $(e).text().trim()).get().join(' / '));
