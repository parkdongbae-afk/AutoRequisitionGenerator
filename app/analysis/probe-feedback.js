// 사용자 실사용 피드백 10건 중 로컬 데이터로 재현 가능한 것들을 진단
// usage: node analysis/probe-feedback.js  → probe-feedback.json
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const cheerio = require('cheerio');
const { parseMhtml, decodeHtml } = require('../src/main/lib/mhtml');
const { extractItems, roundUpToTen } = require('../src/main/lib/extract');

function loadBuiltin() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'lib', 'rules.js'), 'utf-8');
  const fileByVar = new Map();
  for (const m of src.matchAll(/import\s+(\w+)\s+from\s+'\.\/rules\/([^']+)'/g)) fileByVar.set(m[1], m[2]);
  const arrMatch = src.match(/const builtin = \[([\s\S]*?)\]/);
  return arrMatch[1].split(',').map(s => s.trim()).filter(Boolean)
    .map(v => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'lib', 'rules', fileByVar.get(v)), 'utf-8')));
}
const builtin = loadBuiltin();
function matchRule(url) {
  for (const r of builtin) for (const pat of r.match || []) if (url && url.includes(pat)) return r;
  return null;
}

const ROOT = path.resolve(__dirname, '..', '..');
const out = {};

function load(rel) {
  const parsed = parseMhtml(fs.readFileSync(path.join(ROOT, rel)));
  const url = parsed.rootHtml.location || '';
  return { url, html: decodeHtml(parsed.rootHtml), parts: parsed.parts };
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
function answerRows(xlsRel) {
  const wb = XLSX.readFile(path.join(ROOT, xlsRel));
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }).slice(1)
    .filter(r => String(r[0]).trim())
    .map(r => ({ name: String(r[0]), qty: Number(r[3]), price: Number(r[4]) }));
}

// ── 2. G마켓 장바구니 배송비 누락 ──────────────────────────────
try {
  const d = load('장바구니_html/v_check_not_ok/G마켓 - 장바구니.mhtml');
  const rule = matchRule(d.url);
  const res = extractItems(d.html, rule);
  const $ = cheerio.load(d.html);
  const shipEls = [];
  $('*').each((_, el) => {
    if (shipEls.length >= 14) return;
    const txt = ($(el).text() || '').replace(/\s+/g, ' ').trim();
    if (/배송비/.test(txt) && txt.length < 60 && !$(el).find('*').toArray().some(c => /배송비/.test(($(c).text() || '')))) {
      shipEls.push({ txt: txt.slice(0, 50), chain: chainOf(el, $, 4).slice(0, 110) });
    }
  });
  out.gmarketCart = {
    url: d.url, ruleId: rule.id,
    extracted: res.items.map(it => `${it.qty}x${roundUpToTen(it.unitPrice)} ${it.name.slice(0, 30)}`),
    shipping: res.shippingFee,
    answer: answerRows('장바구니_html/v_check_not_ok/G마켓 - 장바구니_품목내역(통합).xls'),
    shipEls
  };
} catch (e) { out.gmarketCart = { error: String(e.message) }; }

// ── 7a. 교보 장바구니: chkList 속성 상태 ──────────────────────
try {
  const d = load('장바구니_html/v_check_ok/교보문고.mhtml');
  const $ = cheerio.load(d.html);
  const boxes = [];
  $('input[name=chkList]').each((_, el) => {
    const a = el.attribs || {};
    const row = $(el).closest('tr');
    boxes.push({
      id: a.id || '', checkedAttr: 'checked' in a, stamp: a['data-arge-checked'] || null,
      aria: a['aria-checked'] || null,
      rowName: (row.find('span.prod_name').first().text() || '').trim().slice(0, 26),
      rowPrice: (row.find('.prod_price span.price .val').first().text() || '').trim()
    });
  });
  const stamped = $('[data-arge-checked]').length;
  out.kyoboCart = { url: d.url, stampedEverywhere: stamped, boxes, answer: answerRows('장바구니_html/v_check_ok/교보문고_품목내역(통합).xls') };
} catch (e) { out.kyoboCart = { error: String(e.message) }; }

// ── 7b. 교보 주문서: 가격 셀 구조 ──────────────────────────────
try {
  const d = load('shoping_cart/교보문고.mhtml');
  const rule = matchRule(d.url);
  const res = rule ? extractItems(d.html, rule) : null;
  const $ = cheerio.load(d.html);
  const rows = [];
  $('table.tbl_prod tbody tr').each((_, el) => {
    const row = $(el);
    const name = (row.find('span.prod_name').first().text() || '').trim();
    if (!name) return;
    const priceCells = [];
    row.find('span.price, span.price_normal, .prod_price').each((__, c) => {
      const t = ($(c).text() || '').replace(/\s+/g, ' ').trim();
      if (t && priceCells.length < 6) priceCells.push({ cls: ((c.attribs || {}).class || '').slice(0, 40), txt: t.slice(0, 40) });
    });
    rows.push({ name: name.slice(0, 30), qty: (row.find('span.prd_num').first().text() || '').trim(), priceCells });
  });
  out.kyoboOrder = { url: d.url, ruleId: rule && rule.id, extracted: res && res.items.map(it => `${it.qty}x${roundUpToTen(it.unitPrice)} ${it.name.slice(0, 30)}`), shipping: res && res.shippingFee, rows };
} catch (e) { out.kyoboOrder = { error: String(e.message) }; }

