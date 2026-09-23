// 5차 프로브: 신규 주문서 3종 상품행 셀 단위 덤프
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { parseMhtml, decodeHtml } = require('../src/main/lib/mhtml');

const ROOT = path.resolve(__dirname, '..', '..');
const out = {};
const flat = (s) => String(s || '').replace(/\s+/g, ' ').trim();

function load(rel) {
  const parsed = parseMhtml(fs.readFileSync(path.join(ROOT, 'shoping_cart', rel)));
  return { url: parsed.rootHtml.location || '', html: decodeHtml(parsed.rootHtml) };
}
function chainOf(el, $, depth) {
  const parts = [];
  let n = el;
  for (let i = 0; i < depth && n && n.tagName && !/^html$/i.test(n.tagName); i++) {
    const cls = (n.attribs && n.attribs.class) || '';
    parts.push(n.tagName + (cls ? '.' + cls.split(/\s+/).slice(0, 2).join('.') : ''));
    n = n.parent;
  }
  return parts.join(' < ');
}

// ── 다이소 주문서: 상품 텍스트 주변 구조 ──
try {
  const d = load('택배배송 주문하기 _ 다이소몰.mhtml');
  const $ = cheerio.load(d.html);
  const hits = [];
  $('*').each((_, el) => {
    if (hits.length >= 4) return;
    const txt = flat($(el).text());
    if (/호빵앤양갱|파자마/.test(txt) && txt.length < 100 && !$(el).find('*').toArray().some(c => /호빵앤양갱|파자마/.test(($(c).text() || '')))) {
      hits.push({ txt: txt.slice(0, 90), chain: chainOf(el, $, 7).slice(0, 150) });
    }
  });
  // 상품으로 추정되는 컨테이너 내부 전체 HTML
  let prodHtml = null;
  const probe = $('div.order-item, div.goods-item, div.item-area, div.order-info').first();
  if (probe.length) prodHtml = probe.html().replace(/\s+/g, ' ').slice(0, 1200);
  // '총 배송비' 블록
  const totalPay = $('div.total-pay').first().html() || '';
  out.daisoOrder = {
    hits,
    containerGuess: prodHtml,
    totalPayHtml: totalPay.replace(/\s+/g, ' ').slice(0, 900),
    totalPayText: flat($('div.total-pay').text()).slice(0, 200)
  };
} catch (e) { out.daisoOrder = { error: String(e.message), stack: String(e.stack).split('\n').slice(0, 4) }; }

// ── 알라딘 주문서: 상품 tr 셀 덤프 ──
try {
  const d = load('배송정보 입력 _ 알라딘.mhtml');
  const $ = cheerio.load(d.html);
  const rows = [];
  $('tr').each((_, el) => {
    const txt = flat($(el).text());
    if (/노화는 어디까지|미니 무선 클립|5만원 이상 주문시/.test(txt) && rows.length < 4) {
      const tds = [];
      $(el).find('td,th').each((__, td) => {
        tds.push({ cls: ((td.attribs || {}).class || '').slice(0, 24), txt: flat($(td).text()).slice(0, 70) });
      });
      rows.push({ txt: txt.slice(0, 100), tds });
    }
  });
  // 결제 예상 금액 블록
  let payBlock = null;
  $('*').each((_, el) => {
    if (payBlock) return;
    const t = flat($(el).text());
    if (/총 결제 예상 금액/.test(t) && t.length < 300 && el.tagName !== 'table') {
      payBlock = t.slice(0, 250);
    }
  });
  out.aladinOrder = { rows, payBlock };
} catch (e) { out.aladinOrder = { error: String(e.message) }; }

// ── 오피스디포 주문서: 상품 tr 셀 덤프 + 배송비 dl ──
try {
  const d = load('오피스디포 공식쇼핑몰.mhtml');
  const $ = cheerio.load(d.html);
  const rows = [];
  $('tr').each((_, el) => {
    const txt = flat($(el).text());
    if (/314810|279561/.test(txt) && rows.length < 3) {
      const tds = [];
      $(el).find('td,th').each((__, td) => {
        tds.push({ cls: ((td.attribs || {}).class || '').slice(0, 26), txt: flat($(td).text()).slice(0, 80) });
      });
      rows.push({ txt: txt.slice(0, 110), tds });
    }
  });
  const dl = [];
  $('ul.lastAmount li').each((_, el) => {
    dl.push({ cls: ((el.attribs || {}).class || '').slice(0, 26), txt: flat($(el).text()).slice(0, 60) });
  });
  out.officeOrder = { rows, lastAmount: dl };
} catch (e) { out.officeOrder = { error: String(e.message) }; }

fs.writeFileSync(path.join(__dirname, 'probe-feedback5.json'), JSON.stringify(out, null, 2), 'utf-8');
console.log('written probe-feedback5.json');
