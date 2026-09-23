import * as cheerio from 'cheerio'

function cleanInt(str) {
  if (str == null) return null;
  const digits = String(str).replace(/[^0-9]/g, '');
  if (!digits) return null;
  return parseInt(digits, 10);
}

function extractField(scope, spec) {
  if (!spec) return null;
  let el = scope;
  if (spec.sel) {
    const matches = scope.find(spec.sel);
    if (matches.length === 0) return null;
    el = spec.match === 'last' ? matches.last() : matches.first();
    if (el.length === 0) return null;
  }
  let val;
  const attr = spec.attr || 'text';
  // 텍스트 노드는 화면 표시 텍스트 — 내부 개행/탭을 공백 하나로 정규화(오피스디포 주문서 상품명 등)
  if (attr === 'text') val = el.text().replace(/\s+/g, ' ');
  else if (attr === 'html') val = el.html() || '';
  else val = el.attr(attr);
  if (val == null) return null;
  val = String(val).trim();
  if (!val) return null;
  if (spec.regex) {
    const m = new RegExp(spec.regex).exec(val);
    if (!m) return null;
    val = m[spec.group != null ? spec.group : 1] || m[0];
  }
  return val;
}

/**
 * 규칙에 따라 HTML에서 품목 추출
 * @returns {{items: Array<{name:string, qty:number, unitPrice:number}>, shippingFee: number|null, checkedFallback: boolean}}
 */
