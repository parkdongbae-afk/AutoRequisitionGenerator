import React, { useRef, useState } from 'react'
import { useStore } from '../store'

const BASE_FONT = 12.5
// 쇼핑몰 / 순번 / 품목명 / 규격 / 단위 / 수량 / 예상단가 / 총액 / 비고 / 삭제
const DEFAULT_WIDTHS = [110, 56, 300, 110, 70, 64, 96, 104, 130, 44]

function EditableCell({ value, onChange, numeric }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (editing) {
    return (
      <input
        className="cell-input"
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); onChange(numeric ? String(draft).replace(/[^\d]/g, '') : draft) }}
        onKeyDown={e => {
          if (e.key === 'Enter') { setEditing(false); onChange(numeric ? String(draft).replace(/[^\d]/g, '') : draft) }
          if (e.key === 'Escape') { setEditing(false); setDraft(value) }
        }}
      />
    )
  }
  return (
    <div
      className="cursor-cell truncate px-1.5 py-1 hover:bg-[#EEEDFE] hover:ring-1 hover:ring-[#C9C3FC]"
      onClick={() => { setDraft(value); setEditing(true) }}
      title="클릭하여 수정"
    >
      {numeric ? Number(value || 0).toLocaleString() : (value || '')}
    </div>
  )
}

