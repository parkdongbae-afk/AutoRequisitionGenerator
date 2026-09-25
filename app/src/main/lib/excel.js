import XLSX from 'xlsx'
import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_SHEET = '품목내역'

export function defaultExcelPath() {
  const desktop = path.join(app_home(), 'Desktop', 'Automatic_generation_of_approval_requests_html', '품목내역(통합).xls')
  return desktop
}

function app_home() {
  return process.env.USERPROFILE || process.env.HOME || '.'
}

export function readExcelRows(filePath) {
  const wb = XLSX.readFile(filePath)
  const name = wb.SheetNames.includes(DEFAULT_SHEET) ? DEFAULT_SHEET : wb.SheetNames[0]
  const ws = wb.Sheets[name]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  let headerIdx = -1
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i] || []
    if (r.includes('내용') || r.includes('품목명')) { headerIdx = i; break }
  }
  const headers = headerIdx >= 0 ? rows[headerIdx] : ['내용', '규격', '단위', '수량', '예상단가']
  const dataRows = rows.slice(headerIdx + 1).filter(r => (r || []).some(c => c != null && String(c).trim() !== ''))
  return { sheetName: name, headers: headers.slice(0, 5), rows: dataRows, headerIdx }
}

// 배송비 행은 가격별로 합산: 3000원x1 + 3000원x2 + 4000원x1 → 3000원x3, 4000원x1
function aggregateShipping(rows) {
  const items = []
  const fees = new Map()
  for (const r of rows || []) {
    if (r && r.isShipping) {
      const price = Number(r.price) || 0
      const qty = Number(r.qty) || 0
      if (price <= 0 || qty <= 0) continue
      fees.set(price, (fees.get(price) || 0) + qty)
    } else {
      items.push(r)
    }
  }
  const feeRows = [...fees.entries()].sort((a, b) => a[0] - b[0]).map(([price, qty]) => ({
    name: '배송비', spec: '', unit: '식', qty, price
  }))
  return [...items, ...feeRows]
}

// 사용자 환경에 따라 서식 파일이 .xlsx로 저장되어 있을 수 있다 — 확장자에 맞는 형식으로 쓴다
// (.xlsx 경로에 biff8을 쓰면 Excel이 "확장자가 잘못됨"으로 열지 못한다)
const bookTypeOf = (filePath) => (/\.xlsx$/i.test(filePath) ? 'xlsx' : 'biff8')

export function appendRows(filePath, newRows, { backup = true } = {}) {
  const wb = XLSX.readFile(filePath)
  const name = wb.SheetNames.includes(DEFAULT_SHEET) ? DEFAULT_SHEET : wb.SheetNames[0]
  const ws = wb.Sheets[name]
  const existing = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  let lastRow = 0
  for (let i = 0; i < existing.length; i++) {
    if ((existing[i] || []).some(c => c != null && String(c).trim() !== '')) lastRow = i
  }
  const merged = aggregateShipping(newRows)
  const aoa = merged.map(r => [r.name, r.spec || '', r.unit || '개', Number(r.qty) || 0, Number(r.price) || 0])
  XLSX.utils.sheet_add_aoa(ws, aoa, { origin: lastRow + 1 })

  if (backup && fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, filePath + '.bak')
  }
  XLSX.writeFile(wb, filePath, { bookType: bookTypeOf(filePath) })
  const after = readExcelRows(filePath)
  return { appended: aoa.length, totalRows: after.rows.length, sheetName: name }
}

export function createNewWorkbook(filePath) {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([['내용', '규격', '단위', '수량', '예상단가']])
  XLSX.utils.book_append_sheet(wb, ws, DEFAULT_SHEET)
  XLSX.writeFile(wb, filePath, { bookType: bookTypeOf(filePath) })
  return filePath
}

