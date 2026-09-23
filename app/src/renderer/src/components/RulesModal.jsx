import React, { useState } from 'react'
import { useStore } from '../store'

export default function RulesModal() {
  const setRulesModal = useStore(s => s.setRulesModal)
  const rules = useStore(s => s.rules)
  const removeUserRule = useStore(s => s.removeUserRule)
  const renameRule = useStore(s => s.renameRule)
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')

  const startEdit = (r) => {
    setEditingId(r.id)
    setEditName(r.name)
  }

  const commitEdit = async () => {
    if (!editName.trim()) return
    await renameRule(editingId, editName.trim())
    setEditingId(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="max-h-[80%] w-[560px] overflow-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-3">
          <h2 className="text-[14px] font-bold text-[#1E293B]">🛠 규칙 관리</h2>
          <button className="rounded px-2 py-0.5 text-[12px] text-[#94A3B8] hover:bg-[#F1F5F9]" onClick={() => setRulesModal(false)}>✕ 닫기</button>
        </div>
        <div className="px-4 py-3">
          <div className="mb-2 text-[12px] text-[#64748B]">모든 규칙의 이름을 수정할 수 있습니다. 내장 규칙은 삭제할 수 없으며, 직접 만든 규칙만 삭제 가능합니다.</div>
          <div className="space-y-2">
            {rules.map(r => (
              <div key={r.id} className="flex items-center gap-3 rounded border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2">
                <div className="min-w-0 flex-1">
                  {editingId === r.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        className="w-full rounded border border-[#E2E8F0] px-2 py-1 text-[12.5px]"
                        value={editName}
                        autoFocus
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingId(null) }}
                      />
                      <button className="shrink-0 rounded bg-[#5B4DFB] px-2 py-1 text-[11.5px] font-medium text-white hover:bg-[#4C3DE6]" onClick={commitEdit}>저장</button>
                      <button className="shrink-0 rounded border border-[#E2E8F0] px-2 py-1 text-[11.5px] text-[#64748B] hover:bg-[#F1F5F9]" onClick={() => setEditingId(null)}>취소</button>
                    </div>
                  ) : (
                    <>
                      <div className="text-[12.5px] font-semibold text-[#334155]">
                        {r.name}
                        <span className={`ml-1.5 rounded px-1 py-px text-[10px] font-normal ${r.user ? 'bg-[#E6F4EA] text-[#15803D]' : 'bg-[#F1F5F9] text-[#64748B]'}`}>{r.user ? '사용자' : '내장'}</span>
                        <span className="ml-1 font-mono text-[11px] text-[#94A3B8]">({r.id})</span>
                      </div>
                      <div className="truncate text-[11px] text-[#64748B]">{(r.match || []).join(', ') || 'URL 패턴 없음'}</div>
                    </>
                  )}
                </div>
                {editingId !== r.id && (
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      className="rounded bg-[#EEEDFE]0 px-2.5 py-1 text-[11.5px] font-medium text-white hover:bg-[#5B4DFB]"
                      onClick={() => startEdit(r)}
                    >
                      ✏️ 이름 수정
                    </button>
                    {r.user && (
                      <button
                        className="rounded bg-red-500 px-2.5 py-1 text-[11.5px] font-medium text-white hover:bg-red-600"
                        onClick={() => removeUserRule(r.id)}
                      >
                        삭제
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
