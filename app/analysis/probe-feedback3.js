// 3차 프로브: 드림디포 주문서 셀 구조, 아이스크림 누락 상품명 탐색, 쿠팡 data-selected
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { parseMhtml, decodeHtml } = require('../src/main/lib/mhtml');

const ROOT = path.resolve(__dirname, '..', '..');
const out = {};
const flat = (s) => String(s || '').replace(/\s+/g, ' ').trim();

function load(rel) {
  const parsed = parseMhtml(fs.readFileSync(path.join(ROOT, rel)));
  return { url: parsed.rootHtml.location || '', html: decodeHtml(parsed.rootHtml) };
}

// ── 드림디포 주문서: 상품 tr의 td별 클래스+텍스트 ──
try {
  const d = load('shoping_cart/드림디포 쇼핑몰 _ 사는 곳은 달라도 문구는 드림디포!.mhtml');
  const $ = cheerio.load(d.html);
  const rows = [];
  $('tr:has(input.pm_number)').each((_, el) => {
    const tds = [];
    $(el).children('td').each((__, td) => {
      tds.push({
        cls: ((td.attribs || {}).class || '').slice(0, 40),
        txt: flat($(td).text()).slice(0, 60),
        imgs: $(td).find('img').length,
        imgAlt: $(td).find('img').first().attr('alt') || ''
      });
    });
    const pm = $(el).find('input.pm_number').first();
    rows.push({ tds, pmValue: pm.attr('value') || null, pmHtml: pm.toString().slice(0, 160) });
  });
  // 상품명 후보: a 태그 중 긴 것
  const links = [];
  $('a').each((_, el) => {
    const t = flat($(el).text());
    if (t.length >= 10 && t.length <= 70 && /[\uac00-\ud7a3]/.test(t) && /(무아스|바이하츠|크립|독서대)/.test(t) && !links.includes(t)) links.push(t);
  });
  // 배송비 관련 텍스트를 가진 요소
  const shipEls = [];
  $('*').each((_, el) => {
    if (shipEls.length >= 8) return;
    const t = flat($(el).text());
    if (/배송비\s*합계|기본배송비/.test(t) && t.length < 60) {
      shipEls.push({ tag: el.tagName, cls: ((el.attribs || {}).class || '').slice(0, 30), txt: t.slice(0, 60) });
    }
  });
  out.dreamdepotOrder = { rows, links, shipEls };
} catch (e) { out.dreamdepotOrder = { error: String(e.message) }; }

// ── 아이스크림 주문서: 12,600원 주변 텍스트/이미지 alt에서 상품명 탐색 ──
try {
  const d = load('shoping_cart/아이스크림 _ 아이스크림몰.mhtml');
  const $ = cheerio.load(d.html);
  const alts = [];
  $('img').each((_, el) => {
    const a = (el.attribs || {}).alt || '';
    if (a && a.length > 3) alts.push(a.slice(0, 60));
  });
  // 12,600 주변 컨텍스트
  const idx = d.html.indexOf('12,600');
  const around = idx >= 0 ? flat(d.html.slice(Math.max(0, idx - 1500), idx + 300)).slice(0, 400) : null;
  // '로딩'이 아닌 상품명 후보: mt-[20px] 블록 전체 텍스트
  const blocks = [];
  $('div.relative.flex.items-start').each((_, el) => {
    const t = flat($(el).text());
    if (/12,600|4,500/.test(t)) blocks.push(t.slice(0, 260));
  });
  out.icecreamMissing = { alts: alts.slice(0, 20), around, blocks };
} catch (e) { out.icecreamMissing = { error: String(e.message) }; }

// ── 쿠팡 카트(v_check_ok): data-selected/체크 상태 확인 (뷰어 표시 이슈 관련) ──
try {
  const d = load('장바구니_html/v_check_ok/쿠팡! _ 장바구니.mhtml');
  const $ = cheerio.load(d.html);
  const items = [];
  $('div[id^=item_]').each((_, el) => {
    const a = el.attribs || {};
    const box = $(el).find('input[type=checkbox]').first().attr('data-arge-checked') || null;
    items.push({ id: (a.id || '').slice(0, 20), selected: a['data-selected'] || null, stamp: box });
  });
  out.coupangState = { items: items.slice(0, 12) };
} catch (e) { out.coupangState = { error: String(e.message) }; }

fs.writeFileSync(path.join(__dirname, 'probe-feedback3.json'), JSON.stringify(out, null, 2), 'utf-8');
console.log('written probe-feedback3.json');
