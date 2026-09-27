import React, { useState } from 'react'
import { useStore } from '../store'

export default function TeacherNameModal() {
  const setTeacherNameModal = useStore(s => s.setTeacherNameModal)
  const saveTeacherNameAndSaveExcel = useStore(s => s.saveTeacherNameAndSaveExcel)
  const [name, setName] = useState('')
  const [err, setErr] = useState('')

  const submit = () => {
    const v = name.trim().replace(/[\\/:*?"<>|]/g, '')
    if (!v) { setErr('성함을 입력해 주세요'); return }
    saveTeacherNameAndSaveExcel(v)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="w-[560px] max-w-full rounded-2xl bg-white shadow-2xl" style={{ zoom: 1.5 }}>
        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-3">
          <h2 className="text-[15px] font-bold text-[#1E293B]">이름을 입력해 주세요</h2>
          <button className="rounded px-2 py-0.5 text-[13px] text-[#94A3B8] hover:bg-[#F1F5F9]" onClick={() => setTeacherNameModal(false)}>✕</button>
        </div>
        <div className="px-4 py-4">
          <p className="text-[12.5px] text-[#475569]">업무 자동화에 협조해 주셔서 감사합니다.</p>
          <label className="mt-3 block text-[12.5px] font-semibold text-[#1E293B]">
            성함
            <input
              type="text"
              autoFocus
              value={name}
              onChange={e => { setName(e.target.value); setErr('') }}
              onKeyDown={e => { if (e.key === 'Enter') submit() }}
              placeholder="예: 홍길동"
              maxLength={30}
              className="mt-1 w-full rounded-md border border-[#E2E8F0] bg-white px-2 py-1.5 text-[13px] text-[#1E293B] focus:border-[#5B4DFB] focus:outline-none"
            />
          </label>
          {err && <p className="mt-1 text-[11.5px] font-semibold text-red-600">{err}</p>}
          <p className="mt-1.5 text-[11.5px] text-[#64748B]">
            입력하신 성함은 엑셀 기본 파일명(예: 홍길동-품목내역(통합).xls)과 행정실용 시트 안내문에 사용됩니다. 설정에서 언제든 수정할 수 있습니다.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              className="rounded-md border border-[#E2E8F0] bg-white px-4 py-2 text-[13px] font-semibold text-[#334155] hover:bg-[#F1F5F9]"
              onClick={() => setTeacherNameModal(false)}
            >
              취소
            </button>
            <button
              className="rounded-md bg-[#5B4DFB] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#4C3DE6]"
              onClick={submit}
            >
              저장 후 엑셀에 저장
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
