// usage: node inspect-rows.js <decodedHtml> — 문서 순서대로 tr 역할 요약
const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync(process.argv[2], 'utf-8');
const $ = cheerio.load(html);
$('tr').each((i, tr) => {
  const row = $(tr);
  if (row.parents('tr').length) return; // 중첩 행 제외
  const fee = row.find('em.fc_blue1').first().text().replace(/\s+/g, ' ').trim();
  const name = row.find('a.order_name').first().text().replace(/\s+/g, ' ').trim();
  if (fee) console.log(`[${i}] SELLER-FEE: ${fee} | class=${row.attr('class')}`);
  else if (name) {
    const chk = row.find('input.chk01').first();
    const stamp = chk.attr('data-arge-checked') ?? '-';
    const qty = row.find('input[id^=cart_cnt]').first().attr('value');
    console.log(`[${i}] PRODUCT: ${name} | stamp=${stamp} qty=${qty}`);
  }
});
