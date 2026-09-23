// 2차 정밀 프로브: G마켓 배송비 DOM, 아이스크림 주문서 행, 드림디포 주문서 구조, 교보 정답
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const cheerio = require('cheerio');
const { parseMhtml, decodeHtml } = require('../src/main/lib/mhtml');

const ROOT = path.resolve(__dirname, '..', '..');
const out = {};

function load(rel) {
  const parsed = parseMhtml(fs.readFileSync(path.join(ROOT, rel)));
  return { url: parsed.rootHtml.location || '', html: decodeHtml(parsed.rootHtml), parts: parsed.parts };
}
function chainOf(el, $, depth) {
  const parts = [];
  let n = el;
  for (let i = 0; i < depth && n && n.tagName && !/^html$/i.test(n.tagName); i++) {
    const cls = (n.attribs && n.attribs.class) || '';
    parts.push(n.tagName + (cls ? '.' + cls.split(/\s+/).slice(0, 3).join('.') : ''));
    n = n.parent;
  }
  return parts.join(' < ');
}
const flat = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// ── G마켓 카트: 배송비 블록 상세 ──
try {
  const d = load('장바구니_html/v_check_not_ok/G마켓 - 장바구니.mhtml');
  const $ = cheerio.load(d.html);
  out.gmarketShip = {
    subSec: $('div.sub_sec.delivery').map((_, el) => flat($(el).text()).slice(0, 80)).get(),
    subSecHtml: ($('div.sub_sec.delivery').first().html() || '').replace(/\s+/g, ' ').slice(0, 500),
    shippingInfoHtml: ($('div.shipping--info').first().html() || '').replace(/\s+/g, ' ').slice(0, 600),
    noGroupHtml: ($('div.shipping--no--group').first().html() || '').replace(/\s+/g, ' ').slice(0, 400)
  };
} catch (e) { out.gmarketShip = { error: String(e.message) }; }

// ── 아이스크림 주문서: body3 전체 + 행 구조 + 배송비 ──
try {
  const d = load('shoping_cart/아이스크림 _ 아이스크림몰.mhtml');
  const $ = cheerio.load(d.html);
  const body3 = [];
  $('p.body3').each((_, el) => {
    body3.push({ txt: flat($(el).text()).slice(0, 50), chain: chainOf(el, $, 5).slice(0, 130) });
  });
  const rows = [];
  $('div.relative.flex.items-start.border-b').each((_, el) => {
    const row = $(el);
    rows.push({
      body3: flat(row.find('p.body3').first().text()).slice(0, 40),
      body2: flat(row.find('p.body2').first().text()).slice(0, 30),
      단일상품: flat(row.find("span:contains('단일상품')").first().text()).slice(0, 30)
    });
  });
  const shipTexts = [];
  $('div.sub-head2').each((_, el) => {
    const t = flat($(el).text());
    if (/배송/.test(t)) shipTexts.push({ txt: t.slice(0, 50), chain: chainOf(el, $, 3).slice(0, 90) });
  });
  out.icecreamOrder = { body3, rowSelectorRows: rows, shipTexts };
} catch (e) { out.icecreamOrder = { error: String(e.message) }; }

// ── 드림디포 주문서: 표/행 구조 탐색 ──
try {
  const d = load('shoping_cart/드림디포 쇼핑몰 _ 사는 곳은 달라도 문구는 드림디포!.mhtml');
  const $ = cheerio.load(d.html);
  const trs = [];
  $('tr').each((_, el) => {
    const t = flat($(el).text());
    if (t && t.length > 10 && /원/.test(t) && trs.length < 16) {
      trs.push({ txt: t.slice(0, 130), cls: ((el.attribs || {}).class || '').slice(0, 30), tds: $(el).find('td').length });
    }
  });
  const inputs = [];
  $('input').each((_, el) => {
    const a = el.attribs || {};
    const n = a.name || a.id || a.type || '';
    if (n && inputs.length < 24) inputs.push({ name: a.name || '', id: a.id || '', type: a.type || '', cls: (a.class || '').slice(0, 30) });
  });
  const nameCands = [];
  $('p, span, a, td').each((_, el) => {
    if (nameCands.length >= 8) return;
    const t = flat($(el).text());
    const cls = ((el.attribs || {}).class || '');
    if (/goods|prod|name|item/i.test(cls) && t.length >= 8 && t.length <= 60 && /[\uac00-\ud7a3]/.test(t) && !nameCands.some(c => c.txt === t.slice(0, 40))) {
      nameCands.push({ cls: cls.slice(0, 40), txt: t.slice(0, 44) });
    }
  });
  out.dreamdepotOrder = { trs, inputs, nameCands };
} catch (e) { out.dreamdepotOrder = { error: String(e.message) }; }

// ── 교보 정답(주문서 시절 test_OK 통합 xls) ──
try {
  const wb = XLSX.readFile(path.join(ROOT, 'test_OK', '품목내역(통합).xls'));
  out.testOkAnswer = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }).slice(1)
    .filter(r => String(r[0]).trim())
    .map(r => `${r[3]}x${r[4]} ${String(r[0]).slice(0, 30)}`);
} catch (e) { out.testOkAnswer = { error: String(e.message) }; }

// ── 드림디포 카트 정답(배송비 확인용) ──
try {
  const wb = XLSX.readFile(path.join(ROOT, '장바구니_html', 'v_check_not_ok', '드림디포 쇼핑몰 _ 사는 곳은 달라도 문구는 드림디포!_품목내역(통합).xls'));
  out.dreamdepotCartAnswer = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }).slice(1)
    .filter(r => String(r[0]).trim())
    .map(r => `${r[3]}x${r[4]} ${String(r[0]).slice(0, 30)}`);
} catch (e) { out.dreamdepotCartAnswer = { error: String(e.message) }; }

fs.writeFileSync(path.join(__dirname, 'probe-feedback2.json'), JSON.stringify(out, null, 2), 'utf-8');
console.log('written probe-feedback2.json');
