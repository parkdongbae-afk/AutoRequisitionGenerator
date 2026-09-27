#!/usr/bin/env node
/*
 * make-autoselect-rules.js
 * 데스크톱 앱의 장바구니 캡처 규칙(app/src/main/lib/rules/*.json)을 읽어
 * 익스텐션용 content/rules-data.js를 생성한다. 셀렉터는 캡처 규칙과 그대로 동일하게
 * 통과시킨다(단일 출처 유지 — AUTO_SELECT.MD §8.4 어댑터 1:1 원칙).
 *
 * 대상 규칙: id가 '-cart'로 끝나거나 checkedOnly가 있는 규칙 중
 *           fields.name/price를 가진 것(체크박스가 있는 장바구니 화면).
 *           fields가 없는 거부 전용 규칙(emartmall-cart 등)은 제외한다.
 *
 * 실행: app/ 폴더에서 `node analysis/make-autoselect-rules.js`
 */
'use strict';

const fs = require('fs');
const path = require('path');

const RULES_DIR = path.join(__dirname, '..', 'src', 'main', 'lib', 'rules');
const OUT_FILE = path.join(__dirname, '..', 'extension-autoselect', 'content', 'rules-data.js');

// host에서 첫 라벨을 제외한 넓은 도메인(상품 상세 URL 매칭용) — public suffix까지
// 벗겨지는 경우(co.kr 등)는 원래 host를 유지한다.
const PUBLIC_SUFFIXES = new Set(['co.kr', 'or.kr', 'ne.kr', 're.kr', 'pe.kr', 'go.kr', 'com', 'net', 'org', 'kr']);

function broadDomain(host) {
  const labels = String(host).split('.');
  if (labels.length <= 2) return host;
  const cand = labels.slice(1).join('.');
  if (PUBLIC_SUFFIXES.has(cand)) return host;
  return cand;
}

// match 항목("host" 또는 "host/path")에서 host·경로 추출
function parseMatchEntry(entry) {
  const slash = String(entry).indexOf('/');
  if (slash === -1) return { host: String(entry).toLowerCase(), path: '' };
  return { host: String(entry).slice(0, slash).toLowerCase(), path: String(entry).slice(slash + 1) };
}

// Chrome MV3 content_scripts.matches / host_permissions 패턴
function matchPattern(entry) {
  const { host, path } = parseMatchEntry(entry);
  return path ? `*://*.${host}/${path}*` : `*://*.${host}/*`;
}

// 자동 선택은 체크되지 않은 행도 읽어야 하므로 rowSelector에서
// 체크 상태 조건(:has(...) 절, [data-selected=true] / [checked] / [aria-checked=..])을 제거한
// 기본 행 셀렉터를 만든다.
function deriveRowBase(rowSelector) {
  let sel = String(rowSelector || '');
  sel = sel.replace(/:has\([^)]*\)/g, '');
  sel = sel.replace(/\[(?:data-selected|data-arge-checked|aria-checked|checked)(?:[^\]]*)\]/g, '');
  return sel.trim();
}

// checkedOnly가 없는 규칙(네이버 등)은 rowSelector의 :has(...) 안에서
// 체크박스 셀렉터와 상태 읽는 방식을 끌어낸다.
function deriveCheckbox(rule) {
  if (rule.checkedOnly && rule.checkedOnly.sel) {
    return { sel: rule.checkedOnly.sel, stateMode: 'checked' };
  }
  const m = /:has\(([^)]*)\)/.exec(String(rule.rowSelector || ''));
  if (m) {
    const inner = m[1];
    const stateMode = /aria-checked/.test(inner) ? 'aria-checked' : 'checked';
    const sel = inner
      .replace(/\[(?:data-selected|data-arge-checked|aria-checked|checked)(?:[^\]]*)\]/g, '')
      .trim();
    return { sel, stateMode };
  }
  return null;
}

// 가상화 목록 전체 렌더를 위해 실행 전 브라우저 확대/축소 25%로 낮추는 몰 —
// 품의캡처 확장과 동일한 정책(네이버 장바구니 전용, v1.18.3)
const ZOOM_BEFORE_RUN = new Set(['naver-cart']);

