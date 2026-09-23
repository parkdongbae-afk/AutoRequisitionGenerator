import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import ExcelView from './ExcelView'

function WaitingPanel() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-slate-50 px-8 text-center">
      <div className="animate-pulse text-[44px]">📡</div>
      <h2 className="text-[17px] font-bold text-slate-800">캡처 대기 중...</h2>
      <p className="text-[13px] leading-relaxed text-slate-600">
        <b>본인 브라우저</b>(로그인 유지됨)에서 쇼핑몰 주문/장바구니 화면을 열고<br />
        ① 익스텐션 아이콘 또는 ② 북마크릿 <b>🛒품의캡처</b>를 누르면<br />
        이 화면이 자동으로 해당 페이지로 바뀌고 클릭 매핑이 시작됩니다
      </p>
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-[12.5px] font-medium text-amber-800">
        📦 <b>2개 이상의 상품을 선택 하세요.</b> — 행 선택자 검증에 필요합니다
      </div>
      <div className="mt-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-[12px] text-slate-500">
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
  const iframeRef = useRef(null)
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

  const docViewActive = !!(docUrl && !waiting && !(selected && selected.excel))
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
    <section className="relative flex h-full min-w-0 flex-1 flex-col border-r border-slate-300 bg-white">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 px-1 py-1">
        {docs.length === 0 && !waiting && (
          <span className="px-2 py-1 text-[12px] text-slate-400">
            MHTML 폴더/파일 열기 또는 🛒품의캡처 북마크릿·익스텐션으로 전송하세요
          </span>
        )}
        {docs.map(d => (
          <button
            key={d.id}
            onClick={() => selectDoc(d.id)}
            className={`group flex max-w-[180px] shrink-0 items-center gap-1 rounded-t-md px-2.5 py-1.5 text-[11.5px] ${
              d.id === selectedDocId ? 'bg-white font-semibold text-blue-700 shadow-[inset_0_-2px_0_#2563eb]' : 'bg-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
            title={d.sourceUrl}
          >
            <span className="truncate">
              {!d.ruleId && !d.excel && '⚠ '}
              {d.fileName.replace(/\.(mhtml?|html?)$/i, '')}
            </span>
            <span
              className="ml-1 rounded px-1 text-slate-400 opacity-0 hover:bg-slate-300 group-hover:opacity-100"
              onClick={e => { e.stopPropagation(); closeDoc(d.id) }}
            >
              ✕
            </span>
          </button>
        ))}
      </div>

      {pickerActive && (
        <div className="flex items-center gap-2 border-b border-blue-200 bg-blue-50 px-2 py-1.5 text-[11.5px] text-blue-900">
          <b>매핑 모드</b> — 좌측 캡처 문서에서 항목을 <b>클릭</b>하여 지정하세요
        </div>
      )}

      {!waiting && (
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-2 py-1">
          <button className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[12px] hover:bg-slate-100" onClick={() => setZoom(zoom + 0.1)}>＋ 확대</button>
          <button className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[12px] hover:bg-slate-100" onClick={() => setZoom(zoom - 0.1)}>－ 축소</button>
          <button className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[12px] hover:bg-slate-100" onClick={() => setZoom(1)}>100%</button>
          <span className="text-[11px] text-slate-500">{Math.round(zoom * 100)}%</span>
          <div className="ml-auto flex items-center gap-1 text-[11px] text-slate-500">
            {selected && (
              <>
                <span>{selected.mallName}</span>
                <select
                  className="rounded border border-slate-300 bg-white px-1 py-0.5 text-[11px]"
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
        className="min-h-0 flex-1 bg-slate-200"
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
          <div className="flex h-full items-center justify-center text-[13px] text-slate-400">
            좌측 상단에서 캡처를 불러오면 주문 화면이 여기에 표시됩니다
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
