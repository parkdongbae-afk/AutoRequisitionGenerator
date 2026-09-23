import React, { useEffect, useState } from 'react'
import { useStore } from '../store'

const BROWSERS = [
  {
    key: 'chrome', label: 'Chrome', emoji: '🔵', pageUrl: 'chrome://extensions',
    steps: [
      '크롬 브라우저를 직접 실행합니다.',
      '맨 위 주소창에 아래 주소를 입력하고 엔터를 누릅니다. (버튼을 누르면 주소가 자동으로 복사됩니다)',
      '페이지 오른쪽 위의 "개발자 모드" 스위치를 켬(파란색)으로 바꿉니다.',
      '상단의 "압축해제된 확장 프로그램 로드" 버튼을 클릭하면 폴더 선택 창이 열립니다.',
      '폴더 선택 창 상단의 경로 입력칸에 [경로 복사]로 복사한 확장 폴더 경로를 붙여넣고 엔터 → 해당 폴더 선택 후 [폴더 선택] 버튼을 누릅니다.',
      '확장 목록에 "품의 생성기"가 추가되었는지, 이름 옆 토글이 켜짐(파란색)인지 확인합니다. 꺼져 있으면 클릭해 켭니다.'
    ]
  },
  {
    key: 'edge', label: 'Edge', emoji: '🟦', pageUrl: 'edge://extensions',
    steps: [
      'Edge 브라우저를 직접 실행합니다.',
      '주소창에 아래 주소를 입력하고 엔터를 누릅니다. (버튼을 누르면 주소가 자동으로 복사됩니다)',
      '페이지 오른쪽 위(또는 상단)의 "개발자 모드" 스위치를 켭니다.',
      '"압축해제된 확장 프로그램 로드" 버튼을 클릭하면 폴더 선택 창이 열립니다.',
      '폴더 선택 창 상단의 경로 칸에 [경로 복사]로 복사한 확장 폴더 경로를 붙여넣고 엔터 → 해당 폴더 선택 후 [폴더 선택] / [열기] 버튼을 누릅니다.',
      '확장 목록에 "품의 생성기"가 추가되었는지, 토글이 켜져 있는지 확인합니다. 꺼져 있으면 켭니다.'
    ]
  },
  {
    key: 'whale', label: '웨일', emoji: '🐳', pageUrl: 'whale://extensions',
    steps: [
      '네이버 웨일 브라우저를 실행합니다.',
      '주소창에 아래 주소를 입력하고 엔터를 누릅니다. (버튼을 누르면 주소가 자동으로 복사됩니다)',
      '확장 페이지 오른쪽 위(또는 상단 메뉴)의 "개발자 모드"를 켭니다.',
      '"압축해제된 확장 프로그램 로드" 버튼이 활성화되면 클릭해 폴더 선택 창을 엽니다.',
      '폴더 선택 창 상단의 경로 칸에 [경로 복사]로 복사한 확장 폴더 경로를 붙여넣고 엔터 → 해당 폴더 선택 후 [폴더 선택] / [열기] 버튼을 누릅니다.',
      '확장 목록에 "품의 생성기"가 추가되었는지, 토글이 켜져 있는지 확인합니다. 꺼져 있으면 켭니다.'
    ]
  }
]

