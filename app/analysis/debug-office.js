// 디버그: 오피스디포 주문서 셀렉터 카운트
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { parseMhtml, decodeHtml } = require('../src/main/lib/mhtml');

const parsed = parseMhtml(fs.readFileSync(path.resolve(__dirname, '..', '..', 'shoping_cart', '오피스디포 공식쇼핑몰.mhtml')));
const $ = cheerio.load(decodeHtml(parsed.rootHtml));
console.log('tr:has(td.qt):', $('tr:has(td.qt)').length);
console.log('td.qt:', $('td.qt').length);
console.log('td.info:', $('td.info').length);
console.log('td.bm:', $('td.bm').length);
$('td.qt').each((i, el) => {
  const tr = $(el).closest('tr');
  console.log(`row${i}: qt="${$(el).text().trim()}" info="${$(tr).find('td.info').first().text().trim().slice(0, 40)}" bmLast="${$(tr).find('td.bm').last().text().trim()}"`);
});
// 테이블 구조 확인
const tr0 = $('td.qt').first().closest('tr');
console.log('direct children tag:', tr0.children().map((_, c) => c.tagName + '.' + String((c.attribs || {}).class || '').slice(0, 12)).get().join(', '));
