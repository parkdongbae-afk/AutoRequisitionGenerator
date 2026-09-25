import React, { useEffect } from 'react'
import { useStore } from '../store'

export default function SettingsModal() {
  const setSettingsModal = useStore(s => s.setSettingsModal)
  const showRuleAdd = useStore(s => s.showRuleAdd)
  const setShowRuleAdd = useStore(s => s.setShowRuleAdd)
  const zoomSensitivity = useStore(s => s.zoomSensitivity)
  const setZoomSensitivity = useStore(s => s.setZoomSensitivity)
  const gridFontScale = useStore(s => s.gridFontScale)
  const setGridFontScale = useStore(s => s.setGridFontScale)
  const startupStatus = useStore(s => s.startupStatus)
  const checkStartupStatus = useStore(s => s.checkStartupStatus)
  const registerStartup = useStore(s => s.registerStartup)
  const removeStartup = useStore(s => s.removeStartup)
  const inboxRetentionDays = useStore(s => s.inboxRetentionDays)
  const setInboxRetentionDays = useStore(s => s.setInboxRetentionDays)
  const rulesUpdateUrl = useStore(s => s.rulesUpdateUrl)
  const setRulesUpdateUrl = useStore(s => s.setRulesUpdateUrl)
  const checkRuleUpdates = useStore(s => s.checkRuleUpdates)
  const ruleUpdateStatus = useStore(s => s.ruleUpdateStatus)

  useEffect(() => {
    // 설정을 열면 저장된 주소로 최신 상태를 자동 확인해 표시한다(조용히 — 결과만 띄움)
    if (rulesUpdateUrl) checkRuleUpdates(true)
  }, [])

  useEffect(() => {
    checkStartupStatus()
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="max-h-[90%] w-[540px] overflow-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-3">
          <h2 className="text-[15px] font-bold text-[#1E293B]">⚙ 설정</h2>
          <button className="rounded px-2 py-0.5 text-[13px] text-[#94A3B8] hover:bg-[#F1F5F9]" onClick={() => setSettingsModal(false)}>✕ 닫기</button>
        </div>

        <div className="space-y-3 px-4 py-4">
          <div className="rounded-lg border border-[#E2E8F0] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13.5px] text-[#1E293B]">
                🖱 휠 줌 감도
                <span className="ml-2 rounded bg-[#EEEDFE] px-1.5 py-0.5 text-[12px] font-bold text-[#5B4DFB]">휠 한 칸당 {Number(zoomSensitivity).toFixed(1)}%</span>
              </span>
              <button
                className="shrink-0 rounded border border-[#E2E8F0] bg-white px-2 py-1 text-[11.5px] text-[#64748B] hover:bg-[#F1F5F9]"
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
            <p className="mt-1 text-[11.5px] text-[#64748B]">왼쪽 미리보기에서 마우스 휠로 확대/축소하는 속도입니다 (느리게 ↔ 빠르게, 기본 1.7%)</p>
          </div>

          <div className="rounded-lg border border-[#E2E8F0] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13.5px] text-[#1E293B]">
                🔠 추출 결과 글자 크기
                <span className="ml-2 rounded bg-[#EEEDFE] px-1.5 py-0.5 text-[12px] font-bold text-[#5B4DFB]">기본의 {Math.round((Number(gridFontScale) || 1.5) * 100)}%</span>
              </span>
              <button
                className="shrink-0 rounded border border-[#E2E8F0] bg-white px-2 py-1 text-[11.5px] text-[#64748B] hover:bg-[#F1F5F9]"
                onClick={() => setGridFontScale(1.5)}
              >
                기본값
              </button>
            </div>
            <input
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={Number(gridFontScale) || 1.5}
              onChange={e => setGridFontScale(e.target.value)}
              className="mt-2.5 w-full accent-blue-600"
            />
            <p className="mt-1 text-[11.5px] text-[#64748B]">오른쪽 추출 결과 표의 글자 크기입니다 (기본 150%). 열 폭은 표 머리글 경계를 드래그해 조절할 수 있습니다.</p>
          </div>

          <div className="rounded-lg border border-[#E2E8F0] px-4 py-3">
            <div className="text-[13.5px] text-[#1E293B]">
              🚀 시작 프로그램 (Windows 시작 시 자동 실행)
              <span className={`ml-2 rounded px-1.5 py-0.5 text-[12px] font-bold ${startupStatus && startupStatus.registered ? 'bg-emerald-100 text-emerald-700' : 'bg-[#F1F5F9] text-[#64748B]'}`}>
                {startupStatus && startupStatus.registered ? '등록됨' : '미등록'}
              </span>
            </div>
            {startupStatus && startupStatus.registered && startupStatus.target && (
              <p className="mt-1 break-all text-[11px] text-[#94A3B8]">{startupStatus.target}</p>
            )}
            <div className="mt-2 flex gap-2">
              <button
                className="rounded-md bg-[#5B4DFB] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#4C3DE6]"
                onClick={registerStartup}
              >
                📌 등록
              </button>
              <button
                className="rounded-md border border-[#E2E8F0] bg-white px-4 py-2 text-[13px] font-semibold text-[#334155] hover:bg-[#F1F5F9]"
                onClick={removeStartup}
              >
                🗑 삭제
              </button>
            </div>
            <p className="mt-1.5 text-[11.5px] text-[#64748B]">이미 등록되어 있으면 [등록] 누를 때 "등록 되어 있습니다."라고 알려드립니다.</p>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-[#E2E8F0] px-4 py-3">
            <span className="text-[13.5px] text-[#1E293B]">
              📥 캡처 파일 보관 기간
              <span className="mt-0.5 block text-[11.5px] text-[#64748B]">프로그램 시작 시 inbox 폴더에서 이 기간이 지난 캡처 파일을 자동 삭제합니다 (기본 5일, 0 = 끔)</span>
            </span>
            <div className="flex shrink-0 items-center gap-1.5">
              <input
                type="number"
                min="0"
                max="365"
                value={Number(inboxRetentionDays) || 0}
                onChange={e => setInboxRetentionDays(e.target.value)}
                className="w-20 rounded-md border border-[#E2E8F0] bg-white px-2 py-1 text-right text-[12.5px] text-[#1E293B]"
              />
              <span className="text-[12px] text-[#64748B]">일</span>
            </div>
          </div>

          <div className="rounded-lg border border-[#E2E8F0] px-4 py-3">
            <div className="text-[13.5px] text-[#1E293B]">🛒 쇼핑몰 규칙 업데이트 (GitHub)</div>
            <input
              type="text"
              value={rulesUpdateUrl || ''}
              onChange={e => setRulesUpdateUrl(e.target.value)}
              placeholder="https://raw.githubusercontent.com/사용자/저장소/main/rules.json"
              className="mt-2 w-full rounded-md border border-[#E2E8F0] bg-white px-2 py-1.5 text-[12px] text-[#1E293B]"
            />
            <p className="mt-1 text-[11.5px] text-[#64748B]">
              깃허브에 올린 규칙 JSON(규칙 객체 배열)을 내려받아 <b>같은 id의 내장 규칙을 최신 내용으로 덮어씁니다</b> — 네이버·쿠팡 장바구니 등 모든 규칙 가능. 규칙이 없는 쇼핑몰이 개편되면 개발자에게 새 규칙을 요청하세요.
            </p>
            <button
              className="mt-2 rounded-md bg-[#5B4DFB] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#4C3DE6]"
              onClick={() => checkRuleUpdates(false)}
            >
              ⬇ 업데이트 확인
            </button>
            {ruleUpdateStatus && ruleUpdateStatus.at && (
              <div
                className={`mt-2 rounded-lg px-3 py-2 text-[12px] ${
                  !ruleUpdateStatus.ok
                    ? 'border border-red-200 bg-red-50 text-red-700'
                    : ruleUpdateStatus.upToDate
                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border border-[#DDD9FC] bg-[#EEEDFE] text-[#4C3DE6]'
                }`}
              >
                {!ruleUpdateStatus.ok ? (
                  <>⚠ 확인 실패 — {ruleUpdateStatus.message}</>
                ) : ruleUpdateStatus.upToDate ? (
                  <>✅ 모든 쇼핑몰 규칙이 최신입니다 <span className="text-[11px] opacity-70">(확인: {ruleUpdateStatus.at})</span></>
                ) : (
                  <>
                    ⬆ 갱신 가능: {(ruleUpdateStatus.updated || []).concat(ruleUpdateStatus.created || []).join(', ')}
                    <span className="ml-1 text-[11px] opacity-70">(확인: {ruleUpdateStatus.at} — [업데이트 확인]을 눌러 적용)</span>
                  </>
                )}
              </div>
            )}
          </div>

          <label className="flex items-center justify-between gap-3 rounded-lg border border-[#E2E8F0] px-4 py-3">
            <span className="text-[13.5px] text-[#1E293B]">
              새 쇼핑몰 규칙 추가 버튼 표시
              <span className="mt-0.5 block text-[11.5px] text-[#64748B]">화면 상단의 "새 쇼핑몰 규칙 추가" 버튼을 켜거나 끕니다 (기본: 끄기)</span>
            </span>
            <input
              type="checkbox"
              className="h-5 w-5 shrink-0 accent-blue-600"
              checked={!!showRuleAdd}
              onChange={e => setShowRuleAdd(e.target.checked)}
            />
          </label>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-[#E2E8F0] px-4 py-3">
            <span className="text-[13.5px] text-[#1E293B]">
              사용 매뉴얼 (PDF)
              <span className="mt-0.5 block text-[11.5px] text-[#64748B]">설치 방법과 사용법이 담긴 매뉴얼을 엽니다</span>
            </span>
            <button
              className="shrink-0 rounded-md bg-[#5B4DFB] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#4C3DE6]"
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
