import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import {
  REQUISITION_TYPES, typeById, fillTemplate, removeHeadingLine, applyLineShift,
  accountDisplay, inferPurpose, findPurposeCandidates, GIBON_FALLBACK, EXAMPLES, REFERENCE_SOURCE
} from '../lib/requisition'

function ExamplesModal({ onClose }) {
  const [tab, setTab] = useState('buy')
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/30">
      <div className="max-h-[90%] w-[760px] max-w-full overflow-auto rounded-2xl bg-white shadow-2xl">
        <div style={{ zoom: 1.5 }}>
          <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-3">
            <h3 className="text-[14px] font-bold text-[#1E293B]">📖 품의 유형별 표준 작성 예시 참조</h3>
            <button className="rounded px-2 py-0.5 text-[13px] text-[#94A3B8] hover:bg-[#F1F5F9]" onClick={onClose}>✕</button>
          </div>
          <div className="flex gap-2 px-4 pt-3">
            {REQUISITION_TYPES.map(t => (
              <button
                key={t.id}
                className={`rounded-t-lg px-3 py-1.5 text-[12.5px] font-bold transition-colors duration-150 ${
                  tab === t.id ? 'bg-[#EEEDFE] text-[#4C3DE6]' : 'text-[#64748B] hover:bg-[#F1F5F9]'
                }`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="px-4 pb-4">
            <pre className="whitespace-pre-wrap rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-[12.5px] leading-6 text-[#1E293B]">
{EXAMPLES[tab]}
            </pre>
          </div>
          <div className="flex justify-end border-t border-[#E2E8F0] px-4 py-3">
            <button
              className="rounded-md border border-[#E2E8F0] bg-white px-4 py-1.5 text-[12.5px] font-semibold text-[#334155] hover:bg-[#F1F5F9]"
              onClick={onClose}
            >
              닫기 (Close)
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ReferenceModal({ onClose }) {
  const toast = useStore(s => s.toast)
  const [files, setFiles] = useState(null)

  useEffect(() => {
    let alive = true
    window.api.listReferenceFiles().then(res => {
      if (!alive) return
      if (res && res.error) {
        toast(`참고 자료 폴더를 찾을 수 없습니다 — ${res.error}`, 'err', 6000)
        setFiles([])
        return
      }
      setFiles((res && res.files) || [])
    }).catch(() => { if (alive) setFiles([]) })
    return () => { alive = false }
  }, [])

  const openFile = async (name) => {
    const res = await window.api.openReferenceFile(name)
    if (res && res.error) toast(`파일 열기 실패: ${res.error}`, 'err')
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/30">
      <div className="max-h-[90%] w-[760px] max-w-full overflow-auto rounded-2xl bg-white shadow-2xl">
        <div style={{ zoom: 1.5 }}>
          <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-3">
            <h3 className="text-[14px] font-bold text-[#1E293B]">📚 참고 자료</h3>
            <button className="rounded px-2 py-0.5 text-[13px] text-[#94A3B8] hover:bg-[#F1F5F9]" onClick={onClose}>✕</button>
          </div>
          <div className="px-4 pt-3">
            <div className="rounded-xl border border-[#DDD9FC] bg-[#EEEDFE] px-4 py-3">
              <div className="text-[12px] font-semibold text-[#4C3DE6]">[출처] {REFERENCE_SOURCE.label}</div>
              <button
                className="mt-1 block break-all text-left text-[11.5px] text-[#2563EB] underline hover:text-[#1D4ED8]"
                onClick={() => window.api.openExternal(REFERENCE_SOURCE.url)}
                title="브라우저에서 출처 페이지 열기"
              >
                {REFERENCE_SOURCE.url}
              </button>
            </div>
          </div>
          <div className="space-y-1.5 px-4 py-3">
            {files === null && <div className="py-4 text-center text-[12px] text-[#94A3B8]">불러오는 중…</div>}
            {files !== null && files.length === 0 && (
              <div className="py-4 text-center text-[12px] text-[#94A3B8]">
                참고 자료 폴더(Proposal\참고 자료)에 파일이 없습니다
              </div>
            )}
            {files !== null && files.map(name => (
              <button
                key={name}
                className="flex w-full items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-left text-[12.5px] font-semibold text-[#334155] transition-colors duration-150 hover:border-[#DDD9FC] hover:bg-[#EEEDFE]"
                onClick={() => openFile(name)}
                title="파일 열기"
              >
                <span>📄</span>
                <span className="truncate">{name}</span>
              </button>
            ))}
          </div>
          <div className="flex justify-end border-t border-[#E2E8F0] px-4 py-3">
            <button
              className="rounded-md border border-[#E2E8F0] bg-white px-4 py-1.5 text-[12.5px] font-semibold text-[#334155] hover:bg-[#F1F5F9]"
              onClick={onClose}
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function RequisitionPage() {
  const toast = useStore(s => s.toast)
  const docs = useStore(s => s.docs)
  const priceMarkup = useStore(s => s.priceMarkup)

  const [typeId, setTypeId] = useState('buy')
  const [title, setTitle] = useState('')
  const [budget, setBudget] = useState(null) // { fileName, path, businesses }
  const [savedPath, setSavedPath] = useState('')
  const [bIdx, setBIdx] = useState(0)
  const [iIdx, setIIdx] = useState(0)
  const [aIdx, setAIdx] = useState(0)
  const [detail, setDetail] = useState('')
  const [editing, setEditing] = useState(false)
  const [editorText, setEditorText] = useState('')
  const [daeHoRemoved, setDaeHoRemoved] = useState(false)
  const [showExamples, setShowExamples] = useState(false)
  const [showReference, setShowReference] = useState(false)

  const type = typeById(typeId)

  // 별도 창 초기화 — 기존 문서 불러오기 + 새 캡처 브로드캐스트 수신(init)
  useEffect(() => {
    let alive = true
    ;(async () => {
      useStore.getState().init()
      try {
        const all = await window.api.getAllDocs()
        if (alive && Array.isArray(all) && all.length) useStore.getState().addDocs(all)
      } catch {}
    })()
    return () => { alive = false }
  }, [])

  // 메인 프로그램 연동 — 총액(단가 인상 % 반영·배송비 포함)과 품목 수(배송비 포함 전체 행, 메인 품목 수와 동일)
  const mainData = useMemo(() => {
    const pct = Number(priceMarkup) || 0
    const allRows = docs.flatMap(d => d.rows)
    const total = allRows.reduce((m, r) => {
      const unit = r.isShipping ? (r.roundedPrice || 0) : Math.round((r.roundedPrice || 0) * (1 + pct / 100))
      return m + (r.qty || 0) * unit
    }, 0)
    const firstItemRow = allRows.find(r => !r.isShipping)
    return { total, firstItem: firstItemRow ? firstItemRow.name : '', count: allRows.length }
  }, [docs, priceMarkup])

  // 라. 산출내역 건수 = 품목 목록 − 1 (예: 목록 5건 → "000외 4건")
  const fillCount = Math.max(0, mainData.count - 1)

  // 나. 용도 후보(최대 10개) — 제목에 걸리는 키워드 그룹에서 사용자가 직접 선택
  const candidates = useMemo(
    () => (typeId === 'buy' ? findPurposeCandidates('buy', title, 10) : []),
    [typeId, title]
  )
  const [purposeIdx, setPurposeIdx] = useState(null)
  useEffect(() => { setPurposeIdx(null) }, [title, typeId])
  const selPurpose = typeId === 'buy'
    ? (purposeIdx !== null && candidates[purposeIdx] ? candidates[purposeIdx] : GIBON_FALLBACK.buy)
    : ''

  const businesses = (budget && budget.businesses) || []
  const items = (businesses[bIdx] && businesses[bIdx].items) || []
  const accounts = (items[iIdx] && items[iIdx].accounts) || []

  const applyBudget = (res, sel) => {
    const bs = res.businesses || []
    setBudget({ fileName: res.fileName, path: res.path, businesses: bs })
    let b = 0, i = 0, a = 0
    if (sel && Number.isInteger(sel.b) && bs[sel.b]) {
      b = sel.b
      const its = bs[b].items || []
      if (Number.isInteger(sel.i) && its[sel.i]) {
        i = sel.i
        const accs = its[i].accounts || []
        if (Number.isInteger(sel.a) && accs[sel.a]) a = sel.a
      }
    }
    setBIdx(b); setIIdx(i); setAIdx(a)
    if (!editing) {
      const it = (bs[b] && bs[b].items[i]) || null
      setDetail(accountDisplay(it && it.accounts && it.accounts[a]))
    }
  }

  // 열릴 때 저장된 사업관리카드 자동 로드 — 세부사업/세부항목/산출내역이 즉시 채워짐
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const settings = await window.api.getSettings()
        const p = settings && settings.budgetCardPath
        if (!p || !alive) return
        const res = await window.api.parseBudgetCard(p)
        if (!alive) return
        if (res.error) {
          setSavedPath(p)
          toast(`저장된 사업관리카드를 불러오지 못했습니다 — 파일을 다시 찾아 주세요 (${res.error})`, 'warn', 6000)
          return
        }
        applyBudget(res, settings.budgetCardSel || null)
        setSavedPath(p)
      } catch {}
    })()
    return () => { alive = false }
  }, [])

  // 입력·메인 데이터·대호 상태 변화 → 양식 자동 치환(에디터 갱신)
  useEffect(() => {
    const text = fillTemplate(typeId, {
      title,
      detail,
      purpose: selPurpose,
      total: mainData.total,
      firstItem: mainData.firstItem,
      count: fillCount
    })
    setEditorText(daeHoRemoved ? removeHeadingLine(text) : text)
  }, [typeId, title, detail, daeHoRemoved, selPurpose, mainData.total, mainData.firstItem, fillCount])

  const selectAccount = (idx) => {
    setAIdx(idx)
    if (!editing) setDetail(accountDisplay(accounts[idx]))
  }

  const selectBusiness = (idx) => {
    setBIdx(idx)
    setIIdx(0)
    setAIdx(0)
    if (!editing) {
      const it = (businesses[idx] && businesses[idx].items[0]) || null
      setDetail(accountDisplay(it && it.accounts[0]))
    }
  }

  const selectItem = (idx) => {
    setIIdx(idx)
    setAIdx(0)
    if (!editing) {
      const it = items[idx] || null
      setDetail(accountDisplay(it && it.accounts[0]))
    }
  }

  const pickFile = async () => {
    const res = await window.api.pickBudgetCard()
    if (!res || res.canceled) return
    if (res.error) {
      toast(`사업관리카드 읽기 실패: ${res.error}`, 'err')
      return
    }
    setEditing(false)
    applyBudget(res, null)
    toast(`사업관리카드 로드: 세부사업 ${(res.businesses || []).length}건 (${res.fileName}) — [💾 카드 저장]으로 다음부터 자동 불러오기`, 'ok', 6000)
  }

  const saveCard = () => {
    const p = budget && budget.path
    if (!p) {
      toast('저장할 사업관리카드가 없습니다 — 먼저 [📂 파일 찾기]로 파일을 선택하세요', 'warn')
      return
    }
    window.api.setSetting('budgetCardPath', p)
    window.api.setSetting('budgetCardSel', { b: bIdx, i: iIdx, a: aIdx })
    setSavedPath(p)
    toast('저장 완료 — 다음부터 이 카드와 선택 계층이 자동으로 불러와집니다', 'ok')
  }

  const copyTitle = async () => {
    const t = title.trim()
    if (!t) {
      toast('복사할 제목이 없습니다 — 제목을 입력해 주세요', 'warn')
      return
    }
    const text = `${t} ${type.label}`
    await window.api.copyText(text)
    toast(`"${text}" 클립보드 복사 완료`, 'ok')
  }

  const copyOverview = async () => {
    await window.api.copyText(editorText)
    toast('품의 내역이 클립보드에 복사되었습니다.', 'ok')
  }

  const saveUseTxt = async () => {
    const res = await window.api.saveUseTxt(editorText)
    if (!res || res.canceled) return
    if (res.error) {
      toast(`품의 내역 파일 저장 실패: ${res.error}`, 'err')
      return
    }
    toast(`품의 내역 파일 저장 완료 → ${res.path}`, 'ok')
  }

  const refreshMainData = () => {
    const text = fillTemplate(typeId, {
      title,
      detail,
      purpose: selPurpose,
      total: mainData.total,
      firstItem: mainData.firstItem,
      count: fillCount
    })
    setEditorText(daeHoRemoved ? removeHeadingLine(text) : text)
    toast(`메인 프로그램 데이터 반영 — 총액 ${mainData.total.toLocaleString()}원 · 품목 목록 ${mainData.count}건`, 'ok')
  }

  const onEditorChange = (e) => {
    setEditorText(applyLineShift(e.target.value))
  }

  const inputCls = 'w-full rounded-md border border-[#E2E8F0] bg-white px-2 py-1.5 text-[12.5px] text-[#1E293B]'
  const selectCls = inputCls

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      <div
        className="flex shrink-0 select-none items-center justify-between border-b border-[#3F32D6] bg-[#5B4DFB] px-4 py-3"
        style={{ WebkitAppRegion: 'drag' }}
        title="제목 표시줄을 드래그하면 창을 화면 어디든 이동할 수 있습니다"
      >
        <h2 className="text-[15px] font-bold text-white"><span className="mr-1 text-white/60">⠿</span>📝 품의 개요 작성 프로그램</h2>
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' }}>
          <button
            className="rounded-md bg-white px-3 py-1 text-[12.5px] font-bold text-[#4C3DE6] hover:bg-[#EEEDFE]"
            onClick={() => setShowExamples(true)}
            title="물품 구입·수당 지급·협의회 실시 표준 작성 예시"
          >
            📖 예시 자료 참조
          </button>
          <button
            className="rounded-md bg-white px-3 py-1 text-[12.5px] font-bold text-[#4C3DE6] hover:bg-[#EEEDFE]"
            onClick={() => setShowReference(true)}
            title="학교회계 예산 참고 자료 PDF 열기 (부산광역시 교육청 학교회계자료실)"
          >
            📚 참고 자료
          </button>
          <button className="rounded px-2 py-0.5 text-[13px] font-semibold text-white/80 hover:bg-white/10 hover:text-white" onClick={() => window.close()}>✕ 닫기</button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto" style={{ zoom: 1.5 }}>
          <div className="space-y-3 px-4 py-4">
            <div className="rounded-lg border border-[#E2E8F0] px-4 py-3">
              <div className="text-[13.5px] font-semibold text-[#1E293B]">1. 품의 유형 선택</div>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
                {REQUISITION_TYPES.map(t => (
                  <label key={t.id} className="flex cursor-pointer items-center gap-1.5 text-[13px] text-[#334155]">
                    <input
                      type="radio"
                      name="req-type"
                      className="h-4 w-4 accent-blue-600"
                      checked={typeId === t.id}
                      onChange={() => setTypeId(t.id)}
                    />
                    {t.label}
                  </label>
                ))}
              </div>
              <p className="mt-1.5 text-[11.5px] text-[#64748B]">선택한 유형의 표준 양식이 아래 개요 에디터에 나타나며, 제목·내역·예산·품목이 자동으로 채워집니다.</p>
            </div>

            <div className="rounded-lg border border-[#E2E8F0] px-4 py-3">
              <div className="text-[13.5px] font-semibold text-[#1E293B]">2. 품의 제목 입력</div>
              <div className="mt-2 flex items-center gap-2">
                <span className="shrink-0 text-[12.5px] text-[#64748B]">제목:</span>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder={type.titlePh}
                  className={inputCls}
                />
                <span className="shrink-0 rounded bg-[#EEEDFE] px-2 py-1 text-[12px] font-bold text-[#5B4DFB]">{type.label}</span>
                <button
                  className="shrink-0 rounded-md border border-[#E2E8F0] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#334155] hover:bg-[#F1F5F9]"
                  onClick={copyTitle}
                  title="입력한 제목+품의 유형을 클립보드에 복사 (예: 기술실 물품 구입)"
                >
                  📋 제목 복사
                </button>
              </div>
              {typeId === 'buy' && (
                <p className="mt-1.5 text-[11.5px] text-[#64748B]">
                  제목 키워드로 <b>나. 용도:</b> 문구 후보를 찾아 드립니다 — 아래 후보 중 선택하세요 (선택 전에는 기본 대체 문구가 들어갑니다)
                </p>
              )}
              {typeId === 'buy' && title.trim() !== '' && (
                <div className="mt-2 rounded-lg border border-[#F1F5F9] bg-[#F8FAFC] px-3 py-2">
                  <div className="text-[11.5px] font-semibold text-[#4C3DE6]">
                    나. 용도 후보 {candidates.length}건 {candidates.length >= 10 ? '(최대 10건 표시)' : ''}
                  </div>
                  {candidates.length === 0 ? (
                    <p className="mt-1 text-[11.5px] text-[#94A3B8]">일치하는 키워드가 없습니다 — 기본 대체 문구가 사용됩니다. 직접 편집도 가능합니다.</p>
                  ) : (
                    <div className="mt-1.5 flex flex-col gap-1">
                      {candidates.map((c, i) => (
                        <button
                          key={c}
                          className={`w-full rounded-md px-2.5 py-1 text-left text-[11.5px] transition-colors duration-150 ${
                            purposeIdx === i
                              ? 'bg-[#5B4DFB] font-bold text-white'
                              : 'border border-[#E2E8F0] bg-white text-[#334155] hover:border-[#DDD9FC] hover:bg-[#EEEDFE]'
                          }`}
                          onClick={() => setPurposeIdx(i)}
                          title="선택한 문구가 나. 용도:에 반영됩니다"
                        >
                          {purposeIdx === i ? '✓ ' : `${i + 1}. `}{c}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {typeId === 'buy' && (
              <div className="rounded-lg border border-[#E2E8F0] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[13.5px] font-semibold text-[#1E293B]">3. 사업관리카드(예산) 선택 및 내역 제어</div>
                <div className="flex items-center gap-2">
                  <span className="max-w-[200px] truncate text-[12px] text-[#64748B]" title={budget ? budget.path : ''}>
                    {budget ? budget.fileName : (savedPath ? '파일을 다시 찾아 주세요' : '파일 미탑재 — 가. 내역: 수동 입력')}
                  </span>
                  <button
                    className="shrink-0 rounded-md border border-[#E2E8F0] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#334155] hover:bg-[#F1F5F9]"
                    onClick={pickFile}
                  >
                    📂 파일 찾기
                  </button>
                  <button
                    className="shrink-0 rounded-md bg-[#5B4DFB] px-3 py-1.5 text-[12.5px] font-bold text-white hover:bg-[#4C3DE6] disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={saveCard}
                    disabled={!budget}
                    title="이 사업관리카드와 선택한 계층을 저장 — 다음 실행부터 세부사업·세부항목·산출내역이 자동으로 나타납니다"
                  >
                    💾 카드 저장
                  </button>
                </div>
              </div>
              {savedPath && (
                <p className="mt-1.5 text-[11.5px] text-[#059669]">
                  ✅ 카드 저장됨 — 프로그램을 다시 열면 이 카드의 세부사업·세부항목·산출내역이 자동으로 나타납니다
                </p>
              )}

              {budget && (
                <div className="mt-3 grid grid-cols-1 gap-2 border-t border-[#F1F5F9] pt-3">
                  <label className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-[12.5px] text-[#64748B]">세부사업</span>
                    <select className={selectCls} value={bIdx} onChange={e => selectBusiness(Number(e.target.value))}>
                      {businesses.map((b, i) => <option key={i} value={i}>{b.name}</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-[12.5px] text-[#64748B]">세부항목</span>
                    <select className={selectCls} value={iIdx} onChange={e => selectItem(Number(e.target.value))}>
                      {items.map((it, i) => <option key={i} value={i}>{it.name}</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-[12.5px] text-[#64748B]">산출내역</span>
                    <select className={selectCls} value={aIdx} onChange={e => selectAccount(Number(e.target.value))}>
                      {accounts.map((a, i) => <option key={i} value={i}>{accountDisplay(a)}</option>)}
                    </select>
                  </label>
                </div>
              )}

              <div className="mt-3 flex items-center gap-2 border-t border-[#F1F5F9] pt-3">
                <span className="shrink-0 text-[12.5px] text-[#64748B]">[직접 수정 내역]:</span>
                <input
                  type="text"
                  value={detail}
                  readOnly={!editing}
                  onChange={e => setDetail(e.target.value)}
                  placeholder="일반수용비 - 안심번호서비스"
                  className={`${inputCls} ${editing ? 'border-[#DDD9FC] bg-white' : 'bg-[#F8FAFC]'}`}
                />
                <button
                  className={`shrink-0 rounded-md px-3 py-1.5 text-[12.5px] font-bold ${
                    editing ? 'bg-[#5B4DFB] text-white hover:bg-[#4C3DE6]' : 'border border-[#E2E8F0] bg-white text-[#334155] hover:bg-[#F1F5F9]'
                  }`}
                  onClick={() => setEditing(v => !v)}
                  title={editing ? '잠그고 드롭다운 선택값에 다시 연동' : '내역을 직접 입력할 수 있게 잠금 해제'}
                >
                  {editing ? '✅ 적용' : '✏️ 수정'}
                </button>
              </div>
              {editing && (
                <p className="mt-1 text-[11.5px] text-[#B45309]">직접 수정 중 — 입력값이 드롭다운 선택값보다 우선 적용됩니다. [✅ 적용]을 누르면 드롭다운에 다시 연동됩니다.</p>
              )}
              </div>
            )}

            <div className="rounded-lg border border-[#E2E8F0] px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[13.5px] font-semibold text-[#1E293B]">{typeId === 'buy' ? '4.' : '3.'} 개요 생성 및 편집 (Live Editor)</div>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-[#64748B]">
                    메인 데이터: 총액 <b className="text-[#5B4DFB]">{mainData.total.toLocaleString()}원</b> · 품목 목록 <b>{mainData.count}</b>건
                  </span>
                  <button
                    className={`rounded-md px-3 py-1.5 text-[12.5px] font-bold ${
                      daeHoRemoved
                        ? 'border border-[#E2E8F0] bg-white text-[#334155] hover:bg-[#F1F5F9]'
                        : 'border border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C] hover:bg-[#FEE2E2]'
                    }`}
                    onClick={() => setDaeHoRemoved(v => !v)}
                    title={daeHoRemoved ? '삭제한 1번째 줄(대호)을 원래대로 복원합니다' : '개요의 1번째 줄을 삭제합니다 — 나머지 줄이 위로 이동하고 기존 2번째 줄의 번호(2. )가 자동 제거됩니다'}
                  >
                    {daeHoRemoved ? '↩ 대호 복원' : '✂ 대호 삭제'}
                  </button>
                </div>
              </div>
              <textarea
                value={editorText}
                onChange={onEditorChange}
                spellCheck={false}
                className="mt-2 h-56 w-full whitespace-pre-wrap rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-[12.5px] leading-7 text-[#1E293B]"
              />
              <p className="mt-1 text-[11.5px] text-[#64748B]">
                직접 편집할 수 있으며, 1번째 줄("1. 관련: …")을 삭제하면 나머지 줄이 위로 이동하고 기존 2번째 줄의 번호(2. )가 자동 제거됩니다.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                className="rounded-md border border-[#E2E8F0] bg-white px-4 py-2 text-[12.5px] font-semibold text-[#334155] hover:bg-[#F1F5F9]"
                onClick={refreshMainData}
                title="현재 추출 표의 총액·품목을 개요에 다시 반영"
              >
                🔄 메인 프로그램 데이터 새로고침
              </button>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-[10px] bg-[#5B4DFB] px-5 py-2 text-[12.5px] font-bold text-white hover:bg-[#4C3DE6]"
                  onClick={copyOverview}
                  title="완성된 품의 내역 전체를 클립보드에 복사"
                >
                  📋 품의 내역 복사
                </button>
                <button
                  className="rounded-md border border-[#DDD9FC] bg-[#EEEDFE] px-4 py-2 text-[12.5px] font-bold text-[#4C3DE6] hover:bg-[#DDD9FC]"
                  onClick={saveUseTxt}
                  title="완성된 품의 내역을 텍스트 파일(USE.TXT)로 저장"
                >
                💾 품의 내역 파일 저장
              </button>
              </div>
            </div>
          </div>
        </div>
        {showExamples && <ExamplesModal onClose={() => setShowExamples(false)} />}
        {showReference && <ReferenceModal onClose={() => setShowReference(false)} />}
    </div>
  )
}
