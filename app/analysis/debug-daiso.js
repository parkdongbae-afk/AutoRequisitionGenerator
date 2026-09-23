// 디버그: 다이소 주문서 셀렉터 카운트
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { parseMhtml, decodeHtml } = require('../src/main/lib/mhtml');

const parsed = parseMhtml(fs.readFileSync(path.resolve(__dirname, '..', '..', 'shoping_cart', '택배배송 주문하기 _ 다이소몰.mhtml')));
const $ = cheerio.load(decodeHtml(parsed.rootHtml));
const cnt = (sel) => $(sel).length;
console.log('div.goods-unit:', cnt('div.goods-unit'));
console.log('div.goods-unit.order:', cnt('div.goods-unit.order'));
console.log('div.tit:', cnt('div.tit'));
console.log('div.tit a:', cnt('div.tit a'));
console.log('a.ellipsis1:', cnt('a.ellipsis1'));
console.log('div.goods-price:', cnt('div.goods-price'));
console.log('div.goods-num:', cnt('div.goods-num'));
console.log('div.goods-detail:', cnt('div.goods-detail'));
const gu = $('div.goods-unit').first();
console.log('first goods-unit classes:', gu.attr('class'));
console.log('first goods-unit tit a:', gu.find('div.tit a').first().text().trim().slice(0, 40));
// 혹시 template 안에 있는지: 조상 체인
const tit = $('div.tit a').first();
let n = tit;
const chain = [];
for (let i = 0; i < 8 && n && n.length; i++) {
  chain.push(n.get(0) ? n.get(0).tagName + '.' + String(n.get(0).attribs && n.get(0).attribs.class || '').slice(0, 30) : '?');
  n = n.parent();
}
console.log('chain:', chain.join(' < '));
