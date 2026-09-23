import { create } from 'zustand'

let seq = 1
const nextRowKey = () => `r${seq++}`

const RULE_REJECT_MESSAGES = {
  naver: '주문서 상태에서 눌러 주세요.',
  'naver-cart': '주문서 상태에서 눌러 주세요.',
  'naver-cart': '주문서 상태에서 품의캡처 눌러 주세요.',
  coupang: '장바구니 상태에서 품의캡쳐 해주세요.',
  ic114: '장바구니 상태에서 품의캡쳐를 누르세요. 주문하기 화면에서 배송비는 반드시 확인해 보세요.',
  'naver-cart': '네이버 장바구니에서 V체크된 상품이 없습니다.\nV체크 후 품의캡쳐를 눌러주세요.',
  'emartmall-cart': 'e마트몰은 주문서 상태에서만 추출할 수 있습니다.\n주문서 상태에서 눌러 주세요.',
  'emartmall': 'e마트몰은 주문서 상태에서만 추출할 수 있습니다.\n주문서 상태에서 눌러 주세요.',
  'kyobo-cart': '교보문고 장바구니에서 V체크된 상품이 없습니다.\nV체크 후 품의캡쳐를 눌러주세요.',
  aladin: '알라딘 장바구니에서 V체크된 상품이 없습니다.\nV체크 후 품의캡쳐를 눌러주세요.',
  'gmarket-cart': 'G마켓 장바구니에서 V체크된 상품이 없습니다.\nV체크 후 품의캡쳐를 눌러주세요.',
  'st11-cart': '11번가 장바구니에서 V체크된 상품이 없습니다.\nV체크 후 품의캡쳐를 눌러주세요.',
  daisomall: '다이소몰 장바구니에서 V체크된 상품이 없습니다.\nV체크 후 품의캡쳐를 눌러주세요.',
  dreamdepot: '드림디포 장바구니에서 V체크된 상품이 없습니다.\nV체크 후 품의캡쳐를 눌러주세요.',
  'icecream-cart': '아이스크림몰 장바구니에서 V체크된 상품이 없습니다.\nV체크 후 품의캡쳐를 눌러주세요.',
  'auction-cart': '옥션 장바구니에서 V체크된 상품이 없습니다.\nV체크 후 품의캡쳐를 눌러주세요.',
  'alphamall-cart': '알파몰 장바구니에서 V체크된 상품이 없습니다.\nV체크 후 품의캡쳐를 눌러주세요.',
  'yes24-cart': '예스24 카트에서 V체크된 상품이 없습니다.\nV체크 후 품의캡쳐를 눌러주세요.',
  officedepot: '오피스디포 장바구니에서 V체크된 상품이 없습니다.\nV체크 후 품의캡쳐를 눌러주세요.'
}

// 체크 상태를 읽지 못해 전체 추출로 폴백한 문서에만 표시 (doc.checkedFallback)
const CART_FALLBACK_NOTICE = '이 쇼핑몰은 수동 저장(MHTML)에서는 V체크 여부를 읽지 못해\n장바구니의 모든 상품이 추가되었습니다. 선택하지 않은 상품은 표에서 행을 삭제해 주세요.\n\n품의캡처(익스텐션·북마크릿)로 다시 담으면 V체크된 상품만 자동 추출됩니다.'

// 페이지가 알려주는 체크 상품 수보다 캡처에 저장된 행이 적은 경우 (doc.countMismatch)
const countMismatchNotice = m =>
  `장바구니에 체크된 상품은 ${m.expected}개인데, 캡처 파일에는 ${m.actual}개만 저장되어 있습니다.\n` +
  '브라우저 저장 시 일부 상품이 누락된 것입니다. 누락된 상품은 표에 없으니 확인해 주세요.\n\n' +
  '저장 전 장바구니를 끝까지 스크롤해 모든 상품이 화면에 그려진 뒤 다시 저장하거나,\n' +
  '품의캡처(익스텐션·북마크릿)로 다시 담아 주세요.'

function withKeys(doc) {
  doc.rows = (doc.rows || []).map(r => ({ ...r, key: nextRowKey() }))
  return doc
}

