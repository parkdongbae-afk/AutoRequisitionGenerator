/*
 * 물품 자동 선택 — 팝업
 * 엑셀(행정실용 시트)은 <input type="file">로 선택된 파일만 로컬에서 파싱하며
 * 그 어떤 내용도 외부로 전송하지 않는다(AUTO_SELECT.MD §11).
 */
'use strict';

const Core = globalThis.AutoSelectCore;
const Rules = globalThis.AutoSelectRules;
const NOT_AUTOSELECT_MSG =
  '자동 선택용 엑셀 형식이 아닙니다. 자동 품의 요구 생성기에서 [엑셀에 저장]으로 만든 파일을 선택해 주세요.';
const TOLERANCE_KEY = 'autoSelectPriceToleranceWon';

const state = {
  rows: [],
  teacherName: '',
  fileName: '',
  priceColsAvailable: false,
  results: [],
  mallName: '',
  selected: 0,
  total: 0,
  filter: 'all'
};

const $ = (id) => document.getElementById(id);

// XSS 방지: 상품명·옵션·URL 등 외부 문자열을 HTML로 넣을 때 반드시 거친다(AUTO_SELECT.MD §11.5)
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function show(el, on) { el.classList.toggle('hidden', !on); }

function showToast() {
  const t = $('toast');
  show(t, true);
  setTimeout(() => show(t, false), 1500);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  showToast();
}

function toNum(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  return isFinite(n) ? n : null;
}

// ---- 엑셀 파싱(로컬 전용) ----
function parseWorkbook(arrayBuffer) {
  let wb;
  try {
    wb = XLSX.read(arrayBuffer, { type: 'array' });
  } catch (e) {
    return { error: '엑셀 파일을 읽을 수 없습니다. 손상되지 않은 .xls/.xlsx 파일을 선택해 주세요.' };
  }
  const ws = wb.Sheets['행정실용'];
  if (!ws) return { error: NOT_AUTOSELECT_MSG };
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
  // 스키마 버전(숨김 J열) 확인 — 없으면 자동 선택용 파일이 아니다(AS-11/AS-12)
  const schemaOk = aoa.slice(1).some((r) => String(r[9] == null ? '' : r[9]).trim() === 'AUTO_SELECT_V1');
  if (!schemaOk) return { error: NOT_AUTOSELECT_MSG };

  const rows = [];
  let priceColsAvailable = false;
  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i] || [];
    const url = String(r[0] == null ? '' : r[0]).trim();
    const name = String(r[4] == null ? '' : r[4]).trim();
    if (!url && !name) continue;
    const basePrice = toNum(r[3]);
    if (basePrice != null && basePrice > 0) priceColsAvailable = true;
    rows.push({
      rowId: String(r[8] == null ? '' : r[8]).trim() || 'r' + i,
      url: url,
      qty: toNum(r[1]),
      option: String(r[2] == null ? '' : r[2]).trim(),
      basePrice: basePrice,
      name: name,
      mall: String(r[5] == null ? '' : r[5]).trim(),
      productKey: String(r[6] == null ? '' : r[6]).trim(),
      seller: String(r[7] == null ? '' : r[7]).trim()
    });
  }
  if (rows.length > 1000) return { error: '품목 행이 1,000개를 초과합니다. 필요한 품목만 담은 파일을 사용해 주세요.' };

  const meta = { teacherName: '' };
  const mws = wb.Sheets['_AUTO_SELECT_META'];
  if (mws) {
    for (const r of XLSX.utils.sheet_to_json(mws, { header: 1, defval: '', raw: true })) {
      const k = String(r[0] == null ? '' : r[0]).trim();
      if (k === 'teacherName') meta.teacherName = String(r[1] == null ? '' : r[1]).trim();
    }
  }
  return { rows: rows, meta: meta, priceColsAvailable: priceColsAvailable };
}

