import React from 'react'
import { useStore } from '../store'

export default function Toasts() {
  const toasts = useStore(s => s.toasts)
  const color = { ok: 'bg-emerald-600', err: 'bg-red-600', warn: 'bg-amber-500', info: 'bg-slate-700' }
  return (
    <div className="pointer-events-none fixed bottom-12 right-4 z-50 flex flex-col gap-2">
      {toasts.map(t => (
        <div key={t.id} className={`rounded-md px-3 py-2 text-[12.5px] text-white shadow-lg ${color[t.kind] || color.info}`}>
          {t.msg}
        </div>
      ))}
    </div>
  )
}
