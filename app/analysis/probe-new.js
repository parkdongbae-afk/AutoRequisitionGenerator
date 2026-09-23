const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const file = process.argv[2];
const $ = cheerio.load(fs.readFileSync(file, 'utf8'));

// 가격/수량 텍스트를 가진 요소의 class 경로를 덤프
const seen = new Set();
$('*').each((_, el) => {
  const $el = $(el);
  if ($el.children().length > 0) return; // 리프만
  const text = ($el.text() || '').trim();
  if (!text || text.length > 60) return;
  const isPrice = /[\d,]+원/.test(text) && text.replace(/[^0-9,]/g, '').length >= 3;
  const isQty = /^\d+개?$/.test(text) || /^수량\s*[\d,]+$/.test(text) || /수량/.test(text) && /\d/.test(text);
  if (!isPrice && !isQty) return;
  // class 경로 수집
  const pathArr = [];
  let cur = $el;
  for (let i = 0; i < 6 && cur.length; i++) {
    const cls = (cur.attr('class') || '').split(/\s+/).filter(Boolean).slice(0, 3).join('.');
    const tag = cur.get(0) ? cur.get(0).tagName : '?';
    pathArr.unshift(tag + (cls ? '.' + cls : ''));
    cur = cur.parent();
  }
  const key = pathArr.join(' > ') + ' :: ' + (isPrice ? 'PRICE' : 'QTY');
  if (!seen.has(key)) {
    seen.add(key);
    console.log((isPrice ? 'P ' : 'Q ') + key + '  [' + text.replace(/\s+/g, ' ').slice(0, 30) + ']');
  }
});