function handleFile(file) {
  if (!file) return;
  if (!/\.(xls|xlsx)$/i.test(file.name)) {
    showValidate('엑셀 파일(.xls, .xlsx)만 선택할 수 있습니다.');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showValidate('파일이 5MB를 초과합니다. 필요한 품목만 담은 파일을 사용해 주세요.');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const parsed = parseWorkbook(reader.result);
    if (parsed.error) {
      state.rows = [];
      showValidate(parsed.error);
      setFileInfo('');
      $('runBtn').disabled = true;
      return;
    }
    state.rows = parsed.rows;
    state.teacherName = parsed.meta.teacherName;
    state.fileName = file.name;
    state.priceColsAvailable = parsed.priceColsAvailable;
    showValidate('', false);
    setFileInfo(
      escapeHtml(file.name) + ' — 품목 ' + parsed.rows.length + '건' +
      (parsed.meta.teacherName ? ' (담당 교원: ' + escapeHtml(parsed.meta.teacherName) + ')' : '')
    );
    $('runBtn').disabled = parsed.rows.length === 0;
    if (!parsed.priceColsAvailable) {
      showValidate('기준 단가 열이 없어 가격 검증 없이 수량·옵션만 비교합니다.', true);
    }
    show($('resultSection'), false); // 새 파일을 불러오면 이전 실행 결과를 숨긴다
  };
  reader.readAsArrayBuffer(file);
}

function setFileInfo(html) {
  const el = $('fileInfo');
  el.innerHTML = html;
  show(el, !!html);
}

function showValidate(text, warn) {
  const el = $('validateMsg');
  if (!text) { show(el, false); return; }
  el.textContent = text;
  el.classList.toggle('warn', !!warn);
  show(el, true);
}

// ---- 결과 렌더 ----
function issueSummary(r) {
  const iss = r.issues[0];
  if (!iss) return '';
  const x = r.row, c = r.cart || {};
  switch (iss.code) {
    case 'MISSING': return '엑셀 수량 ' + (x.qty == null ? '-' : x.qty) + ' / 장바구니에 없음';
    case 'QTY_MISMATCH': return '엑셀 수량 ' + x.qty + ' / 장바구니 수량 ' + c.quantity;
    case 'PRICE_HIGHER': return '기준 ' + Core.formatWon(x.basePrice) + ' / 현재 ' + Core.formatWon(c.currentUnitPrice);
    case 'OPTION_MISMATCH': return '엑셀 옵션: ' + (x.option || '(없음)') + ' / 장바구니 옵션: ' + (iss.actual || c.option || '(없음)');
    case 'AMBIGUOUS_MATCH': return '같은 상품이 장바구니에 여러 개 있어 자동 선택하지 않았습니다.';
    case 'CHECK_FAILED': return '자동 체크가 실패했거나 보류되었습니다. 직접 체크해 주세요.';
    case 'INVALID_EXCEL_ROW': return '상품 URL이 없거나 수량이 올바르지 않아 검사하지 않았습니다.';
    default: return iss.code;
  }
}

function renderResults() {
  const s = $('summary');
  s.textContent = '총 ' + state.total + '건 중 ' + state.selected + '건 선택 완료 / ' +
    state.results.filter((r) => r.status === 'ISSUE').length + '건 확인 필요';

  const list = $('resultList');
  list.innerHTML = '';
  const rows = state.results.filter((r) => {
    if (state.filter === 'ok') return r.status === 'OK';
    if (state.filter === 'issue') return r.status === 'ISSUE';
    return true;
  });
  for (const r of rows) {
    const li = document.createElement('li');
    li.className = r.status === 'OK' ? 'ok' : 'issue';
    const icon = r.status === 'OK' ? '&#9989;' : '&#9888;';
    const opt = r.row.option ? escapeHtml(r.row.option) : '';
    const diffLines = r.issues.map((i) => escapeHtml(issueSummary({ issues: [i], row: r.row, cart: r.cart }))).join('<br>');
    const notes = (r.notes || []).map((n) => escapeHtml(n)).join(' / ');
    li.innerHTML =
      '<div class="r-head"><span class="r-icon">' + icon + '</span><span class="r-name">' + escapeHtml(r.row.name) + '</span></div>' +
      (opt ? '<div class="r-option">옵션: ' + opt + '</div>' : '') +
      (diffLines ? '<div class="r-diff">' + diffLines + '</div>' : '') +
      (notes ? '<div class="r-note">' + notes + '</div>' : '');
    if (r.status === 'ISSUE' && (r.messages || []).length) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'r-copy';
      btn.textContent = '문구 복사';
      btn.addEventListener('click', () => copyText(r.messages.join('\n\n')));
      li.appendChild(btn);
    }
    list.appendChild(li);
  }
  show($('resultSection'), true);
}