function extractItems(html, rule) {
  if (rule.orientation === 'column') return extractItemsByColumn(html, rule)
  const $ = cheerio.load(html);
  const items = [];
  let shippingFee = null;

  const rowMode = rule.shipping && rule.shipping.mode === 'row';
  const rowMatch = (rule.shipping && rule.shipping.rowMatch) || '배송비';
  const perItemMode = rule.shipping && rule.shipping.mode === 'perItem';
  const checkedSpec = rule.checkedOnly || null;
  // 캡처 채널(익스텐션·북마크릿)은 캡처 직전 체크박스의 checked 프로퍼티를
  // data-arge-checked 속성으로 박제해 보낸다 — 스탬프가 있으면 그 값을 우선 신뢰
  const stampedMode = !!checkedSpec && $('[data-arge-checked]').length > 0;
  const pending = [];
  let hasDefinitive = false;

  $(rule.rowSelector).each((_, el) => {
    const row = $(el);
    const name = extractField(row, rule.fields.name);
    const priceStr = extractField(row, rule.fields.price);
    let qtyStr = extractField(row, rule.fields.qty);
    if (qtyStr != null && !/[0-9]/.test(qtyStr)) qtyStr = null;
    let qty = qtyStr != null ? cleanInt(qtyStr) : null;
    const price = priceStr != null ? cleanInt(priceStr) : null;
    const option = extractField(row, rule.fields.option) || '';

    if (rowMode && name && name.includes(rowMatch)) {
      const fee = price;
      if (fee != null) {
        shippingFee = (shippingFee || 0) + fee;
      }
      return;
    }
    // 수량이 DOM 속성에 없는 몰(다이소 등 Vue 카트): 합계금액 ÷ 단가로 수량 계산
    if (qty == null && price != null && rule.qtyFromUnit) {
      const unitStr = extractField(row, { sel: rule.qtyFromUnit });
      const unit = unitStr != null ? cleanInt(unitStr) : null;
      if (unit != null && unit > 0) qty = Math.max(1, Math.round(price / unit));
    }
    if (!name || price == null) return;
    const effQty = qty || 1;
    let unitPrice = price;
    if (rule.priceIs === 'lineTotal' && effQty > 1) {
      unitPrice = Math.round(price / effQty);
    }
    // 뷰어 표시용: 수량 input에 value 속성이 없는 몰(다이소몰 Vue 카트)은 mhtml 뷰에서
    // 수량이 빈칸으로 보인다 — 계산된 수량을 value 속성으로 주입해 뷰에도 반영한다
    if (rule.qtyInputSel && effQty) {
      const qtyBox = row.find(rule.qtyInputSel).first();
      if (qtyBox.length) qtyBox.attr('value', String(effQty));
    }
    // 장바구니 V체크 필터: 행의 체크박스 상태(null=상태 알 수 없음)
    let state = null;
    if (checkedSpec) {
      const box = row.find(checkedSpec.sel).first();
      if (box.length) {
        if (stampedMode) {
          const v = box.attr('data-arge-checked');
          if (v === 'true') state = true;
          else if (v === 'false') state = false;
        }
        if (state === null && 'checked' in (box.attr() || {})) state = true;
        if (state === null && checkedSpec.legacySel && row.find(checkedSpec.legacySel).length) state = true;
        if (state === true || state === false) hasDefinitive = true;
      }
    }
    pending.push({ name, qty: effQty, unitPrice, option, state, row });
  });

  // 체크 상태를 하나라도 읽었으면 체크된 행만 남긴다. 전혀 읽지 못한 문서
  // (V체크가 사라지는 몰을 수동 저장한 경우)만 전체 추출으로 폴백한다.
  let checkedFallback = false;
  if (checkedSpec && !hasDefinitive) checkedFallback = true;
  const kept = (checkedSpec && hasDefinitive) ? pending.filter(p => p.state === true) : pending;
  for (const p of kept) {
    items.push({ name: p.name, qty: p.qty, unitPrice: p.unitPrice, option: p.option });
    // 상품별 배송비(11번가 등): 행 안의 배송비를 '<상품명> 배송비' 행으로 추가
    if (perItemMode && rule.shipping.sel) {
      const feeStr = extractField(p.row, { sel: rule.shipping.sel, regex: rule.shipping.regex });
      const fee = feeStr != null ? cleanInt(feeStr) : null;
      if (fee != null && fee > 0) {
        items.push({ name: `${p.name} 배송비`, qty: 1, unitPrice: fee, option: '', isShipping: true });
      }
    }
  }

  if (rule.shipping && rule.shipping.mode === 'selector' && rule.shipping.sel) {
    // checkedScope: 그룹별 배송비 필터. 그룹 구조는 두 형태가 있다.
    //  ① 상품과 배송비 footer가 같은 그룹 컨테이너 안에 있는 형태(G마켓) —
    //    체크박스를 포함하는 가장 가까운 조상이 다른 배송비 요소를 품지 않으면
    //    그 조상 안의 박스만으로 판정한다.
    //  ② 판매자 그룹이 형제 행으로 나열되고 배송비 행이 그룹 앞에 오는 형태(티처몰) —
    //    이 배송비 요소부터 다음 배송비 요소 전까지의 박스로 판정한다.
    // 어느 쪽으로도 박스를 찾지 못하면(구조를 모르는 문서) 유지한다.
    const wantScope = !!(rule.shipping && rule.shipping.checkedScope && checkedSpec);
    const scopeOk = (() => {
      if (!wantScope || !checkedSpec.sel) return () => true;
      const positiveOf = (a) => (stampedMode ? a['data-arge-checked'] === 'true' : ('checked' in a));
      const pos = new Map($('*').toArray().map((e, i) => [e, i]));
      const shipPos = $(rule.shipping.sel).toArray()
        .map(e => pos.get(e)).filter(p => p != null).sort((a, b) => a - b);
      const boxes = $(checkedSpec.sel).toArray()
        .map(b => ({ p: pos.get(b), positive: positiveOf($(b).attr() || {}) }))
        .filter(b => b.p != null);
      return (el) => {
        let anc = $(el).parent();
        while (anc.length) {
          if (anc.find(checkedSpec.sel).length) {
            const hasOtherShip = anc.find(rule.shipping.sel).toArray().some(x => x !== el);
            if (!hasOtherShip) {
              return anc.find(checkedSpec.sel).toArray().some(b => positiveOf($(b).attr() || {}));
            }
            break;
          }
          anc = anc.parent();
        }
        const start = pos.get(el);
        if (start == null) return true;
        let end = Infinity;
        for (const p of shipPos) { if (p > start) { end = p; break; } }
        const inGroup = boxes.filter(b => b.p > start && b.p < end);
        if (inGroup.length === 0) return true;
        return inGroup.some(b => b.positive);
      };
    })();
    const collect = (sel, regex) => {
      let sum = 0, found = false;
      $(sel).each((_, el) => {
        if (!scopeOk(el)) return;
        let val = $(el).text().trim();
        if (regex) {
          const m = new RegExp(regex).exec(val);
          if (!m) return;
          val = m[rule.shipping.group != null ? rule.shipping.group : 1] || m[0];
        }
        if (/무료|free/i.test(val)) { found = true; return rule.shipping.first ? false : undefined; }
        const fee = cleanInt(val);
        if (fee != null) { sum += fee; found = true; if (rule.shipping.first) return false; }
      });
      return found ? sum : null;
    };
    const fee = collect(rule.shipping.sel, rule.shipping.regex);
    if (fee != null) {
      shippingFee = fee;
      if (rule.shipping.discountSel) {
        const disc = collect(rule.shipping.discountSel, rule.shipping.discountRegex || rule.shipping.regex);
        if (disc != null) shippingFee -= disc;
      }
    }
  }

  if (rule.shipping && rule.shipping.mode === 'conditional') {
    const sub = items.reduce((s, it) => s + it.unitPrice * it.qty, 0);
    const fee = rule.shipping.fee || 0;
    const freeOver = rule.shipping.freeOver;
    shippingFee = freeOver != null && sub >= freeOver ? 0 : fee;
    if (!shippingFee) shippingFee = null;
  }

  return { items, shippingFee, checkedFallback, html: rule.qtyInputSel ? $.html() : undefined };
}