export default function Grid() {
  const docs = useStore(s => s.docs)
  const selectedDocId = useStore(s => s.selectedDocId)
  const updateRow = useStore(s => s.updateRow)
  const deleteRow = useStore(s => s.deleteRow)
  const addRow = useStore(s => s.addRow)
  const setExcelHighlight = useStore(s => s.setExcelHighlight)
  const gridFontScale = useStore(s => s.gridFontScale)
  const deleteDuplicateRows = useStore(s => s.deleteDuplicateRows)
  const toast = useStore(s => s.toast)

  const [colWidths, setColWidths] = useState(DEFAULT_WIDTHS)
  const resizeRef = useRef(null)

  const startResize = (i, e) => {
    e.preventDefault()
    e.stopPropagation()
    resizeRef.current = { i, startX: e.clientX, startW: colWidths[i] }
    const onMove = (ev) => {
      const r = resizeRef.current
      if (!r) return
      const w = Math.max(36, r.startW + ev.clientX - r.startX)
      setColWidths(ws => ws.map((x, j) => (j === r.i ? w : x)))
    }
    const onUp = () => {
      resizeRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const allRows = docs.flatMap(d => d.rows.map(r => ({ ...r, docId: d.id, mallName: d.mallName })))
  // 중복 감지: 같은 쇼핑몰 + 같은 품목명/규격/수량/단가(배송비 포함) — 같은 장바구니를
  // 2번 추출하면 행 전체가 이 그룹에 걸린다. 그룹의 삭제 버튼을 누르면 첫 1세트만 남긴다
  const dupGroupMap = new Map()
  for (const r of allRows) {
    const name = (r.name || '').replace(/\s+/g, ' ').trim()
    if (!name) continue
    const k = `${r.mallName}|${name}|${(r.spec || '').trim()}|${r.qty}|${r.roundedPrice}|${!!r.isShipping}`
    let arr = dupGroupMap.get(k)
    if (!arr) { arr = []; dupGroupMap.set(k, arr) }
    arr.push(r)
  }
  const dupKeyByRowKey = new Map()
  for (const [k, arr] of dupGroupMap) {
    if (arr.length >= 2) for (const r of arr) dupKeyByRowKey.set(r.key, k)
  }
  const deleteDuplicate = (k) => {
    const arr = dupGroupMap.get(k)
    if (!arr || arr.length < 2) return
    deleteDuplicateRows(arr.slice(1).map(r => ({ docId: r.docId, key: r.key })))
    toast(`중복 항목 ${arr.length - 1}행을 삭제했습니다 (첫 1세트 유지)`, 'ok')
  }

  // 쇼핑몰 열 셀 병합: 문서별 행 수와 각 행의 문서 내 위치(첫 행 여부)를 계산
  const docRowCount = {}
  for (const r of allRows) docRowCount[r.docId] = (docRowCount[r.docId] || 0) + 1
  const docSeen = {}
  const rowSpanByIndex = allRows.map(r => {
    if (docSeen[r.docId] !== undefined) return 0
    docSeen[r.docId] = true
    return docRowCount[r.docId]
  })

  let no = 0
  const fontPx = BASE_FONT * (Number(gridFontScale) || 1.5)
  const th = 'sticky top-0 z-10 border-b border-[#E2E8F0] bg-[#F8FAFC] px-2 py-2.5 text-left font-semibold text-[#475569]'

  const headers = ['쇼핑몰', '순번', '품목명', '규격', '단위', '수량', '예상단가', '총액', '비고', '']
  const totalW = colWidths.reduce((a, b) => a + b, 0)

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-white">
      <div className="flex items-center justify-between border-b border-[#E2E8F0] bg-white px-3 py-2">
        <span className="text-[13px] font-bold text-[#1E293B]">
          추출 결과 <span className="text-[11.5px] font-medium text-[#94A3B8]">(클릭하여 수정 · 열 경계를 드래그하면 폭 조절)</span>
        </span>
        <button
          className="rounded-full bg-[#EEEDFE] px-3 py-1 text-[11.5px] font-semibold text-[#5B4DFB] transition-colors duration-150 hover:bg-[#E0DCFD]"
          onClick={addRow}
          title="빈 행을 추가합니다 (선택된 문서에 추가, 문서가 없으면 '직접 입력' 문서 생성)"
        >
          ＋ 행 추가
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="border-collapse" style={{ width: totalW, fontSize: `${fontPx}px`, tableLayout: 'fixed' }}>
          <colgroup>
            {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} className={`${th} relative`} style={i < colWidths.length ? { width: colWidths[i] } : undefined}>
                  {h}
                  {i < colWidths.length - 1 && (
                    <span
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none bg-transparent hover:bg-[#C9C3FC]"
                      title="드래그하여 열 폭 조절"
                      onMouseDown={e => startResize(i, e)}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allRows.length === 0 && (
              <tr>
                <td colSpan={headers.length} className="px-3 py-10 text-center">
                  <div className="flex flex-col items-center gap-2 text-[#64748B]">
                    <svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden="true">
                      <rect x="8" y="16" width="34" height="44" rx="6" fill="#EEEDFE" />
                      <rect x="14" y="26" width="22" height="4" rx="2" fill="#C9C3FC" />
                      <rect x="14" y="35" width="22" height="4" rx="2" fill="#C9C3FC" />
                      <rect x="14" y="44" width="14" height="4" rx="2" fill="#DDD9FC" />
                      <path d="M46 38l10-8 10 8v22a4 4 0 0 1-4 4H50a4 4 0 0 1-4-4V38z" fill="#5B4DFB" opacity="0.9" />
                      <rect x="58" y="30" width="30" height="36" rx="5" fill="#DDD9FC" />
                      <rect x="63" y="38" width="20" height="3.5" rx="1.75" fill="#fff" opacity="0.9" />
                      <rect x="63" y="45" width="20" height="3.5" rx="1.75" fill="#fff" opacity="0.7" />
                      <rect x="63" y="52" width="12" height="3.5" rx="1.75" fill="#fff" opacity="0.7" />
                    </svg>
                    추출된 품목이 없습니다. MHTML을 로드하면 자동으로 표시됩니다.
                  </div>
                </td>
              </tr>
            )}
            {allRows.map((r, idx) => {
              const hl = r.docId === selectedDocId
              const span = rowSpanByIndex[idx]
              return (
                <tr
                  key={r.key}
                  className={`border-b border-[#F1F5F9] transition-colors duration-100 hover:bg-[#F8FAFC] ${r.isShipping ? 'row-shipping' : hl ? 'row-highlight' : 'bg-white'} ${r.source === 'excel' ? 'excel-source' : ''}`}
                  onClick={() => {
                    if (r.source === 'excel' && r.sourceRef && r.sourceRef.excelRowIndex) {
                      setExcelHighlight({ docId: r.docId, rowIndex: r.sourceRef.excelRowIndex })
                    }
                  }}
                >
                  {span > 0 && (
                    <td
                      rowSpan={span}
                      className="border-r border-[#E2E8F0] px-1.5 py-1 align-middle text-center font-semibold text-[#5B4DFB]"
                      title={r.mallName}
                    >
                      <div className="break-keep leading-tight">{r.mallName}</div>
                    </td>
                  )}
                  <td className="px-1 py-1 text-center text-[#94A3B8]">{r.isShipping ? '🚚' : ++no}</td>
                  <td className="overflow-hidden">
                    <EditableCell value={r.name} onChange={v => updateRow(r.docId, r.key, 'name', v)} />
                  </td>
                  <td className="overflow-hidden">
                    <EditableCell value={r.spec} onChange={v => updateRow(r.docId, r.key, 'spec', v)} />
                  </td>
                  <td className="overflow-hidden">
                    <EditableCell value={r.unit} onChange={v => updateRow(r.docId, r.key, 'unit', v)} />
                  </td>
                  <td className="overflow-hidden text-right">
                    <EditableCell value={r.qty} numeric onChange={v => updateRow(r.docId, r.key, 'qty', v)} />
                  </td>
                  <td className="overflow-hidden text-right">
                    <EditableCell value={r.roundedPrice} numeric onChange={v => updateRow(r.docId, r.key, 'roundedPrice', v)} />
                  </td>
                  <td className="px-1.5 py-1 text-right font-medium text-[#1E293B]">{((r.qty || 0) * (r.roundedPrice || 0)).toLocaleString()}원</td>
                  <td className="overflow-hidden">
                    <EditableCell value={r.note || ''} onChange={v => updateRow(r.docId, r.key, 'note', v)} />
                  </td>
                  <td className="text-center">
                    {dupKeyByRowKey.has(r.key) ? (
                      <button
                        className="whitespace-nowrap rounded bg-[#FEE2E2] px-1.5 py-0.5 font-semibold text-red-600 transition-colors duration-100 hover:bg-red-500 hover:text-white"
                        title="중복된 항목 — 첫 1세트만 남기고 나머지를 삭제합니다"
                        onClick={() => deleteDuplicate(dupKeyByRowKey.get(r.key))}
                      >
                        중복삭제
                      </button>
                    ) : (
                      <button className="text-[#CBD5E1] transition-colors duration-100 hover:text-red-500" title="행 삭제" onClick={() => deleteRow(r.docId, r.key)}>✕</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
