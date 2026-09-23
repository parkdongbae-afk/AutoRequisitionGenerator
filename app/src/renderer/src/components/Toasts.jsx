import React from 'react'
import { useStore } from '../store'

export default function Toasts() {
  const toasts = useStore(s => s.toasts)
  const border = { ok: 'border-l-[#22C55E]', err: 'border-l-[#EF4444]', warn: 'border-l-[#F59E0B]', info: 'border-l-[#5B4DFB]' }
  return (
    <div className="pointer-events-none fixed bottom-12 right-4 z-50 flex flex-col gap-2">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`rounded-xl bg-white px-3 py-2 text-[12.5px] text-[#1E293B] shadow-lg border border-[#E2E8F0] border-l-4 ${border[t.kind] || border.info}`}
        >
          {t.msg}
        </div>
      ))}
    </div>
  )
}
