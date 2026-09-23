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

  const btn = 'rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1.5 text-[12.5px] font-medium text-[#334155] transition-colors duration-150 hover:border-[#CBD5E1] hover:bg-[#F1F5F9] active:bg-[#E2E8F0]'
  const mini = 'rounded-md px-2 py-1 text-[11.5px] text-[#64748B] transition-colors duration-150 hover:bg-[#F1F5F9] hover:text-[#1E293B]'

  return (
    <header className="flex items-center gap-2 border-b border-[#E2E8F0] bg-white px-5 py-3 text-[#1E293B]">
      <h1 className="mr-4 flex items-center gap-2 text-[18px] font-bold tracking-tight text-[#5B4DFB]">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EEEDFE] text-[15px]">📦</span>
        자동 품의 요구 생성기
      </h1>
      <button className={btn} onClick={openFolder}>MHTML 폴더 열기</button>
      <button className={btn} onClick={openFiles}>MHTML 파일 열기</button>
      <button className={btn} onClick={() => loadExcelFlow()}>기존 엑셀 불러오기</button>
      {showRuleAdd && <button className={btn} onClick={() => startMapping()}>새 쇼핑몰 규칙 추가</button>}
      <div className="ml-auto flex items-center gap-2">
        <button
          className="rounded-lg bg-[#FEF3C7] px-3 py-1.5 text-[12.5px] font-bold text-[#B45309] transition-colors duration-150 hover:bg-[#FDE68A] active:bg-[#FCD34D]"
          onClick={addBookmarklets}
          title="Chrome/Edge/웨일 북마크바 제일 앞에 🛒품의캡처를 자동 추가합니다 (실행 중이면 닫았다가 다시 열어요)"
        >
          ⭐ 북마크바 추가
        </button>
        <button
          className="rounded-lg bg-[#EEEDFE] px-3 py-1.5 text-[12.5px] font-bold text-[#5B4DFB] transition-colors duration-150 hover:bg-[#E0DCFD] active:bg-[#D5CFFC]"
          onClick={() => setExtensionModal(true)}
          title="확장 프로그램 설치 도우미 열기"
        >
          🧩 익스텐션 추가
        </button>
        <button
          className={mini}
          onClick={() => setRulesModal(true)}
          title="사용자가 만든 쇼핑몰 규칙 관리/삭제"
        >
          🗑 규칙 관리
        </button>
        <button
          className="rounded-md px-2.5 py-1 text-[12.5px] font-bold text-[#64748B] transition-colors duration-150 hover:bg-[#F1F5F9] hover:text-[#1E293B]"
          onClick={() => setSettingsModal(true)}
          title="설정 — 규칙 추가 버튼 표시, 사용 매뉴얼"
        >
          ⚙ 설정
        </button>
      </div>
    </header>
  )
}