function main() {
  const files = fs.readdirSync(RULES_DIR).filter((f) => f.endsWith('.json') && f !== 'meta.json');
  const malls = [];
  const skipped = [];

  for (const file of files) {
    let rule;
    try {
      rule = JSON.parse(fs.readFileSync(path.join(RULES_DIR, file), 'utf8'));
    } catch (e) {
      skipped.push({ file, reason: 'JSON parse error: ' + e.message });
      continue;
    }
    const isCart = String(rule.id || '').endsWith('-cart') || !!rule.checkedOnly;
    const hasFields = !!(rule.fields && rule.fields.name && rule.fields.price);
    if (!isCart) continue; // 주문서 전용 등 — 자동 선택 대상 아님(무음 제외)
    if (!hasFields) {
      skipped.push({ file, id: rule.id, reason: '거부 전용 규칙(fields 없음) — 장바구니 자동 선택 미지원' });
      continue;
    }

    const entries = (rule.match || []).map(parseMatchEntry);
    const domains = [...new Set(entries.map((e) => e.host))];
    const matchPatterns = [...new Set((rule.match || []).map(matchPattern))];
    const filterDomains = [...new Set(domains.concat(domains.map(broadDomain)))];

    malls.push({
      id: rule.id,
      name: rule.name,
      domains,
      matchPatterns,
      filterDomains,
      rowSelector: rule.rowSelector,          // 원본 규칙 셀렉터(참고용, 그대로 보존)
      rowBase: deriveRowBase(rule.rowSelector), // 체크 상태 조건을 제거한 행 탐색용
      checkbox: deriveCheckbox(rule),
      productKey: rule.productKey || null,    // 네이버처럼 URL이 없는 몰의 상품 식별자 속성(예: data-shp-contents-id)
      selectedState: rule.selectedState || null, // 클릭 후 상태 재확인용 행 표식(쿠팡 data-selected 등)
      zoomBeforeRun: ZOOM_BEFORE_RUN.has(rule.id) || undefined,
      fields: rule.fields,                    // 캡처 규칙 셀렉터 그대로 통과(단일 출처)
      units: rule.units || null,
      checkedOnly: rule.checkedOnly || null,
      priceIs: rule.priceIs || null,
      specFromOption: !!rule.specFromOption,
      verifyCount: rule.verifyCount || null,
      qtyFromUnit: rule.qtyFromUnit || null,
      qtyInputSel: rule.qtyInputSel || null,
      shipping: rule.shipping || null
    });
  }

  const hostPatterns = [...new Set(malls.flatMap((m) => m.matchPatterns))].sort();

  const banner =
    '/* GENERATED FILE — 자동 생성됨. 손으로 수정하지 마세요.\n' +
    ' * 원본: app/src/main/lib/rules/*.json 의 장바구니 캡처 규칙\n' +
    ' * 재생성: app/ 폴더에서 `node analysis/make-autoselect-rules.js`\n' +
    ' * 생성 시각: ' + new Date().toISOString() + '\n' +
    ' */\n';

  const body =
    banner +
    "(function (root) {\n" +
    "  'use strict';\n" +
    '  var MALLS = ' + JSON.stringify(malls, null, 2) + ';\n\n' +
    '  // manifest.json content_scripts.matches / host_permissions 용 전체 패턴\n' +
    '  var HOST_PATTERNS = ' + JSON.stringify(hostPatterns, null, 2) + ';\n\n' +
    '  var api = { malls: MALLS, HOST_PATTERNS: HOST_PATTERNS };\n' +
    '  if (typeof module !== \'undefined\' && module.exports) module.exports = api;\n' +
    '  root.AutoSelectRules = api;\n' +
    "})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);\n";

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, body, 'utf8');

  console.log('=== make-autoselect-rules ===');
  console.log('Generated ' + malls.length + ' malls -> ' + path.relative(process.cwd(), OUT_FILE));
  for (const m of malls) {
    console.log('  - ' + m.id.padEnd(18) + ' [' + m.name + ']  domains: ' + m.domains.join(', '));
  }
  if (skipped.length) {
    console.log('Skipped:');
    for (const s of skipped) console.log('  - ' + (s.id || s.file) + ': ' + s.reason);
  }
  console.log('HOST_PATTERNS (' + hostPatterns.length + '):');
  hostPatterns.forEach((p) => console.log('  ' + p));
}

main();
