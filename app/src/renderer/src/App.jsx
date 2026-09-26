import React, { useEffect, useRef, useState } from 'react'
import { useStore } from './store'
import Header from './components/Header'
import Viewer from './components/Viewer'
import Grid from './components/Grid'
import StatusBar from './components/StatusBar'
import MappingModal from './components/MappingModal'
import ExtensionModal from './components/ExtensionModal'
import BookmarkProfileModal from './components/BookmarkProfileModal'
import RulesModal from './components/RulesModal'
import SettingsModal from './components/SettingsModal'
import AdminModal from './components/AdminModal'
import RequisitionPage from './components/RequisitionModal'
import BookmarkProgress from './components/BookmarkProgress'
import Toasts from './components/Toasts'

export default function App() {
  // #requisition 해시 = 품의 개요 작성 프로그램 별도 창 — 메인 UI 없이 서브 프로그램만 렌더
  if (window.location.hash.replace('#', '') === 'requisition') return <RequisitionPage />
  return <MainApp />
}

function MainApp() {
  const init = useStore(s => s.init)
  const receivePick = useStore(s => s.receivePick)
  const mapping = useStore(s => s.mapping)
  const extensionModal = useStore(s => s.extensionModal)
const bookmarkModal = useStore(s => s.bookmarkModal)
  const rulesModal = useStore(s => s.rulesModal)
  const settingsModal = useStore(s => s.settingsModal)
  const adminModal = useStore(s => s.adminModal)
  const halfMode = useStore(s => s.halfMode)
  const splitRatio = useStore(s => s.splitRatio)
  const setSplitRatio = useStore(s => s.setSplitRatio)
  const containerRef = useRef(null)
  const dragging = useRef(false)
  const [dragOverlay, setDragOverlay] = useState(false)

  useEffect(() => {
    init()
    const onMsg = (e) => {
      if (e.data && e.data.type === 'picker-select') receivePick(e.data.payload)
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      setSplitRatio((e.clientX - rect.left) / rect.width)
    }
    const onUp = () => {
      if (!dragging.current) return
      dragging.current = false
      setDragOverlay(false)
      window.api.setSetting('splitRatio', useStore.getState().splitRatio)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [setSplitRatio])

  const startDrag = (e) => {
    e.preventDefault()
    dragging.current = true
    setDragOverlay(true)
  }
  const resetRatio = () => {
    setSplitRatio(2 / 3)
    window.api.setSetting('splitRatio', 2 / 3)
  }

  const pct = Math.round(splitRatio * 100)

  return (
    <div className="flex h-full flex-col bg-[#F4F6F8] text-[#334155]">
      <Header />
      <div ref={containerRef} className="app-main relative flex min-h-0 flex-1 gap-4 overflow-x-auto px-4 py-4">
        {!halfMode && (
          <div className="min-w-0 overflow-hidden rounded-2xl bg-white shadow-[0_4px_12px_rgba(0,0,0,0.03)]" style={{ width: `${pct}%` }}>
            <Viewer />
          </div>
        )}
        {!halfMode && (
          <div
            className="group relative w-1.5 shrink-0 cursor-col-resize rounded-full bg-[#E2E8F0] transition-colors duration-150 hover:bg-[#5B4DFB]"
            title="드래그하여 좌/우 크기 조절 (더블클릭 시 2/3 기본 복원)"
            onPointerDown={startDrag}
            onDoubleClick={resetRatio}
          >
            <div className="absolute left-1/2 top-[45%] h-8 w-0.5 -translate-x-1/2 rounded bg-[#94A3B8] group-hover:bg-white" />
          </div>
        )}
        <div className="min-w-0 flex-1 overflow-hidden rounded-2xl bg-white shadow-[0_4px_12px_rgba(0,0,0,0.03)]">
          <Grid />
        </div>
        {dragOverlay && <div className="absolute inset-0 z-30 cursor-col-resize" />}
      </div>
      <StatusBar />
      {mapping && <MappingModal />}
      {extensionModal && <ExtensionModal />}
      {bookmarkModal && <BookmarkProfileModal />}
      {rulesModal && <RulesModal />}
      {settingsModal && <SettingsModal />}
      {adminModal && <AdminModal />}
      <BookmarkProgress />
      <Toasts />
    </div>
  )
}