export const useStore = create((set, get) => ({
  docs: [],
  selectedDocId: null,
  zoom: 1,
  excelPath: null,
  excelCount: 0,
  status: '',
  rules: [],
  mapping: null,
  toasts: [],
  extensionModal: false,
  rulesModal: false,
  settingsModal: false,
  showRuleAdd: false,
  zoomSensitivity: 1.7,
  gridFontScale: 1.5,
  startupStatus: null,
  bookmarkProgress: null,
  priceMarkup: 0,
  excelHighlight: null,
  splitRatio: 2 / 3,

  setExtensionModal(v) { set({ extensionModal: v }) },
  setRulesModal(v) { set({ rulesModal: v }) },
  setSettingsModal(v) { set({ settingsModal: v }) },
  setShowRuleAdd(v) {
    set({ showRuleAdd: !!v })
    window.api.setSetting('showRuleAdd', !!v)
  },
  setZoomSensitivity(v) {
    const n = Math.min(10, Math.max(0.5, Math.round((Number(v) || 1.7) * 10) / 10))
    set({ zoomSensitivity: n })
    window.api.setSetting('zoomSensitivity', n)
  },
  setGridFontScale(v) {
    const n = Math.min(3, Math.max(1, Math.round((Number(v) || 1.5) * 100) / 100))
    set({ gridFontScale: n })
    window.api.setSetting('gridFontScale', n)
  },
  setPriceMarkup(v) { set({ priceMarkup: Math.max(0, Number(v) || 0) }) },
  setSplitRatio(v) {
    set({ splitRatio: Math.min(0.85, Math.max(0.3, v)) })
  },
  setExcelHighlight(h) { set({ excelHighlight: h }) },

  toast(msg, kind = 'info') {
    const id = Date.now() + Math.random()
    set(s => ({ toasts: [...s.toasts, { id, msg, kind }] }))
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), 4000)
  },

  setStatus(status) {
    set({ status })
  },

  async addDocs(newDocs) {
    const ok = newDocs.filter(d => d && d.rows && !d.error).map(withKeys)
    const fail = newDocs.filter(d => d && d.error)
    set(s => ({
      docs: [...s.docs, ...ok],
      selectedDocId: ok[0] ? ok[0].id : s.selectedDocId
    }))
    if (ok.length) {
      const total = ok.reduce((n, d) => n + d.rows.length, 0)
      get().toast(`MHTML ${ok.length}개 로드 (추출 ${total}행)`, 'ok')
      const unsupported = ok.filter(d => !d.ruleId)
      if (unsupported.length) {
        get().toast(`규칙 없는 쇼핑몰 ${unsupported.length}개: 매핑 학습이 필요합니다`, 'warn')
      }
    }
    for (const f of fail) {
      get().toast(`로드 실패: ${f.fileName} - ${f.error}`, 'err')
    }
    for (const d of ok) {
      if (d.countMismatch) window.api.alertBox(countMismatchNotice(d.countMismatch))
    }
  },

  async openFiles() {
    const docs = await window.api.openMhtmlFiles()
    if (docs.length) get().addDocs(docs)
  },

  async openFolder() {
    const docs = await window.api.openMhtmlFolder()
    if (docs.length) get().addDocs(docs)
  },

  selectDoc(id) {
    set({ selectedDocId: id })
  },

  closeDoc(id) {
    window.api.removeDoc(id)
    set(s => {
      const docs = s.docs.filter(d => d.id !== id)
      return {
        docs,
        selectedDocId: s.selectedDocId === id ? (docs[0] ? docs[0].id : null) : s.selectedDocId
      }
    })
  },

  setZoom(z) {
    set({ zoom: Math.min(3, Math.max(0.25, Math.round(z * 1000) / 1000)) })
  },

  updateRow(docId, key, field, value) {
    set(s => ({
      docs: s.docs.map(d => {
        if (d.id !== docId) return d
        const rows = d.rows.map(r => {
          if (r.key !== key) return r
          const nr = { ...r, [field]: value }
          if (field === 'qty') nr.qty = Math.max(0, parseInt(value, 10) || 0)
          if (field === 'roundedPrice') nr.roundedPrice = Math.max(0, parseInt(String(value).replace(/[^\d]/g, ''), 10) || 0)
          return nr
        })
        return { ...d, rows }
      })
    }))
  },

  deleteRow(docId, key) {
    set(s => ({
      docs: s.docs.map(d => (d.id !== docId ? d : { ...d, rows: d.rows.filter(r => r.key !== key) }))
    }))
  },

  // 중복 그룹 일괄 삭제 — 같은 장바구니를 2번 추출한 경우 첫 1세트만 남기고 나머지를 지운다
  deleteDuplicateRows(targets) {
    const tset = new Set((targets || []).map(t => `${t.docId}|${t.key}`))
    set(s => ({
      docs: s.docs.map(d => ({ ...d, rows: d.rows.filter(r => !tset.has(`${d.id}|${r.key}`)) }))
    }))
  },

  async loadExcelFlow() {
    const path = await window.api.pickExcel()
    if (!path) return
    const res = await window.api.loadExcelFull(path)
    if (!res || res.error) {
      get().toast(`엑셀 로드 실패: ${(res && res.error) || '알 수 없는 오류'}`, 'err')
      return
    }
    const items = (res.picked && res.picked.items) || []
    const existingRows = get().docs.flatMap(d => d.rows)
    let mode = 'append'
    if (existingRows.length) {
      mode = await window.api.excelLoadConfirm(res.path.split(/[\\/]/).pop())
      if (mode === 'cancel') return
    }
    if (mode === 'replace') {
      for (const d of get().docs) window.api.removeDoc(d.id)
      set({ docs: [], selectedDocId: null })
    }
    const firstSheet = res.sheets[0] ? res.sheets[0].name : 'Sheet1'
    const doc = withKeys({
      id: `excel-${Date.now()}`,
      fileName: `[엑셀] ${res.path.split(/[\\/]/).pop()}`,
      sourceUrl: '',
      mallName: '엑셀 불러오기',
      ruleId: null,
      itemCount: items.filter(r => !r.isShipping).length,
      shippingFee: null,
      rows: items,
      excel: {
        filePath: res.path,
        sheets: res.sheets,
        sheetIndex: res.picked ? res.picked.sheetIndex : 0,
        sheetName: res.picked ? res.picked.sheetName : firstSheet,
        headerRow: res.picked ? res.picked.headerRow : -1
      }
    })
    get().addDocs([doc])
    set({ excelPath: res.path, excelCount: items.length })
    if (!res.picked) {
      get().toast('품목 표(품목명/수량/단가 컬럼)를 찾지 못했습니다 — 좌측 엑셀 화면을 확인하세요', 'warn')
    } else {
      get().toast(`엑셀 로드: 품목 ${doc.itemCount}건 + 배송비 ${items.length - doc.itemCount}행`, 'ok')
    }
  },

  async saveExcelAs() {
    const { docs, priceMarkup } = get()
    const pct = Number(priceMarkup) || 0
    const rows = docs.flatMap(d => d.rows.map(r => {
      const price = (!r.isShipping && pct > 0)
        ? Math.round((r.roundedPrice || 0) * (1 + pct / 100))
        : r.roundedPrice
      return { name: r.name, spec: r.spec, unit: r.unit, qty: r.qty, price, isShipping: !!r.isShipping }
    }))
    if (!rows.length) {
      get().toast('저장할 품목이 없습니다', 'warn')
      return null
    }
    const res = await window.api.saveExcelAs(rows)
    if (!res || res.canceled) return null
    if (res.error) {
      get().toast(`엑셀 저장 실패: ${res.error}`, 'err')
      return null
    }
    set({ excelPath: res.path, excelCount: res.totalRows })
    get().toast(`${res.appended}행 저장 완료 (파일을 현재 표 내용으로 교체${pct > 0 ? ` · 예상단가 ${pct}% 인상, 배송비 제외` : ''}) → ${res.path}`, 'ok')
    return res
  },

  async loadExcel(path) {
    const p = path || (await window.api.pickExcel())
    if (!p) return
    const res = await window.api.readExcel(p)
    if (res.error) {
      get().toast(`엑셀 로드 실패: ${res.error}`, 'err')
      return
    }
    set({ excelPath: res.path, excelCount: res.rows.length })
    get().toast(`엑셀 로드: 기존 ${res.rows.length}행 (${res.path})`, 'ok')
  },

  async refreshRules() {
    const rules = await window.api.listRules()
    set({ rules })
  },

  async applyRule(docId, ruleId) {
    const res = await window.api.reextractDoc(docId, ruleId)
    if (res && res.error) {
      get().toast(res.error, 'err')
      return
    }
    set(s => ({
      docs: s.docs.map(d => (d.id === docId ? withKeys(res) : d))
    }))
    get().toast(`규칙 "${res.mallName}" 재적용: ${res.rows.length}행`, 'ok')
  },

  async startMapping() {
    const docs = get().docs
    for (const d of docs) {
      window.api.removeDoc(d.id)
    }
    set({
      docs: [],
      selectedDocId: null,
      mapping: {
        waiting: true,
        capturedDocId: null,
        step: 'row',
        orientation: 'row',
        rowSelector: null,
        rowSamples: [],
        rowMatchCount: null,
        productCount: '',
        tableSelector: null,
        columnRows: { name: null, qty: null, price: null, shipping: null },
        firstProductCol: null,
        picks: { name: null, qty: null, price: null, shipping: null },
        fieldSamples: { name: [], qty: [], price: [], shipping: [] },
        ruleName: '',
        ruleId: `mall-${Date.now()}`,
        matchPattern: ''
      }
    })
    get().toast(docs.length ? `문서 ${docs.length}개를 닫고 캡처 대기를 시작합니다 — 장바구니에 2개 이상의 상품을 선택 하세요` : '캡처 대기를 시작합니다 — 장바구니에 2개 이상의 상품을 선택 하세요', 'ok')
  },

  beginMappingCapture(doc) {
    if (!doc || doc.error || !doc.rows) {
      get().addDocs([doc])
      return
    }
    get().addDocs([doc])
    const m = get().mapping
    if (!m || !m.waiting) return
    let host = ''
    try { host = new URL(doc.sourceUrl).hostname } catch { host = '' }
    set({
      mapping: {
        ...m,
        waiting: false,
        capturedDocId: doc.id,
        step: 'row',
        rowSamples: [],
        rowSelector: null,
        rowMatchCount: null,
        fieldSamples: { name: [], qty: [], price: [], shipping: [] },
        ruleId: host ? host.split('.').slice(-2).join('-').replace(/[^a-z0-9-]/g, '') : m.ruleId,
        matchPattern: host || m.matchPattern
      },
      selectedDocId: doc.id
    })
    get().toast('캡처를 받았습니다 — 각 상품의 행을 하나씩 클릭하세요 (2개 이상)', 'ok')
  },

  setMappingStep(step) {
    const m = get().mapping
    if (!m) return
    set({ mapping: { ...m, step } })
  },

  // 매핑 클릭 실수 복구 — 행/필드 샘플을 개별 삭제하면 같은 단계에서 다시 클릭할 수 있다
  removeRowSample(i) {
    const m = get().mapping
    if (!m) return
    const rowSamples = (m.rowSamples || []).filter((_, j) => j !== i)
    const rowSelector = rowSamples.length
      ? rowSamples[rowSamples.length - 1].replace(/:nth-of-type\(\d+\)/g, '')
      : null
    set({ mapping: { ...m, rowSamples, rowSelector, rowMatchCount: null } })
    get().validateRowCount()
  },

  removeFieldSample(kind, i) {
    const m = get().mapping
    if (!m) return
    const fieldSamples = { ...(m.fieldSamples || { name: [], qty: [], price: [], shipping: [] }) }
    fieldSamples[kind] = (fieldSamples[kind] || []).filter((_, j) => j !== i)
    const picks = { ...m.picks }
    picks[kind] = fieldSamples[kind].length ? fieldSamples[kind][fieldSamples[kind].length - 1] : null
    set({ mapping: { ...m, fieldSamples, picks } })
  },

  setMappingField(k, v) {
    const m = get().mapping
    if (!m) return
    set({ mapping: { ...m, [k]: v } })
    if (k === 'productCount') get().validateRowCount()
  },

  setOrientation(o) {
    const m = get().mapping
    if (!m) return
    set({ mapping: { ...m, orientation: o } })
    get().toast(o === 'column'
      ? '열 모드 — 표에서 상품이 가로(열)로 나열된 구조입니다. 첫 상품의 아무 셀이나 클릭하세요'
      : '행 모드 — 상품이 세로로 나열된 구조입니다. 각 상품의 행을 클릭하세요', 'info')
  },

  async validateRowCount() {
    const m = get().mapping
    if (!m || !m.capturedDocId) return
    const n = parseInt(m.productCount, 10)
    if (!(n >= 2)) return
    const selector = m.orientation === 'column' ? m.tableSelector : m.rowSelector
    if (!selector) return
    const res = await window.api.countSelector(m.capturedDocId, selector, m.orientation, m.firstProductCol)
    const cur = get().mapping
    if (!cur || (m.orientation === 'column' ? cur.tableSelector : cur.rowSelector) !== selector) return
    if (res && typeof res.count === 'number') {
      set({ mapping: { ...cur, rowMatchCount: res.count } })
      if (res.count === n) get().toast(`선택자가 상품 ${n}개와 정확히 일치합니다 ✓`, 'ok')
      else get().toast(`매칭 ${res.count}개 (입력 ${n}개) — 클릭을 조정해주세요`, 'warn')
    }
  },

  receivePick(payload) {
    const m = get().mapping
    if (!m || m.waiting) return
    const { kind, selector, sampleText, table, cell } = payload
    if (kind === 'row') {
      if (m.orientation === 'column') {
        // 열 모드: 이 클릭은 표와 첫 상품 열을 지정한다
        if (!table || !cell) {
          get().toast('열 모드는 표(table) 셀을 클릭해야 합니다 — 행 모드로 진행하거나 표 안을 클릭하세요', 'warn')
          return
        }
        set({
          mapping: {
            ...m,
            tableSelector: table.selector,
            firstProductCol: cell.col,
            rowSelector: null,
            rowSamples: [],
            rowMatchCount: null
          }
        })
        get().toast(`표 지정 완료 (${table.rows}행) — 이제 상품명 셀을 클릭하세요`, 'ok')
        get().validateRowCount()
        return
      }
      // 한 품목의 클릭만으로 만든 선택자는 :nth-of-type(n)이 박혀 다른 품목을 누락시킨다 —
      // 행은 반복 구조이므로 위치 서수를 제거하고, 여러 행 클릭 샘플로 공통 선택자를 일반화한다
      const rowSamples = [...(m.rowSamples || []), selector]
      const stripped = selector.replace(/:nth-of-type\(\d+\)/g, '')
      const uniq = [...new Set(rowSamples.map(s => s.replace(/:nth-of-type\(\d+\)/g, '')))]
      set({ mapping: { ...m, rowSamples, rowSelector: stripped, rowMatchCount: null } })
      const needRows = parseInt(m.productCount, 10)
      if (needRows >= 2 && rowSamples.length >= needRows) get().toast(`행 ${needRows}개 선택 완료 — [다음: 상품명 지정]을 누르세요`, 'ok')
      else if (uniq.length === 1) get().toast(`행 ${rowSamples.length}개 선택 — 공통 선택자: ${stripped.slice(0, 50)}`, 'ok')
      else get().toast('서로 다른 구조가 섞였습니다 — 마지막 클릭한 행 기준으로 갱신됩니다', 'warn')
      get().validateRowCount()
    } else if (['name', 'qty', 'price', 'shipping'].includes(kind)) {
      if (m.orientation === 'column') {
        if (!cell || !m.tableSelector) {
          get().toast('열 모드에서는 표 안의 셀을 클릭해야 합니다', 'warn')
          return
        }
        const columnRows = { ...m.columnRows, [kind]: cell.row }
        const picks = { ...m.picks, [kind]: { selector, sampleText } }
        const order = ['name', 'qty', 'price', 'shipping']
        const nextStep = order.find(k2 => !picks[k2]) || 'confirm'
        set({ mapping: { ...m, columnRows, picks, step: nextStep } })
        get().toast(`${kind} 지정: ${sampleText || ''} (표 ${cell.row + 1}번째 줄)`, 'ok')
        return
      }
      // 상품 개수 N(≥2)이 입력된 경우: 각 항목(상품명·수량·주문금액·배송비)도 상품별로
      // N번 클릭해야 한다 — N개가 모이면 자동으로 다음 단계로 진행한다
      const need = parseInt(m.productCount, 10)
      const sample = { selector, sampleText }
      if (need >= 2) {
        const fieldSamples = { ...(m.fieldSamples || { name: [], qty: [], price: [], shipping: [] }) }
        fieldSamples[kind] = [...(fieldSamples[kind] || []), sample]
        const picks = { ...m.picks, [kind]: sample }
        const got = fieldSamples[kind].length
        const order = ['name', 'qty', 'price', 'shipping']
        const done = got >= need
        const nextStep = done ? (order[order.indexOf(kind) + 1] || 'confirm') : m.step
        set({ mapping: { ...m, fieldSamples, picks, step: nextStep } })
        get().toast(done
          ? `${kind} ${need}개 지정 완료${nextStep !== 'confirm' ? ' — 다음 항목을 선택하세요' : ' — 규칙 이름을 확인하고 저장하세요'}`
          : `${kind} ${got}/${need} 선택됨 — ${got + 1}번째 상품의 ${kind}을(를) 클릭하세요`, 'ok')
        return
      }
      const picks = { ...m.picks, [kind]: { selector, sampleText } }
      const order = ['name', 'qty', 'price', 'shipping']
      const nextStep = order.find(k2 => !picks[k2]) || 'confirm'
      set({ mapping: { ...m, picks, step: nextStep } })
      get().toast(`${kind} 지정: ${sampleText || selector}`, 'ok')
    }
  },

  async saveMapping() {
    const m = get().mapping
    if (!m || m.waiting) return
    const { rowSelector, picks, ruleName, ruleId, capturedDocId } = m
    let matchPattern = (m.matchPattern || '').trim()
    if (!matchPattern) {
      const doc = get().docs.find(d => d.id === capturedDocId)
      if (doc && doc.sourceUrl) {
        try { matchPattern = new URL(doc.sourceUrl).hostname } catch {}
      }
    }

    let rule
    if (m.orientation === 'column') {
      if (!m.tableSelector || m.columnRows.name == null || m.columnRows.price == null) {
        get().toast('열 모드에서는 표·상품명 줄·가격 줄이 필요합니다', 'err')
        return
      }
      rule = {
        id: ruleId,
        name: ruleName || ruleId,
        match: [matchPattern].filter(Boolean),
        orientation: 'column',
        tableSelector: m.tableSelector,
        firstProductCol: m.firstProductCol || 0,
        nameRow: m.columnRows.name,
        qtyRow: m.columnRows.qty,
        priceRow: m.columnRows.price,
        shippingRow: m.columnRows.shipping,
        priceIs: 'lineTotal',
        user: true,
        notes: '캡처 문서 클릭 매핑으로 생성됨 (열 구조)'
      }
    } else {
      if (!rowSelector || !picks.name || !picks.price) {
        get().toast('행/상품명/단가는 필수입니다', 'err')
        return
      }
      // 상품별 N샘플이 모이면 샘플들에서 공통 선택자를 도출한다 —
      // 한 상품만 클릭한 선택자는 :nth-of-type이 박혀 다른 상품을 누락시킨다
      const deriveSelector = (kind, fallback) => {
        const arr = (m.fieldSamples && m.fieldSamples[kind]) || []
        if (arr.length < 2) return fallback
        const stripped = arr.map(s => String(s.selector || '').replace(/:nth-of-type\(\d+\)/g, '').replace(/:nth-child\(\d+\)/g, ''))
        const uniq = [...new Set(stripped)]
        if (uniq.length === 1) return uniq[0]
        const segs = stripped.map(s => s.split(/\s*>\s*/).filter(Boolean))
        let common = segs[0]
        for (const seg of segs.slice(1)) {
          let k = 0
          while (k < common.length && k < seg.length && common[common.length - 1 - k] === seg[seg.length - 1 - k]) k++
          common = common.slice(common.length - k)
        }
        return common.length ? common.join(' > ') : stripped[stripped.length - 1]
      }
      const nameSel = deriveSelector('name', picks.name.selector)
      const qtySel = deriveSelector('qty', picks.qty && picks.qty.selector)
      const priceSel = deriveSelector('price', picks.price.selector)
      const shipSel = deriveSelector('shipping', picks.shipping && picks.shipping.selector)
      const nUsed = parseInt(m.productCount, 10)
      const nNote = nUsed >= 2 ? ` (상품 ${nUsed}개 클릭 매핑)` : ''
      rule = {
        id: ruleId,
        name: ruleName || ruleId,
        match: [matchPattern].filter(Boolean),
        rowSelector,
        priceIs: 'lineTotal',
        fields: {
          name: nameSel ? { sel: nameSel } : { sel: '' },
          qty: qtySel ? { sel: qtySel, regex: '(\\d+)' } : null,
          price: priceSel ? { sel: priceSel, regex: '([\\d,]+)' } : { sel: '', regex: '([\\d,]+)' }
        },
        shipping: shipSel
          ? { mode: 'selector', sel: shipSel, regex: '([\\d,]+)' }
          : { mode: 'none' },
        user: true,
        notes: `캡처 문서 클릭 매핑으로 생성됨${nNote}`
      }
    }

    const res = await window.api.saveUserRule(rule)
    if (res && res.error) {
      get().toast(res.error, 'err')
      return
    }
    await get().refreshRules()
    set({ mapping: null })
    if (capturedDocId) {
      await get().applyRule(capturedDocId, ruleId)
    }
  },

  cancelMapping() {
    set({ mapping: null })
  },

  async setupBrowsers() {
    const res = await window.api.setupBrowsers()
    if (!res || res.error) {
      get().toast(`연동 실패: ${(res && res.error) || '알 수 없는 오류'}`, 'err')
      return
    }
    const created = res.results.filter(r => r.status === 'shortcut-created')
    const bmOnly = res.results.filter(r => r.status === 'bookmarklet-only')
    const missing = res.results.filter(r => r.status === 'not-installed')
    for (const r of created) {
      get().toast(`${r.browser} 바로가기 생성 완료 (바탕화면: ${r.browser} - 품의 캡처)`, 'ok')
    }
    for (const r of bmOnly) {
      get().toast(`${r.browser} ${r.reason} → 북마크릿 사용 (설치 페이지 참고)`, 'warn')
    }
    if (missing.length) {
      get().toast(`미설치 브라우저: ${missing.map(r => r.browser).join(', ')}`, 'info')
    }
    if (res.installOpened) {
      get().toast('북마크릿 설치 페이지를 브라우저에서 열었습니다 — 파란 버튼을 북마크바로 드래그하세요', 'info')
    }
    if (!created.length && !bmOnly.length && !missing.length) {
      get().toast('연동할 브라우저를 찾지 못했습니다', 'warn')
    }
  },

  addRow() {
    const s = get()
    let docId = s.selectedDocId
    if (!docId && s.docs.length) docId = s.docs[s.docs.length - 1].id
    if (!docId) {
      const manual = withKeys({
        id: `manual-${Date.now()}`,
        fileName: '직접 입력',
        sourceUrl: '',
        mallName: '직접 입력',
        ruleId: null,
        itemCount: 0,
        shippingFee: null,
        rows: []
      })
      set({ docs: [...s.docs, manual], selectedDocId: manual.id })
      docId = manual.id
    }
    set(st => ({
      docs: st.docs.map(d => (d.id === docId
        ? {
            ...d,
            rows: [...d.rows, { docId, key: nextRowKey(), name: '', spec: '', unit: '개', qty: 1, unitPrice: 0, roundedPrice: 0, isShipping: false, note: '' }]
          }
        : d))
    }))
  },

  async addBookmarklets() {
    const res = await window.api.addBookmarklets()
    if (!res || res.canceled) return
    for (const r of (res.results || [])) {
      if (r.status === 'ok') {
        get().toast(`${r.browser}: 🛒품의캡처 북마크 ${r.already && !r.added ? '이미 등록됨' : '추가 완료'} (프로필 ${r.profiles}개, 제일 앞)`, 'ok')
      } else if (r.status === 'fail') {
        get().toast(`${r.browser}: 북마크 추가 실패 ${r.err || ''}`, 'err')
      } else {
        get().toast(`${r.browser}: 설치되지 않음 — 건너뛰기`, 'info')
      }
    }
  },

  async checkStartupStatus() {
    try {
      const res = await window.api.startupStatus()
      set({ startupStatus: res || {} })
    } catch {
      set({ startupStatus: {} })
    }
    return get().startupStatus
  },

  async registerStartup() {
    const res = await window.api.startupRegister()
    if (res && res.already) {
      await window.api.alertBox('등록 되어 있습니다.')
    } else if (res && res.error) {
      get().toast(`시작 프로그램 등록 실패: ${res.error}`, 'err')
    } else if (res && res.ok) {
      get().toast('시작 프로그램에 등록되었습니다 — Windows 시작 시 자동 실행됩니다', 'ok')
    }
    get().checkStartupStatus()
  },

  async removeStartup() {
    const res = await window.api.startupRemove()
    if (res && res.error) {
      get().toast(`시작 프로그램 삭제 실패: ${res.error}`, 'err')
    } else if (res && res.ok) {
      get().toast(res.none ? '등록된 시작 프로그램이 없습니다' : '시작 프로그램에서 삭제했습니다', 'info')
    }
    get().checkStartupStatus()
  },

  async removeUserRule(id) {
    await window.api.deleteUserRule(id)
    await get().refreshRules()
    get().toast(`규칙 "${id}" 삭제됨`, 'ok')
  },

  async renameRule(id, name) {
    const res = await window.api.renameRule(id, name)
    if (res && res.error) {
      get().toast(res.error, 'err')
      return
    }
    await get().refreshRules()
    get().toast(`규칙 이름을 "${name}"(으)로 변경했습니다`, 'ok')
  },

  async init() {
    await get().refreshRules()
    const settings = await window.api.getSettings()
    if (settings && settings.excelPath) {
      const res = await window.api.readExcel(settings.excelPath)
      if (!res.error) set({ excelPath: res.path, excelCount: res.rows.length })
    }
    if (settings && Number(settings.splitRatio) > 0) {
      set({ splitRatio: Math.min(0.85, Math.max(0.3, Number(settings.splitRatio))) })
    }
    if (settings && settings.showRuleAdd === true) {
      set({ showRuleAdd: true })
    }
    if (settings && Number(settings.zoomSensitivity) > 0) {
      set({ zoomSensitivity: Math.min(10, Math.max(0.5, Number(settings.zoomSensitivity))) })
    }
    if (settings && Number(settings.gridFontScale) > 0) {
      set({ gridFontScale: Math.min(3, Math.max(1, Number(settings.gridFontScale))) })
    }
    window.api.onMhtmlReceived(doc => {
      const m = get().mapping
      if (m && m.waiting) {
        get().beginMappingCapture(doc)
        return
      }
      // 네이버 장바구니는 확장(품의캡처 아이콘) 캡처만 지원 — 북마크릿/수동 저장은 거부 안내
      if (doc && doc.ruleId === 'naver-cart' && doc.captureChannel !== 'extension') {
        if (doc && doc.id) window.api.rejectDoc(doc.id)
        window.api.alertBox(RULE_REJECT_MESSAGES['naver-cart'])
        return
      }
      const itemRows = ((doc && doc.rows) || []).filter(r => !r.isShipping)
      if (!doc || doc.error || itemRows.length === 0) {
        if (doc && doc.id) window.api.rejectDoc(doc.id)
        const mallMsg = doc && doc.ruleId && RULE_REJECT_MESSAGES[doc.ruleId]
        window.api.alertBox(mallMsg || '주문서 상태에서 품의캡쳐 해주세요.')
        return
      }
      get().addDocs([doc])
      if (doc.checkedFallback) window.api.alertBox(CART_FALLBACK_NOTICE)
    })
    window.api.onBookmarkProgress(p => set({ bookmarkProgress: p }))
    if (typeof window !== 'undefined') window.__store = useStore
  }
}))
