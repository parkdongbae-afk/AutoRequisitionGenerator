import React from 'react'
import { useStore } from '../store'

export default function BookmarkProgress() {
  const p = useStore(s => s.bookmarkProgress)
  if (!p) return null
  const isClose = p.phase === 'close'
  const pct = p.total ? Math.min(100, Math.round(((p.index - (isClose ? 1 : 0)) / p.total) * 100)) : 10
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30">
      <div className="w-[360px] rounded-lg bg-white px-5 py-4 shadow-2xl">
        <div className="mb-2 text-[13px] font-bold text-slate-800">🛒 북마크바 추가 진행 중...</div>
        <div className="mb-2 text-[12px] text-slate-600">
          {isClose
            ? `${p.browser} 브라우저를 안전하게 종료하는 중...`
            : p.phase === 'verify'
              ? '북마크가 제일 앞에 있는지 확인하는 중...'
              : `${p.browser} 프로필 북마크 적용 중... (브라우저 ${p.index}/${p.total}${p.profiles ? `, 프로필 ${p.profiles}개` : ''})`}
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-blue-500 transition-all duration-300" style={{ width: `${Math.max(pct, 8)}%` }} />
        </div>
        <div className="mt-2 text-[11px] text-slate-400">창이나 브라우저를 만지지 말아주세요</div>
      </div>
    </div>
  )
}