// ── 3. 드림디포 (shoping_cart 샘플: 주문서인지 카트인지) ────────
try {
  const d = load('shoping_cart/드림디포 쇼핑몰 _ 사는 곳은 달라도 문구는 드림디포!.mhtml');
  const rule = matchRule(d.url);
  const res = rule ? extractItems(d.html, rule) : null;
  const $ = cheerio.load(d.html);
  out.dreamdepot = {
    url: d.url, ruleId: rule && rule.id,
    rowSelectorHits: rule ? $(rule.rowSelector).length : 0,
    extracted: res ? res.items.map(it => `${it.qty}x${roundUpToTen(it.unitPrice)} ${it.name.slice(0, 30)}`) : null,
    shipping: res && res.shippingFee
  };
} catch (e) { out.dreamdepot = { error: String(e.message) }; }

// ── 4. 아이스크림몰 (shoping_cart 샘플) ────────────────────────
try {
  const d = load('shoping_cart/아이스크림 _ 아이스크림몰.mhtml');
  const rule = matchRule(d.url);
  const res = rule ? extractItems(d.html, rule) : null;
  const $ = cheerio.load(d.html);
  out.icecream = {
    url: d.url, ruleId: rule && rule.id,
    rowSelectorHits: rule ? $(rule.rowSelector).length : 0,
    extracted: res ? res.items.map(it => `${it.qty}x${roundUpToTen(it.unitPrice)} ${it.name.slice(0, 30)}`) : null,
    shipping: res && res.shippingFee,
    body3Count: $('p.body3').length, body2Count: $('p.body2').length
  };
} catch (e) { out.icecream = { error: String(e.message) }; }

// ── 6. 알파몰 주문서(배송지선택): 배송비 표시 요소 ─────────────
try {
  const d = load('shoping_cart/알파몰-배송지선택.mhtml');
  const rule = matchRule(d.url);
  const res = rule ? extractItems(d.html, rule) : null;
  const $ = cheerio.load(d.html);
  const shipEls = [];
  $('*').each((_, el) => {
    if (shipEls.length >= 14) return;
    const txt = ($(el).text() || '').replace(/\s+/g, ' ').trim();
    if (/배송비/.test(txt) && txt.length < 50 && !$(el).find('*').toArray().some(c => /배송비/.test(($(c).text() || '')))) {
      shipEls.push({ txt: txt.slice(0, 44), chain: chainOf(el, $, 4).slice(0, 110) });
    }
  });
  const sum = res ? res.items.reduce((s, it) => s + it.unitPrice * it.qty, 0) : null;
  out.alphamallOrder = {
    url: d.url, ruleId: rule && rule.id,
    extracted: res ? res.items.map(it => `${it.qty}x${roundUpToTen(it.unitPrice)} ${it.name.slice(0, 26)}`) : null,
    subtotal: sum, shippingConditional: res && res.shippingFee, shipEls
  };
} catch (e) { out.alphamallOrder = { error: String(e.message) }; }

// ── 9a. 다이소 장바구니 수량 ───────────────────────────────────
try {
  const d = load('장바구니_html/v_check_not_ok/택배배송 장바구니 _ 다이소몰.mhtml');
  const rule = matchRule(d.url);
  const res = extractItems(d.html, rule);
  const $ = cheerio.load(d.html);
  const rows = [];
  $('div.goods-unit').each((_, el) => {
    const row = $(el);
    const name = (row.find('a.ellipsis1').first().text() || '').trim();
    const total = (row.find('div.goods-inner.total span.value').first().text() || '').trim();
    const price = (row.find('div.goods-inner.price span.value').first().text() || '').trim();
    const qtyCandidates = [];
    row.find('input').each((__, c) => {
      const a = c.attribs || {};
      qtyCandidates.push({ type: a.type || '', cls: (a.class || '').slice(0, 30), value: a.value || null, stamp: a['data-arge-checked'] || null });
    });
    rows.push({ name: name.slice(0, 28), total, price, qtyCandidates });
  });
  out.daisoCart = {
    url: d.url,
    extracted: res.items.map(it => `${it.qty}x${roundUpToTen(it.unitPrice)} ${it.name.slice(0, 28)}`),
    shipping: res.shippingFee, rows,
    answer: answerRows('장바구니_html/v_check_not_ok/택배배송 장바구니 _ 다이소몰_품목내역(통합).xls')
  };
} catch (e) { out.daisoCart = { error: String(e.message) }; }

// ── 10. 쿠팡 렌더링: CSS 파트/링크 해석 ───────────────────────
try {
  const d = load('장바구니_html/v_check_ok/쿠팡! _ 장바구니.mhtml');
  const $ = cheerio.load(d.html);
  // rewriteUrls 시뮬레이션
  let rw = d.html;
  for (let i = 0; i < d.parts.length; i++) {
    const loc = d.parts[i].contentLocation;
    if (!loc || loc.length < 8) continue;
    const target = `app-mhtml://docid/${i}`;
    const entity = loc.replace(/&/g, '&amp;');
    if (entity !== loc) rw = rw.split(entity).join(target);
    rw = rw.split(loc).join(target);
  }
  const $rw = cheerio.load(rw);
  const links = [];
  $rw('link[rel~=stylesheet]').each((_, el) => links.push((el.attribs.href || '').slice(0, 70)));
  const cssParts = d.parts.map((p, i) => ({ i, ct: p.contentType, loc: (p.contentLocation || '').slice(0, 90) }))
    .filter(p => /css/i.test(p.ct));
  const noLoc = d.parts.filter(p => !p.contentLocation).length;
  out.coupangRender = {
    url: d.url,
    parts: d.parts.length, cssParts, partsWithoutLocation: noLoc,
    styleBlocks: $('style').length,
    cssLinks: links,
    unresolvedCssLinks: links.filter(h => !h.startsWith('app-mhtml://')).length
  };
} catch (e) { out.coupangRender = { error: String(e.message) }; }

fs.writeFileSync(path.join(__dirname, 'probe-feedback.json'), JSON.stringify(out, null, 2), 'utf-8');
console.log('written probe-feedback.json');