export default function ExtensionModal() {
  const setExtensionModal = useStore(s => s.setExtensionModal)
  const toast = useStore(s => s.toast)
  const [dir, setDir] = useState('')
  const [browser, setBrowser] = useState('chrome')
  const [copied, setCopied] = useState(null)

  useEffect(() => {
    window.api.extensionInfo().then(r => setDir((r && r.dir) || ''))
  }, [])

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(null), 3000)
    return () => clearTimeout(t)
  }, [copied])

  const b = BROWSERS.find(x => x.key === browser)

  const copyPageUrl = async () => {
    await window.api.copyText(b.pageUrl)
    setCopied({ label: `${b.label} 확장 페이지 주소`, text: b.pageUrl, tip: '📋 복사되었습니다 — 브라우저 주소창에 붙여넣고 엔터를 누르세요.' })
    toast(`${b.pageUrl} 주소를 클립보드에 복사했습니다`, 'ok')
  }

  const copyDir = async () => {
    await window.api.copyText(dir)
    setCopied({ label: '확장 프로그램 폴더 경로', text: dir, tip: '📋 복사되었습니다 — 폴더 선택 창의 주소 표시줄에 붙여넣고 엔터를 누르세요.' })
    toast('확장 프로그램 폴더 경로를 클립보드에 복사했습니다', 'ok')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="flex max-h-[90%] w-[720px] flex-col rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-[15px] font-bold text-slate-800">🧩 익스텐션 수동 설치 안내</h2>
          <button className="rounded px-2 py-0.5 text-[13px] text-slate-400 hover:bg-slate-100" onClick={() => setExtensionModal(false)}>✕ 닫기</button>
        </div>

        <div className="space-y-3 overflow-auto px-4 py-3">
          <div className="rounded-lg bg-amber-50 px-4 py-2.5 text-[12.5px] text-amber-900">
            브라우저 정책상 프로그램이 자동으로 설치해 드릴 수 없습니다. 아래 순서대로 <b>직접 설치</b>해 주세요. <b>한 번만 설치하면 이후 계속 자동</b>으로 사용됩니다.
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-1.5 text-[13.5px] font-bold text-slate-800">📍 0. 공통 준비 — 확장 프로그램 폴더 확인</div>
            <div className="break-all rounded border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-[11.5px] text-slate-700">{dir}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="rounded-md bg-emerald-600 px-4 py-2 text-[13px] font-bold text-white hover:bg-emerald-500" onClick={copyDir}>📋 경로 복사</button>
              <button className="rounded-md border border-slate-300 bg-white px-4 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-100" onClick={() => window.api.openExtensionFolder()}>📁 폴더 열기</button>
            </div>
            <p className="mt-1.5 text-[11.5px] text-slate-500">[폴더 열기]로 manifest.json 등 여러 파일이 보이면 정상입니다. 아래 단계에서 이 폴더를 선택하게 됩니다.</p>
          </div>

          <div className="flex gap-2">
            {BROWSERS.map(x => (
              <button
                key={x.key}
                className={`flex-1 rounded-lg border-2 px-3 py-2 text-[13.5px] font-bold transition ${
                  browser === x.key ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
                onClick={() => setBrowser(x.key)}
              >
                {x.emoji} {x.label}
              </button>
            ))}
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-[13.5px] font-bold text-slate-800">🛠 {b.label} 수동 설치 방법</span>
              <button
                className="ml-auto rounded-md bg-blue-600 px-3 py-1.5 text-[12.5px] font-bold text-white hover:bg-blue-500"
                onClick={copyPageUrl}
              >
                📋 {b.label} 확장 페이지 주소 복사
              </button>
            </div>
            <div className="mb-2 break-all rounded border border-blue-200 bg-blue-50 px-2 py-1 text-center font-mono text-[12.5px] font-bold text-blue-900">{b.pageUrl}</div>
            <ol className="space-y-1.5">
              {b.steps.map((s, i) => (
                <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-slate-700">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[11px] font-bold text-white">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-[12.5px] text-emerald-900">
            <div className="font-bold">✅ 설치 후 공통 확인</div>
            <p className="mt-1">브라우저 오른쪽 위 확장 아이콘(퍼즐 모양)을 눌러 <b>"품의 생성기 - 주문화면 전송"</b>이 목록에 있고 토글이 켜져 있으면 설치 완성입니다. 자동 품의 요구 생성기 프로그램을 실행한 뒤 브라우저에서 주문서 화면을 열고 확장 아이콘을 누르면 캡처가 전송됩니다.</p>
          </div>

          {copied && (
            <div className="sticky bottom-0 rounded-lg border-2 border-blue-400 bg-blue-50 px-4 py-3 shadow-lg">
              <div className="mb-1 text-[13px] font-bold text-blue-800">📌 {copied.label}</div>
              <div className="break-all rounded border border-blue-200 bg-white px-2 py-1.5 font-mono text-[13px] font-bold text-blue-900">{copied.text}</div>
              <div className="mt-1.5 text-[13px] font-medium text-blue-700">{copied.tip}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
