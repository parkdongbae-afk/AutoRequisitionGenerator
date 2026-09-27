import React, { useEffect, useState } from 'react'
import { useStore } from '../store'

const ROUND_MODES = [
  { id: 'ceil10', label: '올림' },
  { id: 'ceil100', label: '백원 단위 올림' },
  { id: 'ceil1000', label: '천원 단위 올림' }
]

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
  const roundMode = useStore(s => s.roundMode)
  const setRoundMode = useStore(s => s.setRoundMode)
  const halfMode = useStore(s => s.halfMode)
  const showRequisition = useStore(s => s.showRequisition)
  const adminShowStatusInfo = useStore(s => s.adminShowStatusInfo)
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    window.api.appVersion?.().then(v => setAppVersion(v || '')).catch(() => {})
  }, [])

  const itemCount = docs.reduce((n, d) => n + d.rows.length, 0)
  // 총액 = 품목 수량×예상단가 + 배송비 (백원/천원 올림은 엑셀 저장 시 반영되므로 여기서는 추출값 기준)
  const grandTotal = docs.reduce(
    (n, d) => n + d.rows.reduce((m, r) => m + (r.qty || 0) * (r.roundedPrice || 0), 0), 0
  )

  return (
    <footer
      className="app-statusbar flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#E2E8F0] bg-white px-5 py-2.5 text-[12px] text-[#334155]"
      style={{ zoom: 1.5 }}
    >
      {!halfMode && adminShowStatusInfo && <Chip label="MHTML" value={`${docs.filter(d => !d.excel).length}개`} />}
      {!halfMode && adminShowStatusInfo && (
        <span
          className="flex min-w-0 items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1 text-[12px] text-[#64748B]"
          style={{ maxWidth: 300 }}
        >
          <span className="truncate">
            {excelPath ? `엑셀: ${excelPath} (기존 ${excelCount}행)` : '엑셀 경로 미지정'}
          </span>
        </span>
      )}
      {/* 프로그램 버전 — 좌측 하단에 요란하지 않게 표시 */}
      <span className="text-[10px] text-[#CBD5E1]" title={`자동 품의 요구 생성기 v${appVersion}`}>
        v{appVersion}
      </span>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
        {/* 품목 칩 — 총액 칩과 동일한 강조 스타일 */}
        <span
          className="flex items-center gap-2 rounded-full border border-[#DDD9FC] bg-[#EEEDFE] px-4 py-1"
          title="배송비 행을 포함한 모든 품목 행 수"
        >
          <span className="text-[16px] text-[#4C3DE6]">품목</span>
          <b className="text-[16px] font-bold text-[#5B4DFB]">{itemCount}건</b>
        </span>
        <span
          className="flex items-center gap-2 rounded-full border border-[#DDD9FC] bg-[#EEEDFE] px-4 py-1"
          title="모든 문서 품목의 수량×예상단가 합계 + 배송비 (백원/천원 단위 올림은 엑셀 저장 시 반영)"
        >
          <span className="text-[16px] text-[#4C3DE6]">총액</span>
          <b className="text-[16px] font-bold text-[#5B4DFB]">{grandTotal.toLocaleString()}원</b>
        </span>
        {/* 단가 % 인상 대신 올림 단위 선택 — 백원/천원 선택 시 총액 안내 + 엑셀 저장 시 반영 */}
        <label className="flex items-center gap-1.5 text-[#64748B]" title="백원/천원 단위 올림 선택 시 상품 예상단가를 올림해 엑셀에 저장합니다">
          단가
          <select
            className="rounded-lg border border-[#E2E8F0] bg-white px-1.5 py-1 text-[#1E293B] transition-colors duration-150 hover:border-[#CBD5E1]"
            value={roundMode}
            onChange={e => setRoundMode(e.target.value)}
          >
            {ROUND_MODES.map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </label>
        <button
          className="rounded-[10px] bg-[#EEEDFE] px-5 py-2 text-[12.5px] font-bold text-[#5B4DFB] transition-all duration-150 hover:scale-[1.02] hover:bg-[#E0DCFD] active:scale-[1.0] active:bg-[#D5CFFC]"
          onClick={saveExcelAs}
          title="저장 위치를 지정해 엑셀에 저장 — 선택한 파일의 기존 내용은 현재 표 내용으로 교체(.bak 백업), 배송비는 가격별 합산, 백원/천원 올림 선택 시 예상단가에 반영"
        >
          엑셀에 저장
        </button>
        {showRequisition && (
          <button
            className="rounded-[10px] bg-[#EEEDFE] px-5 py-2 text-[12.5px] font-bold text-[#5B4DFB] transition-all duration-150 hover:scale-[1.02] hover:bg-[#E0DCFD] active:scale-[1.0] active:bg-[#D5CFFC]"
            onClick={() => window.api.openRequisitionWindow()}
            title="품의 개요 작성 프로그램 — 사업관리카드(예산) 선택과 메인 품목 데이터로 품의 개요를 자동 생성해 USE.TXT로 저장합니다"
          >
            품의 개요 작성
          </button>
        )}
      </div>
    </footer>
  )
}
