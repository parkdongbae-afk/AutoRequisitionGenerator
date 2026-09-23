// 6차 프로브: 알라딘 상품 tr HTML, 다이소 주문서 goods-unit 상세
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { parseMhtml, decodeHtml } = require('../src/main/lib/mhtml');

const ROOT = path.resolve(__dirname, '..', '..');
const out = {};
const flat = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// 알라딘: 상품 tr outerHTML
try {
  const parsed = parseMhtml(fs.readFileSync(path.join(ROOT, 'shoping_cart', '배송정보 입력 _ 알라딘.mhtml')));
  const $ = cheerio.load(decodeHtml(parsed.rootHtml));
  let prodHtml = null;
  let junkHtml = null;
  $('tr').each((_, el) => {
    const t = flat($(el).text());
    if (!prodHtml && /노화는 어디까지/.test(t) && t.length < 150) prodHtml = $(el).toString().replace(/\s+/g, ' ').slice(0, 1400);
    if (!junkHtml && /5만원 이상 주문시/.test(t) && t.length < 120) junkHtml = $(el).toString().replace(/\s+/g, ' ').slice(0, 600);
  });
  // 상품 테이블 컨테이너 식별
  let tableChain = null;
  if (prodHtml) {
    const firstA = $('tr').filter((_, el) => /노화는 어디까지/.test(flat($(el).text()))).first();
    const tbl = firstA.closest('table');
    tableChain = ((tbl.attr('id') || '') + '|' + (tbl.attr('class') || '') + '|' + (tbl.attr('summary') || '')).slice(0, 120);
  }
  out.aladin = { prodHtml, junkHtml, tableChain };
} catch (e) { out.aladin = { error: String(e.message) }; }

// 다이소: goods-unit.order 행 상세
try {
  const parsed = parseMhtml(fs.readFileSync(path.join(ROOT, 'shoping_cart', '택배배송 주문하기 _ 다이소몰.mhtml')));
  const $ = cheerio.load(decodeHtml(parsed.rootHtml));
  const rows = [];
  $('div.goods-unit').each((_, el) => {
    const row = $(el);
    const name1 = flat(row.find('a.ellipsis1').first().text());
    const name2 = flat(row.find('div.tit a').first().text());
    if (!name1 && !name2) return;
    rows.push({
      cls: ((el.attribs || {}).class || '').slice(0, 30),
      ellipsis1: name1.slice(0, 40),
      titA: name2.slice(0, 40),
      goodsPrice: flat(row.find('div.goods-price span.value').first().text()),
      goodsNum: flat(row.find('div.goods-num').first().text()),
      innerPrice: flat(row.find('div.goods-inner.price span.value').first().text()),
      innerTotal: flat(row.find('div.goods-inner.total span.value').first().text())
    });
  });
  out.daiso = { rows };
} catch (e) { out.daiso = { error: String(e.message) }; }

fs.writeFileSync(path.join(__dirname, 'probe-feedback6.json'), JSON.stringify(out, null, 2), 'utf-8');
console.log('written probe-feedback6.json');
