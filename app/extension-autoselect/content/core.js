/*
 * 물품 자동 선택 — 순수 로직 (URL 정규화 · 매칭 · 검증 · 안내문 생성)
 * 데스크톱 앱 extract.js의 읽기 의미론과 동일한 값을 다룬다(가격 lineTotal 환산 등).
 * 브라우저(콘텐츠 스크립트/팝업)와 node 테스트 양쪽에서 동작한다.
 */
(function (root) {
  'use strict';

  // 추적성 query parameter — 이 값들로는 상품을 식별하지 않는다(AUTO_SELECT.MD §8.3)
  var TRACK_EXACT = {};
  ['tracking', 'track', 'ref', 'referrer', 'referer', 'campaign', 'medium', 'term',
    'gclid', 'fbclid', 'msclkid', 'dclid', 'napm', 'na_pm', 'n_media', 'n_query',
    'n_rank', 'n_ad', 'n_ad_group', 'affiliate', 'aff_id', 'partner', 'spm'
  ].forEach(function (k) { TRACK_EXACT[k] = true; });

  // 상품 식별자로 쓰는 query parameter(AUTO_SELECT.MD §8.3 — 상품번호 보존·최우선 비교)
  var KEY_PARAMS = ['goodscode', 'goodsno', 'goodsidx', 'goodsseq', 'goods_seq',
    'productno', 'productcode', 'productid', 'product_id', 'prdid', 'prdno',
    'itemno', 'itemcode', 'itemidx'];
  var KEY_PATH_RES = [/\/products\/([0-9]+)/i, /\/product\/([0-9]+)/i,
    /\/goods\/([0-9]+)/i, /\/vpdp\/([A-Za-z0-9]+)/i, /\/item\/([0-9]{6,})/i];

  function normalizeUrl(raw) {
    var u = raw == null ? '' : String(raw).trim();
    if (!u) return '';
    if (/^\/\//.test(u)) u = 'https:' + u;
    if (!/^https?:\/\//i.test(u)) return u;
    var parsed;
    try { parsed = new URL(u); } catch (e) { return u; }
    parsed.protocol = 'https:';   // http/https 통일
    parsed.hash = '';             // fragment 제거
    var kept = [];
    parsed.searchParams.forEach(function (v, k) {
      var key = String(k).toLowerCase();
      if (key.indexOf('utm_') === 0) return;
      if (key.indexOf('tracking') === 0) return; // trackingCode 등 추적 파라미터군
      if (TRACK_EXACT[key]) return;
      kept.push([String(k), v]);
    });
    kept.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
    var host = parsed.hostname.toLowerCase() + (parsed.port ? ':' + parsed.port : '');
    var path = parsed.pathname.replace(/\/+$/, '') || '/';
    var qs = kept.map(function (kv) {
      return encodeURIComponent(kv[0]) + '=' + encodeURIComponent(kv[1]);
    }).join('&');
    return host + path + (qs ? '?' + qs : '');
  }

  function extractProductKey(raw) {
    var u = raw == null ? '' : String(raw).trim();
    if (!u) return null;
    var parsed = null;
    try { parsed = new URL(/^https?:\/\//i.test(u) || /^\/\//.test(u) ? u : 'https://' + u); } catch (e) { /* noop */ }
    if (parsed) {
      var keys = [];
      parsed.searchParams.forEach(function (v, k) { keys.push([String(k).toLowerCase(), String(v)]); });
      for (var i = 0; i < KEY_PARAMS.length; i++) {
        for (var j = 0; j < keys.length; j++) {
          if (keys[j][0] === KEY_PARAMS[i] && keys[j][1]) return keys[j][1];
        }
      }
      var path = parsed.pathname;
      for (var r = 0; r < KEY_PATH_RES.length; r++) {
        var m = KEY_PATH_RES[r].exec(path);
        if (m) return m[1];
      }
    }
    return null;
  }

  function normalizeOption(v) {
    return v == null ? '' : String(v).replace(/\s+/g, ' ').trim();
  }

  // priceIs: 'lineTotal' → 화면 금액이 라인 합계이므로 단가 = 합계 ÷ 수량(extract.js 동일, 10원 단위 반올림 없이 Math.round)
  function toUnitPrice(price, qty, priceIs) {
    var p = Number(price);
    if (!isFinite(p)) return null;
    var q = Number(qty);
    if (!(q > 0)) q = 1;
    if (priceIs === 'lineTotal' && q > 1) return Math.round(p / q);
    return p;
  }

  function formatWon(n) {
    var v = Number(n);
    if (!isFinite(v)) return String(n);
    return v.toLocaleString('ko-KR') + '원';
  }

  // ---- 쇼핑몰 규칙 매칭 (rules-data.js의 matchPatterns 기준) ----
  // 패턴 형식: *://*.host/*  또는  *://*.host/PATH*  (make-autoselect-rules.js 생성)
  function urlMatchesPattern(url, pattern) {
    var m = /^\*:\/\/\*\.([^\/]+)(\/.*)$/.exec(pattern || '');
    if (!m) return false;
    var host = m[1];
    var pathPat = m[2];
    var u;
    try { u = new URL(url); } catch (e) { return false; }
    var h = u.hostname.toLowerCase();
    if (h !== host && !h.endsWith('.' + host)) return false;
    if (pathPat === '/*') return true;
    var prefix = pathPat.replace(/\*[\s\S]*$/, '');
    return u.pathname.startsWith(prefix);
  }

  function findMall(malls, url) {
    if (!url) return null;
    for (var i = 0; i < (malls || []).length; i++) {
      var patterns = malls[i].matchPatterns || [];
      for (var j = 0; j < patterns.length; j++) {
        if (urlMatchesPattern(url, patterns[j])) return malls[i];
      }
    }
    return null;
  }

  // 카트 화면이 아닌 상품 상세 URL(엑셀의 상품 URL)로도 같은 쇼핑몰임을 판정하기 위한
  // 넓은 도메인 집합 — generator가 filterDomains로 제공한다.
  function rowBelongsToMall(row, mall) {
    if (!mall) return false;
    var domains = mall.filterDomains || mall.domains || [];
    var host = '';
    try { host = new URL(row.url).hostname.toLowerCase(); } catch (e) { /* URL 없음 */ }
    if (host) {
      for (var i = 0; i < domains.length; i++) {
        var d = String(domains[i]).toLowerCase();
        if (host === d || host.endsWith('.' + d)) return true;
      }
    }
    var base = String(mall.name || '').replace(/ 장바구니$/, '').trim();
    var rowMall = String(row.mall || '').trim();
    if (base && rowMall && (rowMall.indexOf(base) !== -1 || base.indexOf(rowMall) !== -1)) return true;
    return false;
  }

  function filterRowsForMall(rows, mall) {
    var mallRows = [], otherRows = [];
    (rows || []).forEach(function (row) {
      if (rowBelongsToMall(row, mall)) mallRows.push(row);
      else otherRows.push(row);
    });
    return { mallRows: mallRows, otherRows: otherRows };
  }

  // ---- 매칭 ----
  // excelRow: {rowId, url, qty, option, basePrice, name, mall, productKey, seller}
  // cartItem: {cartRowId, productUrl, productKey, name, option, quantity, price, priceIs, checked}
  function prepareCartItem(item) {
    var canon = normalizeUrl(item.productUrl || '');
    return {
      cartRowId: item.cartRowId,
      canonical: canon,
      productKey: String(item.productKey || extractProductKey(item.productUrl || '') || '').trim(),
      name: item.name || '',
      option: normalizeOption(item.option),
      quantity: item.quantity == null ? null : Number(item.quantity),
      currentUnitPrice: toUnitPrice(item.price, item.quantity, item.priceIs),
      checked: !!item.checked,
      // 체크 실행부(cart-router)가 쓰는 DOM 요소 — 누락 시 click()에서 TypeError가 나므로 반드시 전달
      checkboxEl: item.checkboxEl || null,
      // 클릭 후 상태 재확인에 쓰는 행 컨테이너 id(React 재렌더링 대응)
      rowDomId: item.rowDomId || ''
    };
  }

  /*
   * 매칭 우선순위(AUTO_SELECT.MD §8.4)
   *  1. mall + productKey + normalizedOption
   *  2. mall + canonicalProductUrl + normalizedOption
   *  3. mall + canonicalProductUrl, 양쪽 옵션 모두 없음
   * 여러 카트 행에 모호하게 걸리면 AMBIGUOUS_MATCH — 절대 체크하지 않는다.
   */
  function resolveMatch(row, preparedItems) {
    var rowCanon = normalizeUrl(row.url);
    var rowKey = String(row.productKey || extractProductKey(row.url) || '').trim();
    var rowOpt = normalizeOption(row.option);
    var keyMatches = rowKey ? preparedItems.filter(function (it) {
      return it.productKey && it.productKey === rowKey;
    }) : [];
    var urlMatches = rowCanon ? preparedItems.filter(function (it) {
      return it.canonical && it.canonical === rowCanon;
    }) : [];
    var pool = keyMatches.length ? keyMatches : urlMatches;
    if (!pool.length) return { item: null, code: 'MISSING' };
    var exact = pool.filter(function (it) { return it.option === rowOpt; });
    if (exact.length === 1) return { item: exact[0], code: null };
    if (exact.length > 1) return { item: null, code: 'AMBIGUOUS_MATCH' };
    var seen = {}, opts = [];
    pool.forEach(function (it) {
      var o = it.option || '(옵션 없음)';
      if (!seen[o]) { seen[o] = true; opts.push(o); }
    });
    return { item: null, code: 'OPTION_MISMATCH', actualOptions: opts.join(' / ') };
  }

  // 확정 매칭된 품목 검증(AUTO_SELECT.MD §8.5). 차단 이슈만 results로, 참고는 notes로.
  function validateMatched(row, item, tolerance) {
    var issues = [], notes = [];
    if (item.quantity == null) {
      notes.push('장바구니 수량을 확인할 수 없어 수량 검증을 건너뛰었습니다.');
    } else if (item.quantity !== Number(row.qty)) {
      issues.push({ code: 'QTY_MISMATCH', expected: row.qty, actual: item.quantity });
    }
    var base = Number(row.basePrice);
    if (!isFinite(base) || base <= 0) {
      notes.push('기준 단가가 없어 가격 검증을 건너뛰었습니다.');
    } else if (item.currentUnitPrice == null) {
      notes.push('장바구니 가격을 확인할 수 없어 가격 검증을 건너뛰었습니다.');
    } else {
      var diff = item.currentUnitPrice - base;
      if (diff > tolerance) {
        issues.push({ code: 'PRICE_HIGHER', expected: base, actual: item.currentUnitPrice, diff: diff, tolerance: tolerance });
      }
    }
    return { issues: issues, notes: notes };
  }

  function invalidRowResult(row) {
    return {
      rowId: row.rowId, row: row, status: 'ISSUE', checked: false, item: null,
      issues: [{ code: 'INVALID_EXCEL_ROW' }], notes: []
    };
  }

  /*
   * 순수 매칭·검증 실행. 실제 체크(클릭)는 콘텐츠 스크립트가 results를 받아 수행한다.
   * opts: {tolerance, teacherName, mallName}
   */
  function runMatch(rows, cartItems, opts) {
    opts = opts || {};
    var tolerance = Number(opts.tolerance) || 0;
    var prepared = (cartItems || []).map(prepareCartItem);
    return (rows || []).map(function (row) {
      var qty = Number(row.qty);
      // 상품 URL 또는 상품 키 중 하나는 있어야 매칭 가능 — 네이버처럼 URL을 저장할 수 없는
      // 몰은 상품 키(예: data-shp-contents-id)로 매칭한다(AUTO_SELECT.MD §8.4 키 최우선 원칙).
      var hasKey = !!(String(row.productKey || '').trim() || extractProductKey(row.url || ''));
      if ((!String(row.url || '').trim() && !hasKey) || !isFinite(qty) || qty <= 0) {
        return invalidRowResult(row);
      }
      var m = resolveMatch(row, prepared);
      if (m.code) {
        return {
          rowId: row.rowId, row: row, status: 'ISSUE', checked: false, item: null,
          issues: [{ code: m.code, actual: m.actualOptions || undefined }], notes: []
        };
      }
      var v = validateMatched(row, m.item, tolerance);
      if (v.issues.length) {
        return {
          rowId: row.rowId, row: row, status: 'ISSUE', checked: false, item: m.item,
          issues: v.issues, notes: v.notes
        };
      }
      return {
        rowId: row.rowId, row: row, status: 'OK', checked: false, item: m.item,
        issues: [], notes: v.notes
      };
    });
  }

  /*
   * 체크 실행 계획(AUTO_SELECT.MD §8.6) — 실제 클릭 전에 클릭/보류/생략을 정한다.
   * G마켓 등은 상품 카드 1개 체크박스에 옵션 유닛 N개가 묶여 있어, 유닛별 독립 품목이라도
   * 실제 클릭은 박스당 1번이고 재클릭하면 해제된다.
   * results: runMatch 결과 / boxByRowId: cartRowId → 체크박스 요소 / membersByBox: 체크박스 → cartRowId[]
   * preCheckedRowIds: 읽기 시점에 이미 체크돼 있던 카트 행 id
   * 반환: Map cartRowId → { action: 'click'|'skip'|'hold', note? }
   *   click: 검증 통과 — 라우터가 클릭 후 상태를 재확인한다.
   *   skip : 이미 체크된 상태(초기 체크 또는 같은 박스를 앞 행이 클릭) — 클릭 없이 성공 처리.
   *   hold : 같은 박스로 함께 선택되는 유닛 중 엑셀과 일치하지 않는 것이 있어 보류(오선택 방지).
   */
  function planCheckboxClicks(results, boxByRowId, membersByBox, preCheckedRowIds) {
    var plan = new Map();
    var clicked = new Set();
    var preChecked = new Set(preCheckedRowIds || []);
    var statusByRowId = new Map();
    (results || []).forEach(function (r) {
      if (r.item && r.item.cartRowId != null) statusByRowId.set(r.item.cartRowId, r.status);
    });
    (results || []).forEach(function (r) {
      if (r.status !== 'OK' || !r.item) return;
      var rowId = r.item.cartRowId;
      var box = boxByRowId ? boxByRowId.get(rowId) : r.item.checkboxEl;
      var siblings = (membersByBox && membersByBox.get(box)) || [];
      var uncovered = siblings.filter(function (id) { return statusByRowId.get(id) !== 'OK'; });
      if (uncovered.length) {
        plan.set(rowId, { action: 'hold', note: '이 카드의 다른 옵션 ' + uncovered.length + '건이 엑셀과 일치하지 않아 클릭 시 함께 선택될 수 있습니다. 직접 선택해 주세요.' });
        return;
      }
      if (preChecked.has(rowId) || clicked.has(box)) {
        plan.set(rowId, { action: 'skip' });
        return;
      }
      plan.set(rowId, { action: 'click' });
      clicked.add(box);
    });
    return plan;
  }

  // ---- 안내문 생성(AUTO_SELECT.MD §9.2 템플릿) ----
  function salutation(teacherName) {
    var name = String(teacherName || '').trim();
    return name ? name + ' 선생님' : '선생님';
  }

  function optText(option) {
    var o = normalizeOption(option);
    return o || '(없음)';
  }

  // 상품 식별 줄 — URL이 없는 몰(네이버)은 상품 키 줄로 대체한다
  function idLine(row) {
    if (row.url) return '- 상품 URL: ' + row.url + '\n';
    if (row.productKey) return '- 상품 키: ' + row.productKey + '\n';
    return '';
  }

  function buildIssueMessage(code, ctx) {
    ctx = ctx || {};
    var head = salutation(ctx.teacherName) + ', 많이 바쁘시죠?';
    // 규칙 이름은 'G마켓 장바구니' 형태 — 템플릿 문장이 이미 '장바구니'를 포함하므로 접미사 제거
    var mall = String(ctx.mallName || '쇼핑몰').replace(/ 장바구니$/, '') || '쇼핑몰';
    var row = ctx.row || {};
    var name = String(row.name || '(상품명 없음)');
    var item = ctx.item || {};
    switch (code) {
      case 'MISSING':
        return head + '\n' + mall + ' 장바구니에 아래 물품이 없습니다.\n\n' +
          '- 물품명: ' + name + '\n' +
          '- 옵션: ' + optText(row.option) + '\n' +
          '- 요청 수량: ' + row.qty + '\n' +
          idLine(row) +
          '\n장바구니에 다시 담아 주시면 감사하겠습니다.';
      case 'QTY_MISMATCH':
        return head + '\n' + mall + ' 장바구니의 아래 물품 수량이 품목내역과 다릅니다.\n\n' +
          '- 물품명: ' + name + '\n' +
          '- 옵션: ' + optText(row.option) + '\n' +
          '- 품목내역 수량: ' + row.qty + '\n' +
          '- 장바구니 수량: ' + item.quantity + '\n\n' +
          '확인 후 장바구니 수량을 수정해 주세요.';
      case 'PRICE_HIGHER': {
        var diff = ctx.diff != null ? ctx.diff : (Number(item.currentUnitPrice) - Number(row.basePrice));
        var sign = diff > 0 ? '+' : '';
        return head + '\n' + mall + ' 장바구니의 아래 물품 가격이 품목내역과 다릅니다.\n\n' +
          '- 물품명: ' + name + '\n' +
          '- 옵션: ' + optText(row.option) + '\n' +
          '- 품목내역 기준 단가: ' + formatWon(row.basePrice) + '\n' +
          '- 장바구니 현재 단가: ' + formatWon(item.currentUnitPrice) + '\n' +
          '- 차이: ' + sign + formatWon(diff) + '\n' +
          '- 금액 무시 한도: ' + formatWon(ctx.tolerance != null ? ctx.tolerance : 0) + '\n\n' +
          '대체 상품 선택 또는 품의 금액 확인이 필요합니다.';
      }
      case 'OPTION_MISMATCH':
        return head + '\n' + mall + ' 장바구니의 아래 물품 옵션이 품목내역과 다릅니다.\n\n' +
          '- 물품명: ' + name + '\n' +
          '- 품목내역 옵션: ' + optText(row.option) + '\n' +
          '- 장바구니 옵션: ' + (ctx.actualOptions || optText(item.option)) + '\n\n' +
          '확인 후 올바른 옵션의 물품을 장바구니에 담아 주세요.';
      case 'AMBIGUOUS_MATCH':
        return head + '\n' + mall + ' 장바구니에 아래 물품과 같은 상품이 여러 개 있어 자동으로 선택하지 않았습니다.\n\n' +
          '- 물품명: ' + name + '\n' +
          '- 옵션: ' + optText(row.option) + '\n' +
          idLine(row) +
          '\n확인 후 직접 선택해 주시면 감사하겠습니다.';
      case 'CHECK_FAILED':
        return head + '\n' + mall + ' 장바구니에서 아래 물품의 자동 선택(체크)이 실패했습니다.\n\n' +
          '- 물품명: ' + name + '\n' +
          '- 옵션: ' + optText(row.option) + '\n\n' +
          '확인 후 직접 체크해 주시면 감사하겠습니다.';
      case 'INVALID_EXCEL_ROW':
        return '[자동 선택 불가] 아래 엑셀 행은 상품 URL이 없거나 수량이 올바르지 않아 검사하지 않았습니다.\n' +
          '- 물품명: ' + name;
      default:
        return head + '\n' + mall + ' 장바구니의 아래 물품을 확인해 주세요.\n\n- 물품명: ' + name;
    }
  }

  var api = {
    normalizeUrl: normalizeUrl,
    extractProductKey: extractProductKey,
    normalizeOption: normalizeOption,
    toUnitPrice: toUnitPrice,
    formatWon: formatWon,
    urlMatchesPattern: urlMatchesPattern,
    findMall: findMall,
    rowBelongsToMall: rowBelongsToMall,
    filterRowsForMall: filterRowsForMall,
    prepareCartItem: prepareCartItem,
    resolveMatch: resolveMatch,
    validateMatched: validateMatched,
    runMatch: runMatch,
    planCheckboxClicks: planCheckboxClicks,
    buildIssueMessage: buildIssueMessage
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AutoSelectCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
