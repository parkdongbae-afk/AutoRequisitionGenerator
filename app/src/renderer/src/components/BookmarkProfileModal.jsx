import React, { useEffect, useState } from 'react'
import { useStore } from '../store'

// 북마크바 추가 대상 프로필 선택 — 확장 자동 설치 도구와 같은
// 브라우저 선택 + 프로필 목록 패턴(사용자 요구 2026-09-25).
// 기본값: 설치된 모든 브라우저의 모든 프로필이 보이고 전체 선택 상태.
export default function BookmarkProfileModal() {
  const setBookmarkModal = useStore(s => s.setBookmarkModal)
  const addBookmarklets = useStore(s => s.addBookmarklets)
  const [profiles, setProfiles] = useState(null)
  const [checked, setChecked] = useState({})
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.api.listBrowserProfiles().then(r => {
      if (!r || !r.ok) { setErr((r && r.error) || '프로필 목록을 읽지 못했습니다'); setProfiles([]); return }
      setProfiles(r.profiles || [])
      // 기본값은 모두 미선택 — 사용자가 추가할 프로필을 직접 고른다(2026-09-25 사용자 지정)
      setChecked({})
    })
  }, [])

  const toggle = (k) => setChecked(c => ({ ...c, [k]: !c[k] }))
  const toggleBrowser = (label, list) => {
    const allOn = list.every(p => checked[`${p.browser}|${p.dir}`])
    const next = { ...checked }
    for (const p of list) next[`${p.browser}|${p.dir}`] = !allOn
    setChecked(next)
  }
  const selection = () => Object.entries(checked).filter(([, v]) => v).map(([k]) => { const [browser, dir] = k.split('|'); return { browser, dir } })

  const submit = async () => {
    const sel = selection()
    if (!sel.length) return
    setBusy(true)
    setBookmarkModal(false)
    await addBookmarklets(sel)
    setBusy(false)
  }

  const groups = []
  if (profiles) {
    for (const p of profiles) {
      let g = groups.find(x => x.browser === p.browser)
      if (!g) { g = { browser: p.browser, browserLabel: p.browserLabel, list: [] }; groups.push(g) }
      g.list.push(p)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="max-h-[86%] w-[560px] overflow-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-3">
          <h2 className="text-[15px] font-bold text-[#1E293B]">⭐ 북마크바 추가 — 브라우저·프로필 선택</h2>
          <button className="rounded px-2 py-0.5 text-[13px] text-[#94A3B8] hover:bg-[#F1F5F9]" onClick={() => setBookmarkModal(false)}>✕ 닫기</button>
        </div>
        <div className="px-4 py-3">
          <div className="mb-2 text-[12.5px] text-[#64748B]">
            🛒품의캡처 북마크를 추가할 <b>브라우저의 프로필</b>을 선택하세요. 선택한 프로필에만 추가됩니다.
          </div>
          {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{err}</div>}
          {!profiles && !err && <div className="py-6 text-center text-[13px] text-[#64748B]">프로필을 읽는 중...</div>}
          {profiles && profiles.length === 0 && (
            <div className="rounded-lg border border-amber-200 bg-[#FEF3C7] px-3 py-2 text-[12.5px] text-[#B45309]">
              북마크가 있는 브라우저 프로필을 찾지 못했습니다. 브라우저를 1회 실행한 뒤 다시 시도해 주세요.
            </div>
          )}
          {groups.map(g => {
            const keys = g.list.map(p => `${p.browser}|${p.dir}`)
            const allOn = keys.every(k => checked[k])
            return (
              <div key={g.browser} className="mb-3 overflow-hidden rounded-xl border border-[#E2E8F0]">
                <div className="flex items-center justify-between bg-[#F8FAFC] px-3 py-2">
                  <span className="text-[13px] font-bold text-[#1E293B]">{g.browserLabel}</span>
                  <label className="flex cursor-pointer items-center gap-1.5 text-[11.5px] text-[#64748B]">
                    <input type="checkbox" checked={allOn} onChange={() => toggleBrowser(g.browser, g.list)} className="accent-[#5B4DFB]" />
                    전체선택
                  </label>
                </div>
                <div className="divide-y divide-[#F1F5F9]">
                  {g.list.map(p => {
                    const k = `${p.browser}|${p.dir}`
                    return (
                      <label key={k} className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-[#F8FAFC]">
                        <input type="checkbox" checked={!!checked[k]} onChange={() => toggle(k)} className="h-4 w-4 accent-[#5B4DFB]" />
                        <span className="text-[13px] text-[#1E293B]">{p.name}</span>
                        <span className="ml-auto rounded bg-[#F1F5F9] px-1.5 py-0.5 text-[10.5px] text-[#94A3B8]">{p.dir}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-[#E2E8F0] bg-white px-4 py-3">
          <button className="rounded-md border border-[#E2E8F0] bg-white px-4 py-2 text-[13px] text-[#334155] hover:bg-[#F1F5F9]" onClick={() => setBookmarkModal(false)}>취소</button>
          <button
            className="rounded-md bg-[#5B4DFB] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#4C3DE6] disabled:opacity-50"
            disabled={busy || !selection().length}
            onClick={submit}
          >선택한 프로필에 추가 ({selection().length})</button>
        </div>
      </div>
    </div>
  )
}
