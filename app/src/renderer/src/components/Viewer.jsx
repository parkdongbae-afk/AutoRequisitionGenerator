import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import ExcelView from './ExcelView'

// 카드 뷰 적용 몰 — 원본 MHTML 렌더링이 깨지는 가상화/스크립트 기반 장바구니만
// 추출 데이터 기반 커스텀 카드로 표시한다(2026-09-25 사용자 지정). 다른 몰은 원본 그대로.
const CARD_MALLS = new Set(['naver-cart', 'coupang'])

function Thumb({ src, name }) {
  const [err, setErr] = useState(false)
  useEffect(() => { setErr(false) }, [src])
  if (!src || err) {
    return (
      <div className="flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-[24px]">🛒</div>
    )
  }
  return (
    <img
      src={src}
      alt={name}
      referrerPolicy="no-referrer"
      onError={() => setErr(true)}
      className="h-[88px] w-[88px] shrink-0 rounded-lg border border-[#E2E8F0] bg-white object-cover"
    />
  )
}

function CartCards({ doc }) {
  const rows = doc.rows || []
  if (!rows.length) {
    return (
      <div className="mx-auto w-full max-w-[620px] px-3 py-6 text-center text-[13px] text-[#64748B]">
        추출된 품목이 없습니다. 상단 [원본] 탭에서 원문을 확인해 주세요.
      </div>
    )
  }
  return (
    <div className="mx-auto w-full max-w-[620px] bg-[#F8FAFC] px-3 py-3">
      {rows.map(r => r.isShipping ? (
        <div key={r.key} className="mb-2 flex items-center justify-end gap-2 rounded-lg border border-dashed border-[#CBD5E1] bg-white/80 px-3 py-1.5 text-[12.5px] text-[#475569]">
          <span>🚚</span>
          <span className="font-medium">배송비</span>
          <span className="font-bold text-[#1E293B]">{Number(r.roundedPrice ?? r.unitPrice).toLocaleString()}원</span>
          <span className="text-[11px] text-[#94A3B8]">{r.qty}식</span>
        </div>
      ) : (
        <div key={r.key} className="mb-2 flex gap-3 rounded-xl border border-[#E2E8F0] bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <Thumb src={r.image} name={r.name} />
          <div className="min-w-0 flex-1">
            <div className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-[#1E293B]">{r.name}</div>
            {r.spec ? <div className="mt-0.5 truncate text-[12px] text-[#64748B]" title={r.spec}>{r.spec}</div> : null}
            <div className="mt-1.5">
              <span className="rounded bg-[#F1F5F9] px-1.5 py-0.5 text-[11.5px] text-[#475569]">수량 {r.qty}개</span>
            </div>
            <div className="mt-1 text-right text-[15px] font-bold text-[#1E293B]">{Number(r.roundedPrice ?? r.unitPrice).toLocaleString()}원</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function WaitingPanel() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#F8FAFC] px-8 text-center">
      <div className="animate-pulse text-[44px]">📡</div>
      <h2 className="text-[17px] font-bold text-[#1E293B]">캡처 대기 중...</h2>
      <p className="text-[13px] leading-relaxed text-[#64748B]">
        <b>본인 브라우저</b>(로그인 유지됨)에서 쇼핑몰 주문/장바구니 화면을 열고<br />
        ① 익스텐션 아이콘 또는 ② 북마크릿 <b>🛒품의캡처</b>를 누르면<br />
        이 화면이 자동으로 해당 페이지로 바뀌고 클릭 매핑이 시작됩니다
      </p>
      <div className="rounded-lg border border-amber-200 bg-[#FEF3C7] px-4 py-2 text-[12.5px] font-medium text-[#B45309]">
        📦 <b>2개 이상의 상품을 선택 하세요.</b> — 행 선택자 검증에 필요합니다
      </div>
      <div className="mt-2 rounded-lg border border-[#E2E8F0] bg-white px-4 py-3 text-[12px] text-[#64748B]">
        캡처는 파일로 저장되어 표시됩니다<br />
        (북마크릿: 웹페이지 전부 *.html / 익스텐션: 단일파일 MHTML)
      </div>
    </div>
  )
}

export default function Viewer() {
  const docs = useStore(s => s.docs)
  const selectedDocId = useStore(s => s.selectedDocId)
  const selectDoc = useStore(s => s.selectDoc)
  const closeDoc = useStore(s => s.closeDoc)
  const zoom = useStore(s => s.zoom)
  const setZoom = useStore(s => s.setZoom)
  const applyRule = useStore(s => s.applyRule)
  const rules = useStore(s => s.rules)
  const mapping = useStore(s => s.mapping)
  const [docUrl, setDocUrl] = useState(null)
  const [docSize, setDocSize] = useState(null)
  const [cardMode, setCardMode] = useState(true)
  const iframeRef = useRef(null)
  const fitFitRef = useRef(null)
  const scrollRef = useRef(null)
  const zoomRef = useRef(zoom)
  const panRef = useRef(null)
  const [panning, setPanning] = useState(false)

  const startPan = (x, y) => {
    panRef.current = { x, y }
    setPanning(true)
  }
  const panTo = (x, y) => {
    const p = panRef.current
    const el = scrollRef.current
    if (!p || !el) return
    if (p.x === null) {
      p.x = x
      p.y = y
      return
    }
    el.scrollLeft -= x - p.x
    el.scrollTop -= y - p.y
    p.x = x
    p.y = y
  }
  const panBy = (dx, dy) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollLeft -= dx
    el.scrollTop -= dy
  }
  const endPan = () => {
    panRef.current = null
    setPanning(false)
  }

  const zoomAnchorRef = useRef(null)
  const wheelAccRef = useRef(0)

  const wheelZoom = (docX, docY, vx, vy, deltaY) => {
    const el = scrollRef.current
    if (!el) return
    wheelAccRef.current += deltaY
    let steps = 0
    while (wheelAccRef.current <= -50) { steps++; wheelAccRef.current += 50 }
    while (wheelAccRef.current >= 50) { steps--; wheelAccRef.current -= 50 }
    if (!steps) return
    const st = useStore.getState()
    const sens = Math.min(10, Math.max(0.5, Number(st.zoomSensitivity) || 1.7)) / 100
    const next = Math.min(3, Math.max(0.25, st.zoom + steps * sens))
    if (next === st.zoom) {
      wheelAccRef.current = 0
      return
    }
    zoomAnchorRef.current = { docX, docY, vx, vy }
    st.setZoom(next)
  }

  const waiting = !!(mapping && mapping.waiting)
  const pickerActive = !!(mapping && !mapping.waiting && mapping.capturedDocId && mapping.capturedDocId === selectedDocId)

  useEffect(() => {
    let cancelled = false
    setDocSize(null)
    const sel = docs.find(d => d.id === selectedDocId)
    if (!selectedDocId || (sel && sel.excel)) {
      setDocUrl(null)
      return
    }
    window.api.getDocUrl(selectedDocId, pickerActive).then(url => {
      if (!cancelled) setDocUrl(url)
    })
    return () => { cancelled = true }
  }, [selectedDocId, pickerActive, docs])

  useEffect(() => {
    const onMsg = (e) => {
      if (e.data && e.data.type === 'doc-size' && e.data.height > 0) {
        setDocSize({
          h: Math.ceil(e.data.height),
          w: Math.ceil(Math.max(e.data.width || 0, 1))
        })
        // 원본이 컨테이너보다 훨씬 넓으면(예: 25% 축소 상태에서 캡처한 문서) 초기 화면이
        // 전부 빈 여백으로 보인다 — 문서 폭에 맞춰 한 번만 자동 축소한다(2026-09-25)
        const fitDoc = useStore.getState().docs.find(d => d.id === useStore.getState().selectedDocId)
        if (fitDoc && fitFitRef.current !== fitDoc.id) {
          const el = scrollRef.current
          const w = Math.max(e.data.width || 0, 1)
          if (el && w > el.clientWidth * 1.15) {
            fitFitRef.current = fitDoc.id
            const fit = Math.max(0.08, Math.min(1, (el.clientWidth - 24) / w))
            useStore.getState().setZoom(Number(fit.toFixed(3)))
          }
        }
      }
      if (e.data && e.data.type === 'pan-start') startPan(null, null)
      else if (e.data && e.data.type === 'pan-move') {
        if (panRef.current) panBy(e.data.dx || 0, e.data.dy || 0)
      } else if (e.data && e.data.type === 'pan-end') endPan()
      else if (e.data && e.data.type === 'doc-wheel') {
        const el = scrollRef.current
        if (el) {
          const z = useStore.getState().zoom
          const vx = (e.data.x || 0) * z - el.scrollLeft
          const vy = (e.data.y || 0) * z - el.scrollTop
          wheelZoom(e.data.x || 0, e.data.y || 0, vx, vy, e.data.dy || 0)
        }
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  useEffect(() => {
    if (!panning) return
    const onUp = () => endPan()
    window.addEventListener('mouseup', onUp, true)
    return () => window.removeEventListener('mouseup', onUp, true)
  }, [panning])

  useLayoutEffect(() => {
    const el = scrollRef.current
    const prev = zoomRef.current
    zoomRef.current = zoom
    if (!el || prev === zoom) return
    const a = zoomAnchorRef.current
    zoomAnchorRef.current = null
    if (a) {
      el.scrollLeft = a.docX * zoom - a.vx
      el.scrollTop = a.docY * zoom - a.vy
      return
    }
    const docX = (el.scrollLeft + el.clientWidth / 2) / prev
    const docY = (el.scrollTop + el.clientHeight / 2) / prev
    el.scrollLeft = docX * zoom - el.clientWidth / 2
    el.scrollTop = docY * zoom - el.clientHeight / 2
  }, [zoom])

  useEffect(() => {
    if (!mapping || mapping.waiting) return
    const send = () => {
      const f = iframeRef.current
      if (f && f.contentWindow) {
        try {
          f.contentWindow.postMessage({ type: 'picker-mode', mode: mapping.step === 'confirm' ? 'name' : mapping.step, rowSelector: mapping.rowSelector }, '*')
        } catch {}
      }
    }
    send()
    const t1 = setTimeout(send, 400)
    const t2 = setTimeout(send, 1200)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [mapping && mapping.step, mapping && mapping.rowSelector, mapping && mapping.capturedDocId, docUrl])

  const selected = docs.find(d => d.id === selectedDocId)
  const renderW = docSize ? Math.max(docSize.w, pickerActive ? 1280 : 0) : null

  const hasCards = !!(selected && !selected.excel && CARD_MALLS.has(selected.ruleId) && selected.rows && selected.rows.some(r => !r.isShipping))
  // 매핑 피커는 원본 iframe 안에서 클릭해야 하므로 카드 모드를 강제 해제한다
  const useCards = cardMode && hasCards && !pickerActive && !waiting

  const docViewActive = !!(docUrl && !waiting && !useCards && !(selected && selected.excel))
  useEffect(() => {
    if (!docViewActive) return
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const vx = e.clientX - rect.left
      const vy = e.clientY - rect.top
      const z = useStore.getState().zoom
      wheelZoom((el.scrollLeft + vx) / z, (el.scrollTop + vy) / z, vx, vy, e.deltaY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [docViewActive])

  return (
    <section className="relative flex h-full min-w-0 flex-1 flex-col bg-white">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-[#E2E8F0] bg-white px-1 py-1">
        {docs.length === 0 && !waiting && (
          <span className="px-2 py-1 text-[12px] text-[#94A3B8]">
            MHTML 폴더/파일 열기 또는 🛒품의캡처 북마크릿·익스텐션으로 전송하세요
          </span>
        )}
        {docs.map(d => (
          <button
            key={d.id}
            onClick={() => selectDoc(d.id)}
            className={`group flex max-w-[180px] shrink-0 items-center gap-1 rounded-t-lg px-2.5 py-1.5 text-[11.5px] transition-colors duration-150 ${
              d.id === selectedDocId ? 'bg-[#EEEDFE] font-semibold text-[#5B4DFB] shadow-[inset_0_-2px_0_#5B4DFB]' : 'bg-[#F8FAFC] text-[#64748B] hover:bg-[#F1F5F9]'
            }`}
            title={d.sourceUrl}
          >
            <span className="truncate">
              {!d.ruleId && !d.excel && '⚠ '}
              {d.fileName.replace(/\.(mhtml?|html?)$/i, '')}
            </span>
            <span
              className="ml-1 rounded px-1 text-[#94A3B8] opacity-0 hover:bg-[#E2E8F0] group-hover:opacity-100"
              onClick={e => { e.stopPropagation(); closeDoc(d.id) }}
            >
              ✕
            </span>
          </button>
        ))}
      </div>

      {pickerActive && (
        <div className="flex items-center gap-2 border-b border-[#DDD9FC] bg-[#EEEDFE] px-2 py-1.5 text-[11.5px] text-[#4C3DE6]">
          <b>매핑 모드</b> — 좌측 캡처 문서에서 항목을 <b>클릭</b>하여 지정하세요
        </div>
      )}

      {!waiting && (
        <div className="flex items-center gap-2 border-b border-[#E2E8F0] bg-[#F8FAFC] px-2 py-1">
          {hasCards && (
            <div className="flex overflow-hidden rounded-md border border-[#E2E8F0]">
              <button
                className={`px-2 py-0.5 text-[12px] transition-colors duration-150 ${useCards ? 'bg-[#5B4DFB] font-semibold text-white' : 'bg-white text-[#334155] hover:bg-[#F1F5F9]'}`}
                onClick={() => setCardMode(true)}
              >카드</button>
              <button
                className={`px-2 py-0.5 text-[12px] transition-colors duration-150 ${!useCards ? 'bg-[#5B4DFB] font-semibold text-white' : 'bg-white text-[#334155] hover:bg-[#F1F5F9]'}`}
                onClick={() => setCardMode(false)}
              >원본</button>
            </div>
          )}
          {!useCards && (
            <>
              <button className="rounded-md border border-[#E2E8F0] bg-white px-2 py-0.5 text-[12px] text-[#334155] transition-colors duration-150 hover:bg-[#F1F5F9]" onClick={() => setZoom(zoom + 0.1)}>＋ 확대</button>
              <button className="rounded-md border border-[#E2E8F0] bg-white px-2 py-0.5 text-[12px] text-[#334155] transition-colors duration-150 hover:bg-[#F1F5F9]" onClick={() => setZoom(zoom - 0.1)}>－ 축소</button>
              <button className="rounded-md border border-[#E2E8F0] bg-white px-2 py-0.5 text-[12px] text-[#334155] transition-colors duration-150 hover:bg-[#F1F5F9]" onClick={() => setZoom(1)}>100%</button>
              <span className="text-[11px] text-[#64748B]">{Math.round(zoom * 100)}%</span>
            </>
          )}
          <div className="ml-auto flex items-center gap-1 text-[11px] text-[#64748B]">
            {selected && (
              <>
                <span>{selected.mallName}</span>
                <select
                  className="rounded-md border border-[#E2E8F0] bg-white px-1 py-0.5 text-[11px] text-[#334155]"
                  value={selected.ruleId || ''}
                  disabled={!!selected.excel}
                  onChange={e => e.target.value && applyRule(selected.id, e.target.value)}
                >
                  <option value="">규칙 수동 선택</option>
                  {rules.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>
      )}

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 bg-[#EAECEF]"
        style={{ overflow: 'auto', cursor: panning ? 'grabbing' : undefined }}
        onMouseDown={e => {
          if (e.button === 1 || e.button === 2) {
            e.preventDefault()
            startPan(e.clientX, e.clientY)
          }
        }}
        onAuxClick={e => {
          if (e.button === 1) e.preventDefault()
        }}
        onContextMenu={e => {
          if (panRef.current) e.preventDefault()
        }}
      >
        {waiting ? (
          <WaitingPanel />
        ) : selected && selected.excel ? (
          <ExcelView doc={selected} />
        ) : useCards ? (
          <CartCards doc={selected} />
        ) : docUrl ? (
          <div
            style={{
              width: renderW ? Math.ceil(renderW * zoom) : '100%',
              height: docSize ? Math.ceil(docSize.h * zoom) : '80vh',
              position: 'relative'
            }}
          >
            <iframe
              key={docUrl}
              ref={iframeRef}
              src={docUrl}
              className="viewer-frame"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: renderW || '100%',
                height: docSize ? docSize.h : '100%',
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
                border: 0,
                background: '#fff'
              }}
              sandbox="allow-same-origin allow-scripts"
              title="캡처 뷰어"
            />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#F8FAFC] text-[13px] text-[#64748B]">
            <svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden="true">
              <rect x="14" y="10" width="50" height="62" rx="8" fill="#EEEDFE" />
              <rect x="22" y="22" width="34" height="5" rx="2.5" fill="#C9C3FC" />
              <rect x="22" y="33" width="34" height="5" rx="2.5" fill="#C9C3FC" />
              <rect x="22" y="44" width="22" height="5" rx="2.5" fill="#DDD9FC" />
              <circle cx="66" cy="62" r="18" fill="#5B4DFB" />
              <path d="M58 62l6 6 12-12" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
            품의캡처 북마크를 클릭하거나 품의 요구 확장 프로그램을 클릭하면 주문 화면이 여기에 표시됩니다
          </div>
        )}
      </div>

      {panning && (
        <div
          className="absolute inset-0 z-20 cursor-grabbing"
          onMouseMove={e => panTo(e.clientX, e.clientY)}
          onMouseUp={endPan}
          onMouseLeave={endPan}
          onContextMenu={e => e.preventDefault()}
        />
      )}
    </section>
  )
}
