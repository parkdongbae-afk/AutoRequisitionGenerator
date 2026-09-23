import React from 'react'
import { useStore } from '../store'

const MARKUP_OPTIONS = [0, 3, 5, 7, 10, 15, 20, 25, 30, 50]

export default function StatusBar() {
  const docs = useStore(s => s.docs)
  const excelPath = useStore(s => s.excelPath)
  const excelCount = useStore(s => s.excelCount)
  const saveExcelAs = useStore(s => s.saveExcelAs)
  const priceMarkup = useStore(s => s.priceMarkup)
  const setPriceMarkup = useStore(s => s.setPriceMarkup)

  const itemCount = docs.reduce((n, d) => n + d.rows.filter(r => !r.isShipping).length, 0)
  const grandTotal = docs.reduce(
    (n, d) => n + d.rows.reduce((m, r) => m + (r.qty || 0) * (r.roundedPrice || 0), 0), 0
  )

  return (
    <footer className="flex items-center gap-4 border-t border-slate-300 bg-slate-800 px-4 py-2 text-[12px] text-slate-200">
      <span>MHTML <b className="text-white">{docs.filter(d => !d.excel).length}</b>개</span>
      <span>품목 <b className="text-white">{itemCount}</b>건</span>
      <span>총액 <b className="text-white">{grandTotal.toLocaleString()}원</b></span>
      <span className="truncate text-slate-400" style={{ maxWidth: 300 }}>
        {excelPath ? `엑셀: ${excelPath} (기존 ${excelCount}행)` : '엑셀 경로 미지정'}
      </span>
      <label className="ml-auto flex items-center gap-1.5" title="엑셀에 저장 시 예상단가에 반영됩니다 (배송비는 제외)">
        단가
        <select
          className="rounded border border-slate-500 bg-slate-700 px-1.5 py-1 text-white"
          value={priceMarkup}
          onChange={e => setPriceMarkup(e.target.value)}
        >
          {MARKUP_OPTIONS.map(v => (
            <option key={v} value={v}>{v}%</option>
          ))}
        </select>
        인상
      </label>
      <button
        className="rounded-md bg-blue-600 px-4 py-1.5 font-semibold text-white hover:bg-blue-500 active:bg-blue-700"
        onClick={saveExcelAs}
        title="저장 위치를 지정해 엑셀에 저장 — 선택한 파일의 기존 내용은 현재 표 내용으로 교체(.bak 백업), 배송비는 가격별 합산"
      >
        엑셀에 저장
      </button>
    </footer>
  )
}
