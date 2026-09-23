// 4차 프로브: 신규 주문서 3종(다이소·알라딘·오피스디포) 구조 분석
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const cheerio = require('cheerio');
const { parseMhtml, decodeHtml } = require('../src/main/lib/mhtml');

const ROOT = path.resolve(__dirname, '..', '..');
const out = {};
const flat = (s) => String(s || '').replace(/\s+/g, ' ').trim();

function load(rel) {
  const parsed = parseMhtml(fs.readFileSync(path.join(ROOT, 'shoping_cart', rel)));
  return { url: parsed.rootHtml.location || '', html: decodeHtml(parsed.rootHtml), parts: parsed.parts };
}
function answer(xls) {
  const wb = XLSX.readFile(path.join(ROOT, 'shoping_cart', xls));
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }).slice(1)
    .filter(r => String(r[0]).trim())
    .map(r => `${r[3]}x${r[4]} ${String(r[0]).slice(0, 40)}`);
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

const targets = [
  { key: 'daisoOrder', mhtml: '택배배송 주문하기 _ 다이소몰.mhtml', xls: '택배배송 주문하기 _ 다이소몰_품목내역(통합).xls' },
  { key: 'aladinOrder', mhtml: '배송정보 입력 _ 알라딘.mhtml', xls: '배송정보 입력 _ 알라딘_품목내역(통합).xls' },
  { key: 'officeOrder', mhtml: '오피스디포 공식쇼핑몰.mhtml', xls: '오피스디포 공식쇼핑몰_품목내역(통합).xls' }
];

for (const t of targets) {
  try {
    const d = load(t.mhtml);
    const $ = cheerio.load(d.html);
    const o = { url: d.url, answer: answer(t.xls) };

    // 배송비 텍스트를 가진 리프 요소
    o.shipEls = [];
    $('*').each((_, el) => {
      if (o.shipEls.length >= 10) return;
      const txt = flat($(el).text());
      if (/배송비/.test(txt) && txt.length < 60 && !$(el).find('*').toArray().some(c => /배송비/.test(($(c).text() || '')))) {
        o.shipEls.push({ txt: txt.slice(0, 50), chain: chainOf(el, $, 4).slice(0, 110) });
      }
    });

    // '원' 가격 포함 tr 샘플
    o.trs = [];
    $('tr').each((_, el) => {
      const txt = flat($(el).text());
      if (txt && txt.length > 8 && txt.length < 220 && /원|[\d,]{4,}/.test(txt) && /[\uac00-\ud7a3]/.test(txt) && o.trs.length < 10) {
        o.trs.push({ txt: txt.slice(0, 120), cls: ((el.attribs || {}).class || '').slice(0, 26) });
      }
    });

    // 상품명 후보: 긴 한국어 리프 텍스트
    o.nameLeaves = [];
    $('*').each((_, el) => {
      if (o.nameLeaves.length >= 12) return;
      if (el.children && el.children.some(c => c.type === 'tag')) return;
      const txt = flat($(el).text());
      if (txt.length >= 12 && txt.length <= 60 && /[\uac00-\ud7a3]/.test(txt) && !/원$|배송|주문|결제|쿠폰|적립/.test(txt)) {
        o.nameLeaves.push({ txt: txt.slice(0, 50), chain: chainOf(el, $, 4).slice(0, 100) });
      }
    });

    // input들
    o.inputs = [];
    $('input').each((_, el) => {
      const a = el.attribs || {};
      if ((a.name || a.id || a.value) && o.inputs.length < 20) {
        o.inputs.push({ name: (a.name || '').slice(0, 24), id: (a.id || '').slice(0, 24), type: a.type || '', value: (a.value || '').slice(0, 20), cls: (a.class || '').slice(0, 30) });
      }
    });

    out[t.key] = o;
  } catch (e) { out[t.key] = { error: String(e.message) }; }
}

// 드림디포 파일이 오늘 다시 저장되었는지 확인(규칙 정합성 재검증용)
try {
  const d = load('드림디포 쇼핑몰 _ 사는 곳은 달라도 문구는 드림디포!.mhtml');
  out.dreamdepotUrl = d.url;
} catch (e) { out.dreamdepotUrl = String(e.message); }

fs.writeFileSync(path.join(__dirname, 'probe-feedback4.json'), JSON.stringify(out, null, 2), 'utf-8');
console.log('written probe-feedback4.json');