const HEADER_ALIASES = {
  name: ['내용', '품목명', '품명', '품목', '상품명', '물품명'],
  spec: ['규격', '사양', '옵션', '모델'],
  unit: ['단위'],
  qty: ['수량', '량', '개수'],
  unitPrice: ['예상단가', '단가', '예정단가', '추정단가'],
  note: ['비고', '메모', '참고'],
  seq: ['순번', '번호', 'no', 'no.', '연번'],
  amount: ['총액', '금액', '합계금액', '예상금액']
}

const norm = (v) => String(v == null ? '' : v).replace(/[\s\n\r]+/g, '').toLowerCase()

function detectHeader(rows) {
  const limit = Math.min(rows.length, 30)
  for (let r = 0; r < limit; r++) {
    const cols = {}
    let matched = 0
    for (let c = 0; c < (rows[r] || []).length; c++) {
      const cell = norm((rows[r] || [])[c])
      if (!cell) continue
      for (const field of Object.keys(HEADER_ALIASES)) {
        if (cols[field] != null) continue
        if (HEADER_ALIASES[field].some(a => norm(a) === cell)) {
          cols[field] = c
          matched++
          break
        }
      }
    }
    if (matched >= 3 && cols.name != null) return { headerRow: r, cols }
  }
  return null
}

function toInt(v) {
  const digits = String(v == null ? '' : v).replace(/[^\d.-]/g, '')
  if (!digits || /^[-.]+$/.test(digits)) return null
  const n = Math.round(parseFloat(digits))
  return Number.isFinite(n) ? n : null
}

function parseSheetItems(rows, headerRow, cols) {
  const items = []
  let blank = 0
  const end = Math.min(rows.length, headerRow + 1 + 20000)
  for (let r = headerRow + 1; r < end; r++) {
    const row = rows[r] || []
    const get = (field) => (cols[field] != null ? row[cols[field]] : null)
    const name = String(get('name') == null ? '' : get('name')).trim().replace(/\s*\n\s*/g, ' ')
    const qtyRaw = get('qty')
    const priceRaw = get('unitPrice')
    const unit = String(get('unit') == null ? '' : get('unit')).trim()
    const note = String(get('note') == null ? '' : get('note')).trim().replace(/\s*\n\s*/g, ' ')
    const spec = String(get('spec') == null ? '' : get('spec')).trim().replace(/\s*\n\s*/g, ' ')
    const isEmptyRow = (row || []).every(c => c == null || String(c).trim() === '')
    if (isEmptyRow) {
      blank++
      if (blank >= 3) break
      continue
    }
    blank = 0
    if (/^\s*(총\s*)?(합|소)?계\s*$/.test(name)) break
    if (!name && qtyRaw == null && priceRaw == null) continue
    const isShipping = /배송비|배송료|택배비|운임/.test(name) || (unit === '식' && /배송/.test(name))
    const qty = toInt(qtyRaw) != null ? toInt(qtyRaw) : 1
    const price = toInt(priceRaw) != null ? toInt(priceRaw) : 0
    items.push({
      name: name || '배송비',
      spec: isShipping ? '' : spec,
      unit: unit || (isShipping ? '식' : '개'),
      qty: qty || 1,
      unitPrice: price,
      roundedPrice: price,
      isShipping,
      note,
      source: 'excel',
      sourceRef: { excelRowIndex: r + 1 }
    })
  }
  return items
}

export function loadExcelFull(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: false })
  const sheets = wb.SheetNames.map(name => {
    const ws = wb.Sheets[name]
    return {
      name,
      rows: XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: null }),
      merges: ws['!merges'] || [],
      cols: ws['!cols'] || []
    }
  })
  let picked = null
  for (let i = 0; i < sheets.length; i++) {
    const det = detectHeader(sheets[i].rows)
    if (det) {
      picked = {
        sheetIndex: i,
        sheetName: sheets[i].name,
        headerRow: det.headerRow,
        items: parseSheetItems(sheets[i].rows, det.headerRow, det.cols)
      }
      break
    }
  }
  return { filePath, sheets, picked }
}
