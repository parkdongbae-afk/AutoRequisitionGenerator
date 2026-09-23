// 디버그: cheerio 버전/text 반환형/알라딘 tr 탐색
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { parseMhtml, decodeHtml } = require('../src/main/lib/mhtml');

console.log('cheerio version', require('cheerio/package.json').version);
const parsed = parseMhtml(fs.readFileSync(path.resolve(__dirname, '..', '..', 'shoping_cart', '배송정보 입력 _ 알라딘.mhtml')));
const html = decodeHtml(parsed.rootHtml);
const $ = cheerio.load(html);
let n = 0;
$('tr').each((_, el) => {
  const t = $(el).text();
  if (/노화는/.test(String(t)) && n < 2) { n++; console.log('TR HIT:', String(t).replace(/\s+/g, ' ').slice(0, 100)); }
});
console.log('hits', n);
const first = $('tr').first();
const t2 = first.text();
console.log('typeof text:', typeof t2, Object.prototype.toString.call(t2), 'slice?', typeof t2.slice);
const daiso = parseMhtml(fs.readFileSync(path.resolve(__dirname, '..', '..', 'shoping_cart', '택배배송 주문하기 _ 다이소몰.mhtml')));
const $d = cheerio.load(decodeHtml(daiso.rootHtml));
console.log('daiso total-pay:', typeof $d('div.total-pay').first().text());
let dh = 0;
$d('*').each((_, el) => {
  if (dh >= 2) return;
  const t = $d(el).text();
  if (/호빵앤양갱/.test(String(t)) && String(t).length < 100) { dh++; console.log('DAISO HIT:', String(t).replace(/\s+/g, ' ').slice(0, 80)); }
});
console.log('daiso hits', dh);
