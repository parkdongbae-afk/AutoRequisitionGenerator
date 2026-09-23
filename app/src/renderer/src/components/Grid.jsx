import React, { useState } from 'react'
import { useStore } from '../store'

function EditableCell({ value, onChange, numeric, className }) {
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
      className="cursor-cell truncate px-1.5 py-1 hover:bg-blue-50 hover:ring-1 hover:ring-blue-300"
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

  const allRows = docs.flatMap(d => d.rows.map(r => ({ ...r, docId: d.id, fileName: d.fileName })))
  let no = 0

  const th = 'sticky top-0 z-10 border-b border-slate-300 bg-slate-100 px-2 py-1.5 text-left text-[11.5px] font-semibold text-slate-600'

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-2 py-1">
        <span className="text-[11.5px] font-semibold text-slate-500">추출 결과 (클릭하여 수정)</span>
        <button
          className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11.5px] text-slate-600 hover:bg-slate-100"
          onClick={addRow}
          title="빈 행을 추가합니다 (선택된 문서에 추가, 문서가 없으면 '직접 입력' 문서 생성)"
        >
          ＋ 행 추가
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full table-fixed border-collapse text-[12.5px]">
          <colgroup>
            <col style={{ width: '5%' }} />
            <col style={{ width: '36%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '4%' }} />
          </colgroup>
          <thead>
            <tr>
              <th className={th}>순번</th>
              <th className={th}>품목명</th>
              <th className={th}>규격</th>
              <th className={th}>단위</th>
              <th className={th}>수량</th>
              <th className={th}>예상단가</th>
              <th className={th}>총액</th>
              <th className={th}>비고</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {allRows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-[13px] text-slate-400">
                  추출된 품목이 없습니다. MHTML을 로드하면 자동으로 표시됩니다.
                </td>
              </tr>
            )}
            {allRows.map(r => {
              const hl = r.docId === selectedDocId
              return (
                <tr
                  key={r.key}
                  className={`border-b border-slate-100 ${r.isShipping ? 'row-shipping' : hl ? 'row-highlight' : 'bg-white'} ${r.source === 'excel' ? 'excel-source' : ''}`}
                  onClick={() => {
                    if (r.source === 'excel' && r.sourceRef && r.sourceRef.excelRowIndex) {
                      setExcelHighlight({ docId: r.docId, rowIndex: r.sourceRef.excelRowIndex })
                    }
                  }}
                >
                  <td className="px-1 py-1 text-center text-slate-400">{r.isShipping ? '🚚' : ++no}</td>
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
                  <td className="px-1.5 py-1 text-right font-medium">{((r.qty || 0) * (r.roundedPrice || 0)).toLocaleString()}원</td>
                  <td className="overflow-hidden">
                    <EditableCell value={r.note || ''} onChange={v => updateRow(r.docId, r.key, 'note', v)} />
                  </td>
                  <td className="text-center">
                    <button className="text-[11px] text-slate-300 hover:text-red-500" title="행 삭제" onClick={() => deleteRow(r.docId, r.key)}>✕</button>
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
