import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'

const MAX_ROWS = 2000
const MAX_COLS = 50

function colLetter(n) {
  let s = ''
  n += 1
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function buildMergeMap(merges) {
  const origin = new Map()
  const covered = new Set()
  for (const mg of merges || []) {
    const s = mg.s || mg
    const e = mg.e || mg
    if (s.r == null || s.c == null) continue
    origin.set(`${s.r}:${s.c}`, { rowspan: e.r - s.r + 1, colspan: e.c - s.c + 1 })
    for (let r = s.r; r <= (e.r || s.r); r++) {
      for (let c = s.c; c <= (e.c || s.c); c++) {
        if (r === s.r && c === s.c) continue
        covered.add(`${r}:${c}`)
      }
    }
  }
  return { origin, covered }
}

export default function ExcelView({ doc }) {
  const zoom = useStore(s => s.zoom)
  const highlight = useStore(s => s.excelHighlight)
  const [sheetIdx, setSheetIdx] = useState(doc.excel.sheetIndex || 0)
  const tableRef = useRef(null)
  const [flashRow, setFlashRow] = useState(null)

  const sheet = doc.excel.sheets[sheetIdx] || { rows: [], merges: [], cols: [], name: '?' }
  const { origin, covered } = useMemo(() => buildMergeMap(sheet.merges), [sheet])

  const rowCount = Math.min(sheet.rows.length, MAX_ROWS)
  const colCount = Math.min(
    Math.max(1, ...sheet.rows.slice(0, rowCount).map(r => (r || []).length)),
    MAX_COLS
  )
  const truncated = sheet.rows.length > MAX_ROWS || colCount >= MAX_COLS

  const headerRow = doc.excel.sheetIndex === sheetIdx ? doc.excel.headerRow : -1

  useEffect(() => {
    if (!highlight || highlight.docId !== doc.id) return
    setFlashRow(highlight.rowIndex)
    const t = setTimeout(() => setFlashRow(null), 2500)
    try {
      const el = tableRef.current && tableRef.current.querySelector(`tr[data-excel-row="${highlight.rowIndex}"]`)
      if (el) el.scrollIntoView({ block: 'center' })
    } catch {}
    return () => clearTimeout(t)
  }, [highlight, doc.id])

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex items-center gap-2 border-b border-[#E2E8F0] bg-[#F8FAFC] px-2 py-1 text-[11.5px] text-[#64748B]">
        <span className="font-semibold">📑 {doc.excel.filePath.split(/[\\/]/).pop()}</span>
        {doc.excel.sheets.length > 1 && (
          <select
            className="rounded border border-[#E2E8F0] bg-white px-1 py-0.5 text-[11px]"
            value={sheetIdx}
            onChange={e => setSheetIdx(Number(e.target.value))}
          >
            {doc.excel.sheets.map((s, i) => (
              <option key={i} value={i}>{s.name}</option>
            ))}
          </select>
        )}
        <span className="text-[#94A3B8]">읽기 전용 · 수정은 우측 표에서</span>
      </div>
      {truncated && (
        <div className="border-b border-yellow-200 bg-yellow-50 px-2 py-1 text-[11px] text-yellow-700">
          표시 범위 초과: 상위 {MAX_ROWS}행까지만 표시
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto bg-[#F1F5F9] p-2">
        <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: `${100 / zoom}%` }}>
          <table ref={tableRef} className="border-collapse text-[12px]" style={{ fontFamily: "'Malgun Gothic', sans-serif" }}>
            <thead>
              <tr>
                <th className="sticky top-0 z-10 border border-[#E2E8F0] bg-[#E2E8F0] px-1.5 py-1 text-[10px] text-[#64748B]" />
                {Array.from({ length: colCount }, (_, c) => (
                  <th key={c} className="sticky top-0 z-10 border border-[#E2E8F0] bg-[#E2E8F0] px-2 py-1 text-[10.5px] font-semibold text-[#64748B]">{colLetter(c)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rowCount }, (_, r) => {
                const isHeader = r === headerRow
                const excelRowNo = r + 1
                const dataStart = headerRow >= 0 && sheetIdx === (doc.excel.sheetIndex || 0) ? headerRow + 1 : -1
                const isDataRow = dataStart > 0 && r >= dataStart
                return (
                  <tr
                    key={r}
                    data-excel-row={isDataRow ? excelRowNo : undefined}
                    className={`${isHeader ? 'detected-header' : ''} ${flashRow === excelRowNo ? 'active-row' : ''}`}
                    style={isHeader ? { boxShadow: 'inset 0 -2px 0 #2563eb' } : flashRow === excelRowNo ? { background: '#fff4cc' } : undefined}
                  >
                    <td className="border border-[#E2E8F0] bg-[#F1F5F9] px-1.5 py-1 text-right text-[10px] text-[#94A3B8]">{excelRowNo}</td>
                    {Array.from({ length: colCount }, (_, c) => {
                      const key = `${r}:${c}`
                      if (covered.has(key)) return null
                      const m = origin.get(key)
                      const raw = (sheet.rows[r] || [])[c]
                      const text = raw == null ? '' : String(raw)
                      const numeric = text !== '' && !Number.isNaN(Number(text.replace(/,/g, '')))
                      return (
                        <td
                          key={c}
                          rowSpan={m ? m.rowspan : 1}
                          colSpan={m ? m.colspan : 1}
                          className={`border border-[#E2E8F0] px-2 py-1 ${numeric ? 'text-right' : 'text-left'} ${r < 0 ? '' : ''}`}
                          style={{ maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {numeric ? Number(text.replace(/,/g, '')).toLocaleString() : text}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
