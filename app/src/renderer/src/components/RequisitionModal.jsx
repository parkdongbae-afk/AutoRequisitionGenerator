import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useStore, roundUnitPrice } from '../store'
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
  const roundMode = useStore(s => s.roundMode)

  const [typeId, setTypeId] = useState('buy')
  const [title, setTitle] = useState('')
  const [budget, setBudget] = useState(null) // { fileName, path, businesses }
  const [savedPath, setSavedPath] = useState('')
  const [bIdx, setBIdx] = useState(0)
  const [iIdx, setIIdx] = useState(0)
  const [aIdx, setAIdx] = useState(0)
  const [detail, setDetail] = useState('')
  const [editorText, setEditorText] = useState('')
  const [daeHoRemoved, setDaeHoRemoved] = useState(false)
  const [showExamples, setShowExamples] = useState(false)
  const [showReference, setShowReference] = useState(false)
  // 나. 용도 모드 — 'keyword'(키워드 찾기, 기본) | 'custom'(나만의 용도). 선택은 설정에 저장되어
  // 창을 닫았다 다시 열어도 유지된다(v1.48.9)
  const [purposeMode, setPurposeMode] = useState('keyword')
  const [customPurpose, setCustomPurpose] = useState('')
  const [customPurposes, setCustomPurposes] = useState([])
  // 사업관리카드 즐겨찾기(v1.48.10) — 파일이 아니라 "세부사업·세부항목·산출내역 선택"을 통째로
  // 저장한다(제목 = 산출내역 표시값). 목록 클릭 한 번으로 3단이 함께 바뀐다
  const [selFavorites, setSelFavorites] = useState([])

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

  // 메인 프로그램 연동 — 총액(백원/천원 올림 선택 반영·배송비 포함)과 품목 수(배송비 포함 전체 행, 메인 품목 수와 동일)
  const mainData = useMemo(() => {
    const allRows = docs.flatMap(d => d.rows)
    const total = allRows.reduce((m, r) => {
      const unit = r.isShipping ? (r.roundedPrice || 0) : roundUnitPrice(r.roundedPrice || 0, roundMode)
      return m + (r.qty || 0) * unit
    }, 0)
    const firstItemRow = allRows.find(r => !r.isShipping)
    return { total, firstItem: firstItemRow ? firstItemRow.name : '', count: allRows.length }
  }, [docs, roundMode])

  // 라. 산출내역 건수 = 품목 목록 − 1 (예: 목록 5건 → "000외 4건")
  const fillCount = Math.max(0, mainData.count - 1)

  // 나. 용도 후보(최대 10개) — 제목에 걸리는 키워드 그룹에서 사용자가 직접 선택
  const candidates = useMemo(
    () => (typeId === 'buy' ? findPurposeCandidates('buy', title, 10) : []),
    [typeId, title]
  )
  const [purposeIdx, setPurposeIdx] = useState(null)
  useEffect(() => { setPurposeIdx(null) }, [title, typeId])
  // 나. 용도 문구 — 키워드 모드는 후보 선택(미선택 시 기본 대체 문구), 나만의 용도 모드는
  // 입력 즉시 Live Editor의 "나. 용도:"에 반영된다. 빈 입력은 기본 대체 문구로 폴백(v1.48.9)
  const selPurpose = typeId !== 'buy'
    ? ''
    : purposeMode === 'custom'
      ? (customPurpose.trim() || GIBON_FALLBACK.buy)
      : (purposeIdx !== null && candidates[purposeIdx] ? candidates[purposeIdx] : GIBON_FALLBACK.buy)

  const businesses = (budget && budget.businesses) || []
  const items = (businesses[bIdx] && businesses[bIdx].items) || []
  const accounts = (items[iIdx] && items[iIdx].accounts) || []

  // "가. 내역:"에 들어갈 문구 — 산출내역만이 아니라 세부사업-세부항목-산출내역 3단을 모두 반영한다
  // (예: 교과활동지원-(목적)두드림학교운영-운영수당-상담프로그램 강사수당, v1.48.10)
  const detailText = (bs, b, i, a) => {
    const bu = bs && bs[b]
    const it = bu && bu.items && bu.items[i]
    const acc = it && it.accounts && it.accounts[a]
    return acc ? `${bu.name}-${it.name}-${accountDisplay(acc)}` : ''
  }

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
    setDetail(detailText(bs, b, i, a))
  }

  // 열릴 때 저장된 사업관리카드 자동 로드 — 세부사업/세부항목/산출내역이 즉시 채워짐
  // + 용도 모드·나만의 용도 목록·즐겨찾기 복원(v1.48.9)
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const settings = await window.api.getSettings()
        if (!alive) return
        setPurposeMode(settings && settings.reqPurposeMode === 'custom' ? 'custom' : 'keyword')
        setCustomPurposes(Array.isArray(settings && settings.customPurposes) ? settings.customPurposes : [])
        setSelFavorites(Array.isArray(settings && settings.budgetSelFavorites) ? settings.budgetSelFavorites : [])
        const p = settings && settings.budgetCardPath
        if (!p) return
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

  // 선택 계층 자동 기억(v1.48.9) — 저장(등록)된 카드의 계층 선택이 바뀔 때마다 settings에
  // 저장해 다음 실행 시 같은 산출내역이 바로 나타난다. applyBudget의 인덱스 경계 검사로
  // 파일이 바뀐 뒤의 복원 오류도 방어된다
  const persistSel = (b, i, a) => {
    if (budget && budget.path && budget.path === savedPath) {
      window.api.setSetting('budgetCardSel', { b, i, a })
    }
  }

  const selectAccount = (idx) => {
    setAIdx(idx)
    setDetail(detailText(businesses, bIdx, iIdx, idx))
    persistSel(bIdx, iIdx, idx)
  }

  const selectBusiness = (idx) => {
    setBIdx(idx)
    setIIdx(0)
    setAIdx(0)
    setDetail(detailText(businesses, idx, 0, 0))
    persistSel(idx, 0, 0)
  }

  const selectItem = (idx) => {
    setIIdx(idx)
    setAIdx(0)
    setDetail(detailText(businesses, bIdx, idx, 0))
    persistSel(bIdx, idx, 0)
  }

  const pickFile = async () => {
    let res = null
    try {
      res = await window.api.pickBudgetCard()
    } catch (e) {
      toast(`파일 선택 창을 열 수 없습니다: ${String((e && e.message) || e)}`, 'err')
      return
    }
    if (!res || res.canceled) return
    if (res.error) {
      toast(`사업관리카드 읽기 실패: ${res.error}`, 'err')
      return
    }
    // 카드 저장(등록) 상태에서 다른 파일을 고르면 기존 카드가 삭제된다는 사실을 먼저 안내한다(v1.48.9)
    if (savedPath && res.path !== savedPath) {
      let go = false
      try {
        go = await window.api.confirmBox(
          `이미 저장된 사업관리카드가 삭제되고 새 파일로 교체됩니다.\n\n새 파일: ${res.fileName}\n\n계속하시겠습니까?`,
          '사업관리카드 교체'
        )
      } catch {}
      if (!go) return
    }
    applyBudget(res, null)
    window.api.setSetting('budgetCardPath', res.path)
    window.api.setSetting('budgetCardSel', { b: 0, i: 0, a: 0 })
    setSavedPath(res.path)
    toast(`새 사업관리카드 등록 완료: ${res.fileName} — 세부사업·세부항목·산출내역 선택은 자동으로 기억됩니다`, 'ok', 6000)
  }

  // 산출내역 즐겨찾기(v1.48.10) — 세부사업·세부항목·산출내역 선택을 통째로 저장/복원.
  // 다른 카드 파일의 즐겨찾기면 해당 파일을 먼저 불러온 뒤 계층을 적용한다
  const addSelFavorite = () => {
    if (!budget || !budget.path) {
      toast('즐겨찾기에 추가할 카드가 없습니다 — 먼저 [📂 파일 찾기]로 파일을 선택하세요', 'warn')
      return
    }
    const acc = accounts[aIdx]
    if (!acc) {
      toast('산출내역을 먼저 선택해 주세요', 'warn')
      return
    }
    const entry = { path: budget.path, b: bIdx, i: iIdx, a: aIdx, title: accountDisplay(acc) }
    const dup = selFavorites.some(f => f.path === entry.path && f.b === entry.b && f.i === entry.i && f.a === entry.a)
    if (dup) {
      toast('이미 즐겨찾기에 등록된 산출내역입니다', 'warn')
      return
    }
    const next = [...selFavorites, entry]
    setSelFavorites(next)
    window.api.setSetting('budgetSelFavorites', next)
    toast(`즐겨찾기 추가: ${entry.title}`, 'ok')
  }

  const removeSelFavorite = (f) => {
    const next = selFavorites.filter(x => !(x.path === f.path && x.b === f.b && x.i === f.i && x.a === f.a))
    setSelFavorites(next)
    window.api.setSetting('budgetSelFavorites', next)
    toast('즐겨찾기에서 삭제했습니다', 'ok')
  }

  const clickSelFavorite = async (f) => {
    try {
      if (!budget || budget.path !== f.path) {
        const res = await window.api.parseBudgetCard(f.path)
        if (res.error) {
          toast(`카드 불러오기 실패: ${res.error}`, 'err')
          return
        }
        applyBudget(res, { b: f.b, i: f.i, a: f.a })
      } else {
        applyBudget(budget, { b: f.b, i: f.i, a: f.a })
      }
      toast(`세부사업·세부항목·산출내역 변경: ${f.title}`, 'ok')
    } catch (e) {
      toast(`카드 불러오기 실패: ${String((e && e.message) || e)}`, 'err')
    }
  }

  // 나만의 용도(v1.48.9) — 입력 즉시 나. 용도:에 반영 + 저장/삭제 목록 관리
  const switchPurposeMode = (mode) => {
    setPurposeMode(mode)
    window.api.setSetting('reqPurposeMode', mode)
  }

  const saveCustomPurpose = () => {
    const t = customPurpose.trim()
    if (!t) {
      toast('저장할 용도 문구를 입력해 주세요', 'warn')
      return
    }
    if (customPurposes.includes(t)) {
      toast('이미 저장된 문구입니다', 'warn')
      return
    }
    const next = [...customPurposes, t]
    setCustomPurposes(next)
    window.api.setSetting('customPurposes', next)
    toast('나만의 용도 저장 완료 — 아래 목록을 클릭하면 나. 용도:에 바로 적용됩니다', 'ok')
  }

  const deleteCustomPurpose = (t) => {
    const next = customPurposes.filter(x => x !== t)
    setCustomPurposes(next)
    window.api.setSetting('customPurposes', next)
    toast('저장된 용도를 삭제했습니다', 'ok')
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
    toast('품의 개요가 클립보드에 복사되었습니다.', 'ok')
  }

  const saveUseTxt = async () => {
    const res = await window.api.saveUseTxt(editorText)
    if (!res || res.canceled) return
    if (res.error) {
      toast(`품의 개요 파일 저장 실패: ${res.error}`, 'err')
      return
    }
    toast(`품의 개요 파일 저장 완료 → ${res.path}`, 'ok')
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
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <button
                    className={`rounded-md px-3 py-1 text-[12px] font-bold transition-colors duration-150 ${
                      purposeMode === 'keyword'
                        ? 'bg-[#5B4DFB] text-white hover:bg-[#4C3DE6]'
                        : 'border border-[#E2E8F0] bg-white text-[#64748B] hover:bg-[#F1F5F9]'
                    }`}
                    onClick={() => switchPurposeMode('keyword')}
                    title="제목 키워드로 나. 용도: 문구 후보를 찾아 선택합니다 (기본 모드)"
                  >
                    🔍 키워드 찾기
                  </button>
                  <button
                    className={`rounded-md px-3 py-1 text-[12px] font-bold transition-colors duration-150 ${
                      purposeMode === 'custom'
                        ? 'bg-[#5B4DFB] text-white hover:bg-[#4C3DE6]'
                        : 'border border-[#E2E8F0] bg-white text-[#64748B] hover:bg-[#F1F5F9]'
                    }`}
                    onClick={() => switchPurposeMode('custom')}
                    title="직접 입력한 용도 문구를 나. 용도:에 바로 반영하고, 자주 쓰는 문구를 저장해 두고 클릭으로 적용합니다"
                  >
                    ✏️ 나만의 용도
                  </button>
                  <span className="text-[11px] text-[#94A3B8]">
                    {purposeMode === 'keyword'
                      ? '제목 키워드로 용도 후보를 찾아 선택합니다'
                      : '직접 입력한 문구가 나. 용도:에 바로 반영됩니다 — 모드는 다음 실행에도 유지됩니다'}
                  </span>
                </div>
              )}
              {typeId === 'buy' && purposeMode === 'keyword' && (
                <p className="mt-1.5 text-[11.5px] text-[#64748B]">
                  제목 키워드로 <b>나. 용도:</b> 문구 후보를 찾아 드립니다 — 아래 후보 중 선택하세요 (선택 전에는 기본 대체 문구가 들어갑니다)
                </p>
              )}
              {typeId === 'buy' && purposeMode === 'keyword' && title.trim() !== '' && (
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
              {typeId === 'buy' && purposeMode === 'custom' && (
                <div className="mt-2 rounded-lg border border-[#F1F5F9] bg-[#F8FAFC] px-3 py-2">
                  <div className="flex items-start gap-2">
                    <textarea
                      value={customPurpose}
                      onChange={e => setCustomPurpose(e.target.value)}
                      rows={2}
                      placeholder="예: 체육대회 운영에 필요한 물품 구매"
                      className={`${inputCls} flex-1 resize-y`}
                      title="입력하는 즉시 아래 Live Editor의 나. 용도:에 반영됩니다"
                    />
                    <button
                      className="shrink-0 rounded-md bg-[#5B4DFB] px-3 py-1.5 text-[12px] font-bold text-white hover:bg-[#4C3DE6]"
                      onClick={saveCustomPurpose}
                      title="입력한 문구를 아래 목록에 저장 — 다음에도 클릭 한 번으로 적용할 수 있습니다"
                    >
                      💾 저장
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-[#94A3B8]">입력하는 즉시 아래 Live Editor의 "2. 나. 용도:"에 반영됩니다. 빈 칸이면 기본 대체 문구가 사용됩니다.</p>
                  {customPurposes.length > 0 && (
                    <div className="mt-2 border-t border-[#E2E8F0] pt-2">
                      <div className="text-[11.5px] font-semibold text-[#4C3DE6]">
                        저장된 나만의 용도 {customPurposes.length}건 — 클릭하면 나. 용도:에 바로 적용됩니다
                      </div>
                      <div className="mt-1.5 flex flex-col gap-1">
                        {customPurposes.map(t => (
                          <div key={t} className="flex items-center gap-1">
                            <button
                              className={`flex-1 truncate rounded-md px-2.5 py-1 text-left text-[11.5px] transition-colors duration-150 ${
                                customPurpose.trim() === t
                                  ? 'bg-[#5B4DFB] font-bold text-white'
                                  : 'border border-[#E2E8F0] bg-white text-[#334155] hover:border-[#DDD9FC] hover:bg-[#EEEDFE]'
                              }`}
                              onClick={() => { setCustomPurpose(t); toast('나. 용도:에 적용했습니다', 'ok') }}
                              title="클릭하면 이 문구가 나. 용도:에 적용됩니다"
                            >
                              {customPurpose.trim() === t ? '✓ ' : ''}{t}
                            </button>
                            <button
                              className="shrink-0 rounded px-1.5 py-1 text-[11px] text-[#94A3B8] transition-colors duration-150 hover:bg-[#FEE2E2] hover:text-red-600"
                              onClick={() => deleteCustomPurpose(t)}
                              title="저장된 용도에서 삭제"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
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
              <p className="mt-1.5 text-[11.5px] text-[#64748B]">
                다운로드 방법 : [K-에듀파인]-&gt;[사업관리]-&gt;[사업관리카드]-&gt;[사업관리카드(담당)]-&gt;[조회]-&gt;[파일]
              </p>
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
                  <div className="mt-0.5">
                    <button
                      className="rounded-md border border-[#FDE68A] bg-[#FEF3C7] px-3 py-1 text-[12px] font-bold text-[#B45309] transition-colors duration-150 hover:bg-[#FDE68A]"
                      onClick={addSelFavorite}
                      title="지금 선택한 세부사업·세부항목·산출내역을 즐겨찾기에 추가 — 아래 목록에서 클릭 한 번으로 다시 불러옵니다"
                    >
                      ⭐ 즐겨찾기 추가
                    </button>
                  </div>
                </div>
              )}

              {selFavorites.length > 0 && (
                <div className="mt-3 border-t border-[#F1F5F9] pt-3">
                  <div className="text-[12px] font-semibold text-[#B45309]">
                    ⭐ 저장된 산출내역 즐겨찾기 {selFavorites.length}건 — 클릭하면 세부사업·세부항목·산출내역이 한 번에 바뀝니다
                  </div>
                  <div className="mt-1.5 flex flex-col gap-1">
                    {selFavorites.map(f => {
                      const active = budget && budget.path === f.path && bIdx === f.b && iIdx === f.i && aIdx === f.a
                      return (
                        <div key={`${f.path}|${f.b}|${f.i}|${f.a}`} className="flex items-center gap-1">
                          <button
                            className={`flex-1 truncate rounded-md px-2.5 py-1 text-left text-[12px] transition-colors duration-150 ${
                              active
                                ? 'bg-[#FEF3C7] font-bold text-[#B45309]'
                                : 'border border-[#E2E8F0] bg-white text-[#334155] hover:bg-[#FFFBEB]'
                            }`}
                            onClick={() => clickSelFavorite(f)}
                            title={`${f.title}\n출처 카드: ${f.path.split(/[\\/]/).pop()}`}
                          >
                            {active ? '✓ ' : '⭐ '}{f.title}
                          </button>
                          <button
                            className="shrink-0 rounded px-1.5 py-1 text-[11px] text-[#94A3B8] transition-colors duration-150 hover:bg-[#FEE2E2] hover:text-red-600"
                            onClick={() => removeSelFavorite(f)}
                            title="즐겨찾기에서 삭제"
                          >
                            ✕
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
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
                  className="rounded-md border border-[#DDD9FC] bg-[#EEEDFE] px-4 py-2 text-[12.5px] font-bold text-[#4C3DE6] hover:bg-[#DDD9FC]"
                  onClick={copyOverview}
                  title="완성된 품의 개요 전체를 클립보드에 복사"
                >
                  📋 품의 개요 복사
                </button>
                <button
                  className="rounded-md border border-[#DDD9FC] bg-[#EEEDFE] px-4 py-2 text-[12.5px] font-bold text-[#4C3DE6] hover:bg-[#DDD9FC]"
                  onClick={saveUseTxt}
                  title="완성된 품의 개요를 텍스트 파일(USE.TXT)로 저장"
                >
                💾 품의 개요 파일 저장
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
