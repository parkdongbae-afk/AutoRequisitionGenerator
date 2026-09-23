// flat().slice 오류 재현 — 정확한 표현식 테스트
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { parseMhtml, decodeHtml } = require('../src/main/lib/mhtml');

const flat = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const parsed = parseMhtml(fs.readFileSync(path.resolve(__dirname, '..', '..', 'shoping_cart', '택배배송 주문하기 _ 다이소몰.mhtml')));
const $ = cheerio.load(decodeHtml(parsed.rootHtml));
const sel = $('div.total-pay');
console.log('sel length:', sel.length);
const t = sel.text();
console.log('typeof t:', typeof t, Object.prototype.toString.call(t));
console.log('t truthy:', !!t);
console.log('flat(t):', typeof flat(t), JSON.stringify(String(flat(t)).slice(0, 40)));
const f = flat(t);
console.log('f.slice is function?', typeof f.slice);
try {
  console.log('RESULT:', flat(sel.text()).slice(0, 100));
} catch (e) {
  console.log('ERR:', e.message);
  console.log('flat.toString():', String(flat));
}
