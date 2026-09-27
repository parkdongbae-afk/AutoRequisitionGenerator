/*
 * 물품 자동 선택 — 콘텐츠 스크립트(라우터)
 * 현재 페이지의 쇼핑몰 어댑터(rules-data.js의 생성 규칙)를 찾아 장바구니 상품을 읽고,
 * core.js의 순수 매칭·검증 결과를 받아 안전하게 V체크만 수행한다.
 *
 * 안전 원칙(AUTO_SELECT.MD §8):
 *  - 검증을 통과한 항목만 체크한다. 실패/모호 항목은 절대 체크하지 않는다.
 *  - 이미 체크된 상품은 그대로 둔다(성공으로 집계).
 *  - 엑셀과 무관한 기존 체크를 해제하지 않는다.
 *  - 수량·옵션을 자동으로 바꾸지 않고, 주문/결제 버튼은 만지지 않는다.
 */
(function () {
  'use strict';

  var Core = globalThis.AutoSelectCore;
  var Rules = globalThis.AutoSelectRules;

  // ---- 필드 읽기: extract.js(cheerio)의 의미론을 live DOM으로 동일 구현 ----
  // sel 첫/마지막 매치(match:'last'), attr(기본 text, 공백 정규화), regex group 추출
  function extractField(scope, spec) {
    if (!spec || !scope) return null;
    var el = scope;
    if (spec.sel) {
      var matches;
      try { matches = scope.querySelectorAll(spec.sel); } catch (e) { return null; }
      if (!matches.length) return null;
      el = spec.match === 'last' ? matches[matches.length - 1] : matches[0];
    }
    var val;
    var attr = spec.attr || 'text';
    if (attr === 'text') val = (el.textContent || '').replace(/\s+/g, ' ');
    else if (attr === 'html') val = el.innerHTML || '';
    else val = el.getAttribute ? el.getAttribute(attr) : null;
    if (val == null) return null;
    val = String(val).trim();
    if (!val) return null;
    if (spec.regex) {
      var m = new RegExp(spec.regex).exec(val);
      if (!m) return null;
      val = m[spec.group != null ? spec.group : 1] || m[0];
    }
    return val;
  }

  function cleanInt(str) {
    if (str == null) return null;
    var digits = String(str).replace(/[^0-9]/g, '');
    if (!digits) return null;
    return parseInt(digits, 10);
  }

  function readState(el, stateMode) {
    if (!el) return false;
    if (stateMode === 'aria-checked') return el.getAttribute('aria-checked') === 'true';
    return !!el.checked;
  }

  // 행 안에 체크박스가 여러 개면(그룹 컨테이너 행) 상품 단위 하위 범위로 좁힌다 —
  // 단, 좁은 범위에서 상품명·가격이 읽히지 않으면 좁히지 않는다. 쿠팡은 PC/모바일 레이아웃
  // 변형으로 같은 상품의 체크박스가 2개씩 있는데, 좁히면 가격·수량이 범위 밖이 되어 읽기가
  // 실패하므로 행 전체 범위를 쓴다(중복 생성은 아래 seenRows에서 막는다).
  function narrowScope(row, boxSel, box, rule) {
    if (row.querySelectorAll(boxSel).length <= 1) return row;
    var candidates = row.querySelectorAll('*');
    var best = null, bestLen = -1;
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (!el.contains(box)) continue;
      if (el.querySelectorAll(boxSel).length !== 1) continue;
      var name = extractField(el, rule.fields.name);
      var priceStr = extractField(el, rule.fields.price);
      if (!name || priceStr == null) continue;
      var len = el.querySelectorAll('*').length;
      if (best === null || len < bestLen) { best = el; bestLen = len; }
    }
    return best || row;
  }

  // 상품 URL 추정: 행 안의 a[href] 중 상품성 있는 링크(상품 키 존재·상품 경로 키워드 우선)
  function findProductUrl(scopeEl) {
    var best = '', bestScore = -1;
    var anchors = scopeEl.querySelectorAll('a[href]');
    for (var i = 0; i < anchors.length; i++) {
      var href = anchors[i].href || '';
      if (!/^https?:/i.test(href)) continue;
      var score = Math.min(2, href.length / 120);
      if (/product|goods|item|detail|shop|mall/i.test(href)) score += 2;
      if (Core.extractProductKey(href)) score += 3;
      if (score > bestScore) { bestScore = score; best = href; }
    }
    return best;
  }

  // 장바구니 상품 읽기 — 체크박스 요소에서 행을 거슬러 올라가는 탐색 방식이므로
  // 체크되지 않은 상품도 모두 읽힌다(캡처 규칙은 체크된 행만 골랐던 것과 다름).
  function readCartItems(rule) {
    var boxSel = rule.checkbox && rule.checkbox.sel;
    if (!boxSel) return [];
    var stateMode = rule.checkbox.stateMode || 'checked';
    var boxes = document.querySelectorAll(boxSel);
    var items = [];
    // 좁히지 못한 같은 행을 여러 체크박스가 공유하는 경우(쿠팡의 중복 input 등)를 한 번만 읽는다
    var seenRows = new Set();
    // 쿠팡은 PC/모바일 카드가 DOM에 함께 있어(미디어 쿼리로 하나만 표시) 같은 상품이
    // 두 번 읽힌다 — 화면에 렌더링되지 않은 박스는 건너뛰고, 그래도 같은 상품 키+옵션이
    // 중복되면 하나로 합친다(매칭 모호 제거).
    var seenProducts = new Set();
    for (var bi = 0; bi < boxes.length; bi++) {
      var box = boxes[bi];
      if (typeof box.getClientRects === 'function' && box.getClientRects().length === 0) continue;
      var row = box.closest(rule.rowBase) || box.closest('tr');
      if (!row) continue;
      var scope = narrowScope(row, boxSel, box, rule);
      var rowLevel = scope === row;
      if (rowLevel && seenRows.has(row)) continue;
      var name = extractField(scope, rule.fields.name) || '';
      if (!name) continue;
      var priceStr = extractField(scope, rule.fields.price);
      var price = priceStr != null ? cleanInt(priceStr) : null;
      if (price == null) continue; // 가격 없는 행(안내 행 등)은 품목이 아니다
      if (rowLevel) seenRows.add(row);
      var qtyStr = extractField(scope, rule.fields.qty);
      if (qtyStr != null && !/[0-9]/.test(qtyStr)) qtyStr = null;
      var qty = qtyStr != null ? cleanInt(qtyStr) : null;
      // 수량이 DOM 속성에 없는 몰(다이소몰 Vue 카트): 합계 ÷ 단가로 계산(extract.js 동일)
      if (qty == null && rule.qtyFromUnit) {
        var unitStr = extractField(scope, { sel: rule.qtyFromUnit });
        var unitFee = unitStr != null ? cleanInt(unitStr) : null;
        if (unitFee != null && unitFee > 0) qty = Math.max(1, Math.round(price / unitFee));
      }
      var rowOption = extractField(scope, rule.fields.option) || '';
      // 복수 유닛 행(G마켓 등): 유닛별 수량·금액·옵션을 다시 읽어 독립 품목으로 만든다
      var unitEls = (rule.units && rule.units.sel) ? scope.querySelectorAll(rule.units.sel) : [];
      var units = [];
      if (unitEls.length) {
        for (var ui = 0; ui < unitEls.length; ui++) {
          var u = unitEls[ui];
          var pStr = extractField(u, rule.fields.price);
          var qStr = extractField(u, rule.fields.qty);
          if (qStr != null && !/[0-9]/.test(qStr)) qStr = null;
          units.push({
            price: pStr != null ? cleanInt(pStr) : price,
            qty: qStr != null ? cleanInt(qStr) : qty,
            option: extractField(u, rule.fields.option) || rowOption
          });
        }
      } else {
        units.push({ price: price, qty: qty, option: rowOption });
      }
      var productUrl = findProductUrl(scope) || findProductUrl(row);
      // 네이버 등 URL 없는 몰 — rule.productKey 속성(예: data-shp-contents-id)에서 상품 키를 읽는다
      var productKey = (rule.productKey && extractField(scope, rule.productKey)) || '';
      var checked = readState(box, stateMode);
      for (var k = 0; k < units.length; k++) {
        if (!units[k].price) continue;
        var dedupeKey = productKey
          ? 'k:' + productKey + '|' + (units[k].option || '')
          : 'n:' + name + '|' + (units[k].option || '') + '|' + units[k].price;
        if (seenProducts.has(dedupeKey)) continue;
        seenProducts.add(dedupeKey);
        items.push({
          cartRowId: rule.id + ':' + bi + ':' + k,
          // 클릭 후 상태 재확인용 — React 재렌더링으로 저장된 체크박스 참조가 DOM에서
          // 떨어져 나가면 checked를 못 읽으므로, 행 컨테이너 id로 다시 찾는다(쿠팡 item_<id>)
          rowDomId: row.id || '',
          productUrl: productUrl,
          productKey: productKey,
          name: name,
          option: units[k].option,
          quantity: units[k].qty,
          price: units[k].price,
          priceIs: rule.priceIs,
          checked: checked,
          checkboxEl: box
        });
      }
    }
    return items;
  }

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // 클릭·상태 확인에 쓸 체크박스 — React 재렌더링으로 저장된 참조가 DOM에서 떨어져 나가면
  // checked를 못 읽는다(쿠팡 실측: 체크는 되는데 검증만 실패). 행 컨테이너 id로 다시 찾는다.
  function freshCheckbox(item, boxSel) {
    if (item.rowDomId) {
      var freshRow = document.getElementById(item.rowDomId);
      if (freshRow) {
        var fb = freshRow.querySelector(boxSel);
        if (fb) return fb;
      }
    }
    return item.checkboxEl;
  }

  // 체크 상태 확인 — 체크박스 checked(또는 aria-checked)와 행 표식(쿠팡 data-selected)을 모두 본다
  function verifyChecked(item, rule, boxSel) {
    var box = freshCheckbox(item, boxSel);
    if (readState(box, rule.checkbox.stateMode)) return true;
    if (rule.selectedState && item.rowDomId) {
      var fr = document.getElementById(item.rowDomId);
      if (fr && fr.getAttribute(rule.selectedState.attr) === rule.selectedState.value) return true;
    }
    return false;
  }

  // 상태 갱신이 비동기인 몰(쿠팡은 카트 API 반영 전 React가 checked를 되돌렸다가 복원)을 위해
  // 최대 1.5초까지 250ms 간격으로 재확인한다.
  function pollVerified(item, rule, boxSel) {
    return new Promise(function (resolve) {
      var attempts = 0;
      (function check() {
        attempts++;
        if (verifyChecked(item, rule, boxSel)) return resolve(true);
        if (attempts >= 6) return resolve(false);
        setTimeout(check, 250);
      })();
    });
  }

  // DOM 요소를 결과에서 떼어낸 순수 데이터만 메시지로 돌려준다
  function serializeResults(results) {
    return results.map(function (r) {
      return {
        rowId: r.rowId,
        status: r.status,
        checked: r.checked,
        issues: r.issues,
        notes: r.notes,
        messages: r.messages || [],
        row: r.row,
        cart: r.item ? {
          name: r.item.name,
          option: r.item.option,
          quantity: r.item.quantity,
          currentUnitPrice: r.item.currentUnitPrice
        } : null
      };
    });
  }

  function runAutoSelect(payload) {
    var rule = Core.findMall(Rules.malls, location.href);
    if (!rule) {
      return Promise.resolve({
        ok: false,
        code: 'UNSUPPORTED_PAGE',
        message: '현재 페이지는 물품 자동 선택을 지원하는 장바구니가 아닙니다. 해당 쇼핑몰의 장바구니 화면에서 다시 실행해 주세요.'
      });
    }
    if (!rule.checkbox) {
      return Promise.resolve({
        ok: false,
        code: 'UNSUPPORTED_PAGE',
        message: rule.name + '은(는) 아직 자동 선택(체크박스)을 지원하지 않습니다.'
      });
    }
    var boxSel = rule.checkbox.sel; // readCartItems·freshCheckbox 공용 셀렉터

    var items = readCartItems(rule);
    if (!items.length) {
      return Promise.resolve({
        ok: false,
        code: 'NO_CART_ITEMS',
        message: '장바구니에서 상품을 찾지 못했습니다. 로그인 상태와 장바구니 화면인지 확인해 주세요.'
      });
    }

    var results = Core.runMatch(payload.rows || [], items, {
      tolerance: payload.tolerance,
      teacherName: payload.teacherName,
      mallName: rule.name
    });

    // 체크박스 공유 관계(G마켓 등: 카드 1박스 + 옵션 유닛 N개)를 cartRowId 기준으로 정리하고
    // 클릭 계획을 세운다 — 재클릭(해제)과 엑셀에 없는 유닛의 동반 선택을 방지한다.
    var boxByRowId = new Map();
    var membersByBox = new Map();
    var preCheckedRowIds = [];
    items.forEach(function (it) {
      boxByRowId.set(it.cartRowId, it.checkboxEl);
      if (!membersByBox.has(it.checkboxEl)) membersByBox.set(it.checkboxEl, []);
      membersByBox.get(it.checkboxEl).push(it.cartRowId);
      if (it.checked) preCheckedRowIds.push(it.cartRowId);
    });
    var plan = Core.planCheckboxClicks(results, boxByRowId, membersByBox, preCheckedRowIds);

    var selected = 0;
    var chain = Promise.resolve();
    results.forEach(function (r) {
      chain = chain.then(function () {
        if (r.status !== 'OK') return;
        var decision = plan.get(r.item.cartRowId);
        if (!decision) return;
        if (decision.action === 'hold') {
          r.status = 'ISSUE';
          r.issues.push({ code: 'CHECK_FAILED' });
          r.notes.push(decision.note);
          return;
        }
        if (decision.action === 'skip') {
          r.checked = true; // 이미 체크된 상태(초기 체크 또는 같은 카드 앞 옵션이 클릭) — 그대로 둠
          selected++;
          return;
        }
        freshCheckbox(r.item, boxSel).click();
        return pollVerified(r.item, rule, boxSel).then(function (ok) {
          if (ok) {
            r.checked = true;
            selected++;
            // 서버 동기화가 느린 몰(알리익스프레스)은 다음 클릭이 이전 선택의
            // 동기화를 덮어써 마지막 1건만 반영되는 경우가 있다 — 안정화 대기 후 진행
            return delay(rule.clickSettleMs || 800);
          }
          r.status = 'ISSUE';
          r.issues.push({ code: 'CHECK_FAILED' });
        });
      });
    });

    return chain.then(function () {
      var tolerance = Number(payload.tolerance) || 0;
      results.forEach(function (r) {
        r.messages = r.issues.map(function (iss) {
          return Core.buildIssueMessage(iss.code, {
            teacherName: payload.teacherName,
            mallName: rule.name,
            row: r.row,
            item: r.item,
            tolerance: iss.tolerance != null ? iss.tolerance : tolerance,
            diff: iss.diff,
            actualOptions: iss.actual
          });
        });
      });
      var issueCount = results.filter(function (r) { return r.status === 'ISSUE'; }).length;
      return {
        ok: true,
        mallId: rule.id,
        mallName: rule.name,
        total: results.length,
        selected: selected,
        issueCount: issueCount,
        results: serializeResults(results)
      };
    });
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg) return undefined;
    if (msg.type === 'AUTO_SELECT_PING') {
      var rule = Core.findMall(Rules.malls, location.href);
      sendResponse({ ok: true, supported: !!rule, mallName: rule ? rule.name : '' });
      return undefined;
    }
    if (msg.type === 'AUTO_SELECT_RUN') {
      runAutoSelect(msg.payload || {})
        .then(sendResponse)
        .catch(function (e) {
          sendResponse({ ok: false, message: '실행 중 오류가 발생했습니다: ' + (e && e.message ? e.message : e) });
        });
      return true; // 비동기 응답
    }
    return undefined;
  });
})();
