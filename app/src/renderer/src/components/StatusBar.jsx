import React from 'react'
import { useStore } from '../store'

const MARKUP_OPTIONS = [0, 3, 5, 7, 10, 15, 20, 25, 30, 50]

function Chip({ label, value, title }) {
  return (
    <span
      className="flex items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1 text-[12px]"
      title={title}
    >
      <span className="text-[#64748B]">{label}</span>
      <b className="font-semibold text-[#1E293B]">{value}</b>
    </span>
  )
}

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
    <footer className="flex items-center gap-3 border-t border-[#E2E8F0] bg-white px-5 py-2.5 text-[12px] text-[#334155]">
      <Chip label="MHTML" value={`${docs.filter(d => !d.excel).length}개`} />
      <Chip label="품목" value={`${itemCount}건`} />
      <Chip label="총액" value={`${grandTotal.toLocaleString()}원`} />
      <span
        className="flex min-w-0 items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1 text-[12px] text-[#64748B]"
        style={{ maxWidth: 300 }}
      >
        <span className="truncate">
          {excelPath ? `엑셀: ${excelPath} (기존 ${excelCount}행)` : '엑셀 경로 미지정'}
        </span>
      </span>
      <label className="ml-auto flex items-center gap-1.5 text-[#64748B]" title="엑셀에 저장 시 예상단가에 반영됩니다 (배송비는 제외)">
        단가
        <select
          className="rounded-lg border border-[#E2E8F0] bg-white px-1.5 py-1 text-[#1E293B] transition-colors duration-150 hover:border-[#CBD5E1]"
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
        className="rounded-[10px] bg-[#5B4DFB] px-5 py-2 text-[12.5px] font-bold text-white transition-all duration-150 hover:scale-[1.02] hover:bg-[#4C3DE6] active:scale-[1.0] active:bg-[#4234CC]"
        onClick={saveExcelAs}
        title="저장 위치를 지정해 엑셀에 저장 — 선택한 파일의 기존 내용은 현재 표 내용으로 교체(.bak 백업), 배송비는 가격별 합산"
      >
        엑셀에 저장
      </button>
    </footer>
  )
}