// ---- 실행 ----
function run() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    const mall = tab ? Core.findMall(Rules.malls, tab.url || '') : null;
    if (!mall) {
      showValidate('현재 페이지는 자동 선택을 지원하는 장바구니가 아닙니다. 지원 쇼핑몰의 장바구니 화면에서 실행해 주세요.');
      return;
    }
    const filtered = Core.filterRowsForMall(state.rows, mall);
    if (!filtered.mallRows.length) {
      showValidate('이 엑셀 파일에 ' + mall.name + ' 품목이 없습니다. 해당 쇼핑몰 품목이 담긴 파일인지 확인해 주세요.');
      return;
    }
    const tolerance = Number($('toleranceSelect').value) || 0;
    $('runBtn').disabled = true;
    chrome.runtime.sendMessage({
      type: 'AUTO_SELECT_RUN_RELAY',
      // 서비스 워커에서의 currentWindow 조회는 불안정할 수 있어 팝업이 확인한 탭 ID를 전달한다
      tabId: tab.id,
      // 가상화 몰(네이버 등): 실행 전 배율 25%로 낮춰 전체 렌더 후 복원한다(품의캡처와 동일 방식)
      zoom: !!(mall && mall.zoomBeforeRun),
      payload: {
        rows: filtered.mallRows,
        tolerance: tolerance,
        teacherName: state.teacherName
      }
    }, (res) => {
      $('runBtn').disabled = state.rows.length === 0;
      if (chrome.runtime.lastError || !res) {
        showValidate('이 페이지에서 실행할 수 없습니다. 페이지를 새로 고친 후 다시 시도해 주세요.');
        return;
      }
      if (!res.ok) {
        showValidate(res.message || '실행에 실패했습니다.');
        return;
      }
      state.results = res.results || [];
      state.mallName = res.mallName;
      state.selected = res.selected;
      state.total = res.total;
      showValidate('', false);
      const info = $('otherMallInfo');
      if (filtered.otherRows.length) {
        info.textContent = '다른 쇼핑몰 품목 ' + filtered.otherRows.length + '건은 해당 쇼핑몰 장바구니에서 실행해 주세요.';
        show(info, true);
      } else {
        show(info, false);
      }
      setFilter('all');
      renderResults();
    });
  });
}

function setFilter(f) {
  state.filter = f;
  document.querySelectorAll('#filterTabs button').forEach((b) => {
    b.classList.toggle('active', b.dataset.filter === f);
  });
}

// ---- 초기화 ----
function detectMall() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    const mall = tab ? Core.findMall(Rules.malls, tab.url || '') : null;
    const el = $('mallStatus');
    if (mall) {
      el.textContent = '지원 장바구니: ' + mall.name;
      el.className = 'mall-status ok';
    } else {
      el.textContent = '현재 페이지는 지원하는 장바구니가 아닙니다.';
      el.className = 'mall-status bad';
    }
  });
}

function init() {
  chrome.storage.local.get(TOLERANCE_KEY, (v) => {
    const val = Number(v && v[TOLERANCE_KEY]);
    $('toleranceSelect').value = String([0, 100, 200, 300, 500, 1000, 1500, 2000].includes(val) ? val : 0);
  });
  $('toleranceSelect').addEventListener('change', () => {
    chrome.storage.local.set({ [TOLERANCE_KEY]: Number($('toleranceSelect').value) || 0 });
  });

  const dz = $('dropZone');
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => {
    e.preventDefault(); e.stopPropagation(); dz.classList.add('dragover');
  }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => {
    e.preventDefault(); e.stopPropagation(); dz.classList.remove('dragover');
  }));
  dz.addEventListener('drop', (e) => handleFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]));
  $('pickBtn').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', (e) => handleFile(e.target.files && e.target.files[0]));

  $('runBtn').addEventListener('click', run);
  $('copyAllBtn').addEventListener('click', () => {
    const msgs = state.results
      .filter((r) => r.status === 'ISSUE')
      .flatMap((r) => r.messages || [])
      .filter((m) => !/^\[자동 선택 불가\]/.test(m)); // 엑셀 행 오류는 교원 안내문에서 제외
    if (!msgs.length) { showToast(); return; }
    copyText(msgs.join('\n\n'));
  });
  document.querySelectorAll('#filterTabs button').forEach((b) => {
    b.addEventListener('click', () => { setFilter(b.dataset.filter); renderResults(); });
  });

  detectMall();
}

document.addEventListener('DOMContentLoaded', init);