function roundUpToTen(n) {
  return Math.ceil(n / 10) * 10
}

/**
 * 열(column) 구분 쇼핑몰 추출 — 표에서 상품이 가로(열)로 나열되고 속성이 세로(행)로 놓인 구조.
 * rule: { orientation:'column', tableSelector, firstProductCol(0-based), nameRow/qtyRow/priceRow(0-based), shippingRow? }
 */
function extractItemsByColumn(html, rule) {
  const $ = cheerio.load(html)
  const items = []
  let shippingFee = null

  const cellAt = (rows, rowIdx, colIdx) => {
    const tr = rows.eq(rowIdx)
    if (!tr || tr.length === 0) return null
    const cells = tr.children('td,th')
    const td = cells.eq(colIdx)
    if (!td || td.length === 0) return null
    return td
  }

  $(rule.tableSelector).each((_, table) => {
    const rows = $(table).find('tr')
    const sampleRow = rows.eq(rule.nameRow != null ? rule.nameRow : 0)
    const colCount = sampleRow.length ? sampleRow.children('td,th').length : 0
    const start = rule.firstProductCol || 0
    for (let c = start; c < colCount; c++) {
      const nameTd = cellAt(rows, rule.nameRow, c)
      const name = nameTd ? nameTd.text().replace(/\s+/g, ' ').trim() : ''
      if (!name || name.includes(rule.skipText || '배송비')) continue
      const priceTd = rule.priceRow != null ? cellAt(rows, rule.priceRow, c) : null
      const price = priceTd ? cleanInt(priceTd.text()) : null
      if (price == null) continue
      const qtyTd = rule.qtyRow != null ? cellAt(rows, rule.qtyRow, c) : null
      const qty = qtyTd ? cleanInt(qtyTd.text()) : null
      const effQty = qty || 1
      let unitPrice = price
      if (rule.priceIs === 'lineTotal' && effQty > 1) unitPrice = Math.round(price / effQty)
      items.push({ name, qty: effQty, unitPrice, option: '' })
    }
    if (shippingFee == null && rule.shippingRow != null) {
      const shipTr = rows.eq(rule.shippingRow)
      if (shipTr && shipTr.length) {
        const txt = shipTr.text().replace(/\s+/g, ' ')
        if (/무료|free/i.test(txt)) shippingFee = 0
        else {
          const fee = cleanInt(txt)
          if (fee != null) shippingFee = fee
        }
      }
    }
  })

  return { items, shippingFee }
}

export { extractItems, roundUpToTen, cleanInt };
