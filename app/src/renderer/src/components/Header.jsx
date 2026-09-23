import React from 'react'
import { useStore } from '../store'
export default function Header() {
  const openFolder = useStore(s => s.openFolder)
  const openFiles = useStore(s => s.openFiles)
  const loadExcelFlow = useStore(s => s.loadExcelFlow)
  const startMapping = useStore(s => s.startMapping)
  const addBookmarklets = useStore(s => s.addBookmarklets)
  const setExtensionModal = useStore(s => s.setExtensionModal)
  const setRulesModal = useStore(s => s.setRulesModal)
  const setSettingsModal = useStore(s => s.setSettingsModal)
  const showRuleAdd = useStore(s => s.showRuleAdd)

  const btn = 'rounded-md bg-slate-700 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-slate-600 active:bg-slate-800'

  return (
    <header className="flex items-center gap-2 border-b border-slate-300 bg-slate-800 px-4 py-2 text-white">
      <h1 className="mr-4 text-[15px] font-bold tracking-tight">📦 자동 품의 요구 생성기</h1>
      <button className={btn} onClick={openFolder}>MHTML 폴더 열기</button>
      <button className={btn} onClick={openFiles}>MHTML 파일 열기</button>
      <button className={btn} onClick={() => loadExcelFlow()}>기존 엑셀 불러오기</button>
      {showRuleAdd && <button className={btn} onClick={() => startMapping()}>새 쇼핑몰 규칙 추가</button>}
      <div className="ml-auto flex items-center gap-2">
        <button
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-[12.5px] font-bold text-white hover:bg-emerald-500 active:bg-emerald-700"
          onClick={addBookmarklets}
          title="Chrome/Edge/웨일 북마크바 제일 앞에 🛒품의캡처를 자동 추가합니다 (실행 중이면 닫았다가 다시 열어요)"
        >
          ⭐ 북마크바 추가
        </button>
        <button
          className="rounded-md bg-blue-600 px-3 py-1.5 text-[12.5px] font-bold text-white hover:bg-blue-500"
          onClick={() => setExtensionModal(true)}
          title="확장 프로그램 설치 도우미 열기"
        >
          🧩 익스텐션 추가
        </button>
        <button
          className="rounded-md border border-slate-500 px-2 py-1 text-[11.5px] text-slate-200 hover:bg-slate-700"
          onClick={() => setRulesModal(true)}
          title="사용자가 만든 쇼핑몰 규칙 관리/삭제"
        >
          🗑 규칙 관리
        </button>
        <button
          className="rounded-md border border-slate-500 px-2.5 py-1 text-[12.5px] font-bold text-slate-100 hover:bg-slate-700"
          onClick={() => setSettingsModal(true)}
          title="설정 — 규칙 추가 버튼 표시, 사용 매뉴얼"
        >
          ⚙ 설정
        </button>
      </div>
    </header>
  )
}
