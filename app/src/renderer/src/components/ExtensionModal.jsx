import React, { useEffect, useState } from 'react'
import { useStore } from '../store'

export default function ExtensionModal() {
  const setExtensionModal = useStore(s => s.setExtensionModal)
  const toast = useStore(s => s.toast)
  const [dir, setDir] = useState('')
  const [copied, setCopied] = useState(null)

  useEffect(() => {
    window.api.extensionInfo().then(r => setDir((r && r.dir) || ''))
  }, [])

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(null), 3000)
    return () => clearTimeout(t)
  }, [copied])

  const copyDir = async () => {
    await window.api.copyText(dir)
    setCopied({ label: '캡처 확장 폴더 경로 (설치 도구에서 선택)', text: dir, tip: '📋 복사되었습니다 — 도구의 폴더 선택 창에 붙여넣을 수 있습니다.' })
    toast('확장 폴더 경로를 클립보드에 복사했습니다', 'ok')
  }

  const runV2 = async () => {
    const res = await window.api.runExtensionV2()
    if (res && res.error) toast(`version2 실행 실패: ${res.error}`, 'err')
    else toast('version2 설치 도구를 실행했습니다 — 창에서 브라우저 프로필을 선택하고 [개발자 모드 켜기 + 익스텐션 설치]를 누르세요', 'ok', 6000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="max-h-[90%] w-[640px] overflow-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-3">
          <h2 className="text-[15px] font-bold text-[#1E293B]">🧩 익스텐션 자동 설치 안내</h2>
          <button className="rounded px-2 py-0.5 text-[13px] text-[#94A3B8] hover:bg-[#F1F5F9]" onClick={() => setExtensionModal(false)}>✕ 닫기</button>
        </div>

        <div className="space-y-3 px-4 py-4">
          <div className="rounded-lg border-2 border-[#5B4DFB] bg-[#EEEDFE] p-3">
            <div className="text-[13.5px] font-bold text-[#1E293B]">🧪 version2 확장 실행 (자동 설치)</div>
            <ol className="mt-1.5 space-y-1">
              <li className="flex gap-2 text-[12.5px] text-[#334155]">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#5B4DFB] text-[11px] font-bold text-white">1</span>
                <span>아래 [▶ version2 확장 실행] 버튼을 누릅니다 — 설치 도구가 열립니다.</span>
              </li>
              <li className="flex gap-2 text-[12.5px] text-[#334155]">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#5B4DFB] text-[11px] font-bold text-white">2</span>
                <span>설치할 브라우저 프로필을 선택합니다.</span>
              </li>
              <li className="flex gap-2 text-[12.5px] text-[#334155]">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#5B4DFB] text-[11px] font-bold text-white">3</span>
                <span>[개발자 모드 켜기 + 익스텐션 설치]를 누르면 — 브라우저 종료 → 개발자 모드 켜기 → <b>품의캡처 확장 자동 로드</b>까지 한 번에 진행됩니다.</span>
              </li>
            </ol>
            <button
              className="mt-2.5 w-full rounded-md bg-[#5B4DFB] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#4C3DE6]"
              onClick={runV2}
            >
              ▶ version2 확장 실행
            </button>
            <p className="mt-1.5 text-[11.5px] text-[#64748B]">실행 중 브라우저가 잠시 종료되었다가 자동으로 다시 열립니다. 기존 버전1 확장은 그대로 유지됩니다.</p>
          </div>

          <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
            <div className="mb-1.5 text-[13.5px] font-bold text-[#1E293B]">📍 품의캡처 확장 폴더 (설치 도구에서 선택하는 폴더)</div>
            <div className="break-all rounded border border-[#E2E8F0] bg-white px-2.5 py-1.5 font-mono text-[11.5px] text-[#334155]">{dir}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="rounded-md bg-[#5B4DFB] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#4C3DE6]" onClick={copyDir}>📋 경로 복사</button>
              <button className="rounded-md border border-[#E2E8F0] bg-white px-4 py-2 text-[13px] font-semibold text-[#334155] hover:bg-[#F1F5F9]" onClick={() => window.api.openExtensionFolder()}>📁 폴더 열기</button>
            </div>
            <p className="mt-1.5 text-[11.5px] text-[#64748B]">
              이 폴더의 manifest.json + background.js가 캡처 확장 본체입니다. 앱 실행 시 항상 최신 코드로 자동 갱신됩니다.
              자동 설치 도구에서 폴더를 직접 선택할 때는 이 경로를 사용하세요.
            </p>
          </div>

          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-[12.5px] text-emerald-900">
            <div className="font-bold">✅ 설치 완료 확인</div>
            <p className="mt-1">
              브라우저 확장 목록에서 <b>"품의캡처"</b>가 켜져 있으면 완성입니다.
              이후 주문/장바구니 화면에서 <b>품의캡처 아이콘</b>을 누르면 북마크의 품의캡처와 똑같이 캡처가 프로그램으로 전송됩니다.
            </p>
          </div>

          {copied && (
            <div className="sticky bottom-0 rounded-lg border-2 border-[#5B4DFB] bg-[#EEEDFE] px-4 py-3 shadow-lg">
              <div className="mb-1 text-[13px] font-bold text-[#4C3DE6]">📌 {copied.label}</div>
              <div className="break-all rounded border border-[#DDD9FC] bg-white px-2 py-1.5 font-mono text-[13px] font-bold text-[#4C3DE6]">{copied.text}</div>
              <div className="mt-1.5 text-[13px] font-medium text-[#5B4DFB]">{copied.tip}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
