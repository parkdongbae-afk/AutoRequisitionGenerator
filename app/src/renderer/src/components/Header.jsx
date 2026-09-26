import React from 'react'
import { useStore } from '../store'
export default function Header() {
  const openFolder = useStore(s => s.openFolder)
  const openFiles = useStore(s => s.openFiles)
  const loadExcelFlow = useStore(s => s.loadExcelFlow)
  const startMapping = useStore(s => s.startMapping)
  const setExtensionModal = useStore(s => s.setExtensionModal)
  const setBookmarkModal = useStore(s => s.setBookmarkModal)
  const runExtensionV2Flow = useStore(s => s.runExtensionV2Flow)
  const setRulesModal = useStore(s => s.setRulesModal)
  const setSettingsModal = useStore(s => s.setSettingsModal)
  const showRuleAdd = useStore(s => s.showRuleAdd)
  const showOpenFolder = useStore(s => s.showOpenFolder)
  const showOpenFiles = useStore(s => s.showOpenFiles)
  const showBookmarkAdd = useStore(s => s.showBookmarkAdd)
  const showExtensionAdd = useStore(s => s.showExtensionAdd)
  const showHalfButton = useStore(s => s.showHalfButton)
  const halfMode = useStore(s => s.halfMode)
  const setHalfMode = useStore(s => s.setHalfMode)

  const btn = 'rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1.5 text-[12.5px] font-medium text-[#334155] transition-colors duration-150 hover:border-[#CBD5E1] hover:bg-[#F1F5F9] active:bg-[#E2E8F0]'
  const mini = 'rounded-md px-2 py-1 text-[11.5px] text-[#64748B] transition-colors duration-150 hover:bg-[#F1F5F9] hover:text-[#1E293B]'

  return (
    <header className="app-header flex flex-wrap items-center gap-2 border-b border-[#E2E8F0] bg-white px-5 py-3 text-[#1E293B]" style={{ zoom: 1.5 }}>
      <h1 className="mr-4 flex items-center gap-2 text-[18px] font-bold tracking-tight text-[#5B4DFB]">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EEEDFE] text-[15px]">📦</span>
        자동 품의 요구 생성기
      </h1>
      {showOpenFolder && <button className={btn} onClick={openFolder}>MHTML 폴더 열기</button>}
      {showOpenFiles && <button className={btn} onClick={openFiles}>MHTML 파일 열기</button>}
      <button className={btn} onClick={() => loadExcelFlow()}>기존 엑셀 불러오기</button>
      {showRuleAdd && <button className={btn} onClick={() => startMapping()}>새 쇼핑몰 규칙 추가</button>}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {showHalfButton && (
          <button
            className={`rounded-lg px-3 py-1.5 text-[12.5px] font-bold transition-colors duration-150 ${
              halfMode
                ? 'bg-[#5B4DFB] text-white hover:bg-[#4C3DE6]'
                : 'border border-[#E2E8F0] bg-[#F8FAFC] text-[#334155] hover:border-[#CBD5E1] hover:bg-[#F1F5F9]'
            }`}
            onClick={() => {
              const next = !halfMode
              setHalfMode(next)
              if (next) window.api.snapRightHalf()
            }}
            title="반반 — 미리보기를 숨기고 이 프로그램을 화면 오른쪽 절반에 맞춥니다. 왼쪽 절반은 다른 프로그램을 배치해 사용하세요. 다시 누르면 미리보기가 돌아옵니다."
          >
            ▣ 반반
          </button>
        )}
        {showBookmarkAdd && (
          <button
            className="rounded-lg bg-[#FEF3C7] px-3 py-1.5 text-[12.5px] font-bold text-[#B45309] transition-colors duration-150 hover:bg-[#FDE68A] active:bg-[#FCD34D]"
            onClick={() => setBookmarkModal(true)}
            title="Chrome/Edge/웨일 북마크바 제일 앞에 🛒품의캡처를 자동 추가합니다 (브라우저·프로필을 선택할 수 있습니다)"
          >
            ⭐ 북마크바 추가
          </button>
        )}
        {showExtensionAdd && (
          <button
            className="rounded-lg bg-[#EEEDFE] px-3 py-1.5 text-[12.5px] font-bold text-[#5B4DFB] transition-colors duration-150 hover:bg-[#E0DCFD] active:bg-[#D5CFFC]"
            onClick={runExtensionV2Flow}
            title="확장 프로그램 개발자 모드 및 자동 설치 도구를 바로 실행합니다"
          >
            🧩 익스텐션 추가
          </button>
        )}
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
