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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="max-h-[80%] w-[560px] overflow-auto rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-[14px] font-bold text-slate-800">🛠 규칙 관리</h2>
          <button className="rounded px-2 py-0.5 text-[12px] text-slate-400 hover:bg-slate-100" onClick={() => setRulesModal(false)}>✕ 닫기</button>
        </div>
        <div className="px-4 py-3">
          <div className="mb-2 text-[12px] text-slate-500">모든 규칙의 이름을 수정할 수 있습니다. 내장 규칙은 삭제할 수 없으며, 직접 만든 규칙만 삭제 가능합니다.</div>
          <div className="space-y-2">
            {rules.map(r => (
              <div key={r.id} className="flex items-center gap-3 rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="min-w-0 flex-1">
                  {editingId === r.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        className="w-full rounded border border-slate-300 px-2 py-1 text-[12.5px]"
                        value={editName}
                        autoFocus
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingId(null) }}
                      />
                      <button className="shrink-0 rounded bg-blue-600 px-2 py-1 text-[11.5px] font-medium text-white hover:bg-blue-500" onClick={commitEdit}>저장</button>
                      <button className="shrink-0 rounded border border-slate-300 px-2 py-1 text-[11.5px] text-slate-500 hover:bg-slate-100" onClick={() => setEditingId(null)}>취소</button>
                    </div>
                  ) : (
                    <>
                      <div className="text-[12.5px] font-semibold text-slate-700">
                        {r.name}
                        <span className={`ml-1.5 rounded px-1 py-px text-[10px] font-normal ${r.user ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>{r.user ? '사용자' : '내장'}</span>
                        <span className="ml-1 font-mono text-[11px] text-slate-400">({r.id})</span>
                      </div>
                      <div className="truncate text-[11px] text-slate-500">{(r.match || []).join(', ') || 'URL 패턴 없음'}</div>
                    </>
                  )}
                </div>
                {editingId !== r.id && (
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      className="rounded bg-blue-500 px-2.5 py-1 text-[11.5px] font-medium text-white hover:bg-blue-600"
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
