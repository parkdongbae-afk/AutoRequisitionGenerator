import React, { useEffect } from 'react'
import { useStore } from '../store'

export default function SettingsModal() {
  const setSettingsModal = useStore(s => s.setSettingsModal)
  const showRuleAdd = useStore(s => s.showRuleAdd)
  const setShowRuleAdd = useStore(s => s.setShowRuleAdd)
  const zoomSensitivity = useStore(s => s.zoomSensitivity)
  const setZoomSensitivity = useStore(s => s.setZoomSensitivity)
  const startupStatus = useStore(s => s.startupStatus)
  const checkStartupStatus = useStore(s => s.checkStartupStatus)
  const registerStartup = useStore(s => s.registerStartup)
  const removeStartup = useStore(s => s.removeStartup)

  useEffect(() => {
    checkStartupStatus()
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="max-h-[90%] w-[540px] overflow-auto rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-[15px] font-bold text-slate-800">⚙ 설정</h2>
          <button className="rounded px-2 py-0.5 text-[13px] text-slate-400 hover:bg-slate-100" onClick={() => setSettingsModal(false)}>✕ 닫기</button>
        </div>

        <div className="space-y-3 px-4 py-4">
          <div className="rounded-lg border border-slate-200 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13.5px] text-slate-800">
                🖱 휠 줌 감도
                <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-[12px] font-bold text-blue-700">휠 한 칸당 {Number(zoomSensitivity).toFixed(1)}%</span>
              </span>
              <button
                className="shrink-0 rounded border border-slate-300 bg-white px-2 py-1 text-[11.5px] text-slate-600 hover:bg-slate-100"
                onClick={() => setZoomSensitivity(1.7)}
              >
                기본값
              </button>
            </div>
            <input
              type="range"
              min="0.5"
              max="10"
              step="0.1"
              value={Number(zoomSensitivity) || 1.7}
              onChange={e => setZoomSensitivity(e.target.value)}
              className="mt-2.5 w-full accent-blue-600"
            />
            <p className="mt-1 text-[11.5px] text-slate-500">왼쪽 미리보기에서 마우스 휠로 확대/축소하는 속도입니다 (느리게 ↔ 빠르게, 기본 1.7%)</p>
          </div>

          <div className="rounded-lg border border-slate-200 px-4 py-3">
            <div className="text-[13.5px] text-slate-800">
              🚀 시작 프로그램 (Windows 시작 시 자동 실행)
              <span className={`ml-2 rounded px-1.5 py-0.5 text-[12px] font-bold ${startupStatus && startupStatus.registered ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {startupStatus && startupStatus.registered ? '등록됨' : '미등록'}
              </span>
            </div>
            {startupStatus && startupStatus.registered && startupStatus.target && (
              <p className="mt-1 break-all text-[11px] text-slate-400">{startupStatus.target}</p>
            )}
            <div className="mt-2 flex gap-2">
              <button
                className="rounded-md bg-blue-600 px-4 py-2 text-[13px] font-bold text-white hover:bg-blue-500"
                onClick={registerStartup}
              >
                📌 등록
              </button>
              <button
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-100"
                onClick={removeStartup}
              >
                🗑 삭제
              </button>
            </div>
            <p className="mt-1.5 text-[11.5px] text-slate-500">이미 등록되어 있으면 [등록] 누를 때 "등록 되어 있습니다."라고 알려드립니다.</p>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3">
            <span className="text-[13.5px] text-slate-800">
              새 쇼핑몰 규칙 추가 버튼 표시
              <span className="mt-0.5 block text-[11.5px] text-slate-500">화면 상단의 "새 쇼핑몰 규칙 추가" 버튼을 켜거나 끕니다 (기본: 끄기)</span>
            </span>
            <input
              type="checkbox"
              className="h-5 w-5 shrink-0 accent-blue-600"
              checked={!!showRuleAdd}
              onChange={e => setShowRuleAdd(e.target.checked)}
            />
          </label>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3">
            <span className="text-[13.5px] text-slate-800">
              사용 매뉴얼 (PDF)
              <span className="mt-0.5 block text-[11.5px] text-slate-500">설치 방법과 사용법이 담긴 매뉴얼을 엽니다</span>
            </span>
            <button
              className="shrink-0 rounded-md bg-blue-600 px-4 py-2 text-[13px] font-bold text-white hover:bg-blue-500"
              onClick={() => window.api.openManual()}
            >
              📄 매뉴얼 보기
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
