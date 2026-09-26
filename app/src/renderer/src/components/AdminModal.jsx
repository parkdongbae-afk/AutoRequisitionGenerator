import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'

const DEFAULT_MODEL = 'gemini-3.1-flash-lite'

const GEMINI_MODELS = [
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite (기본)' },
  { id: 'gemini-3.1-flash', label: 'Gemini 3.1 Flash' },
  { id: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro (정밀, 느림)' },
  { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
  { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro (정밀, 느림)' },
  { id: 'gemini-2.5-flash-lite', label: 'gemini-2.5-flash-lite (최저가)' },
  { id: 'gemini-2.0-flash', label: 'gemini-2.0-flash' },
  { id: 'gemini-1.5-pro', label: 'gemini-1.5-pro' },
  { id: 'gemini-1.5-flash', label: 'gemini-1.5-flash' }
]

const MAX_FILES = 2

const deriveId = (name) => {
  const s = String(name || '').toLowerCase().replace(/-cart$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return s || ''
}

const baseName = (p) => String(p || '').split(/[\\/]/).pop()

function FileMultiRow({ label, hint, required, files, onAdd, onRemove }) {
  const full = files.length >= MAX_FILES
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="w-24 shrink-0 text-[12.5px] font-medium text-[#334155]">
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
          {!required && <span className="ml-1 text-[10.5px] text-[#94A3B8]">(선택)</span>}
        </span>
        <button
          className={`shrink-0 rounded-md border border-[#E2E8F0] bg-white px-2.5 py-1 text-[11.5px] font-semibold ${full ? 'cursor-not-allowed text-[#CBD5E1]' : 'text-[#334155] hover:bg-[#F1F5F9]'}`}
          onClick={onAdd}
          disabled={full}
        >
          파일 추가 ({files.length}/{MAX_FILES})
        </button>
        <span className="min-w-0 flex-1 truncate text-[11px] text-[#94A3B8]">{files.length ? '' : hint}</span>
      </div>
      {files.map((f, i) => (
        <div key={f} className="ml-[104px] mt-1 flex items-center gap-1.5">
          <span className="rounded bg-[#F1F5F9] px-1.5 py-0.5 text-[10px] text-[#64748B]">{i + 1}</span>
          <span className="min-w-0 flex-1 truncate text-[11.5px] text-[#334155]" title={f}>{baseName(f)}</span>
          <button className="shrink-0 rounded px-1.5 text-[11px] text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-red-500" onClick={() => onRemove(i)}>✕</button>
        </div>
      ))}
    </div>
  )
}

export default function AdminModal() {
  const setAdminModal = useStore(s => s.setAdminModal)
  const toast = useStore(s => s.toast)
  const refreshRules = useStore(s => s.refreshRules)
  const loadRulesVersion = useStore(s => s.loadRulesVersion)
  const showOpenFolder = useStore(s => s.showOpenFolder)
  const setShowOpenFolder = useStore(s => s.setShowOpenFolder)
  const showOpenFiles = useStore(s => s.showOpenFiles)
  const setShowOpenFiles = useStore(s => s.setShowOpenFiles)

  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [mallName, setMallName] = useState('')
  const [baseId, setBaseId] = useState('')
  const [idTouched, setIdTouched] = useState(false)
  const [cartFiles, setCartFiles] = useState([])
  const [orderFiles, setOrderFiles] = useState([])
  const [answerFile, setAnswerFile] = useState(null)
  const [doGit, setDoGit] = useState(true)
  const [logs, setLogs] = useState([])
  const [running, setRunning] = useState(false)
  const logBoxRef = useRef(null)

  const [showMalls, setShowMalls] = useState(false)
  const [malls, setMalls] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const appendLog = (line, level = 'info') => setLogs(prev => [...prev.slice(-399), { line, level }])

  useEffect(() => {
    window.api.getSettings().then(s => {
      if (s && s.adminGeminiApiKey) setApiKey(s.adminGeminiApiKey)
      if (s && s.adminGeminiModel) setModel(s.adminGeminiModel)
    })
  }, [])

  useEffect(() => {
    const off = window.api.onAdminLog(p => appendLog(p.line, p.level || 'info'))
    return off
  }, [])

  useEffect(() => {
    if (logBoxRef.current) logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight
  }, [logs])

  const loadSavedGemini = async () => {
    const s = await window.api.getSettings()
    if (s && (s.adminGeminiModel || s.adminGeminiApiKey)) {
      if (s.adminGeminiModel) setModel(s.adminGeminiModel)
      if (s.adminGeminiApiKey) setApiKey(s.adminGeminiApiKey)
      toast(`저장된 Gemini 설정을 불러왔습니다 — ${s.adminGeminiModel || '모델 저장 없음'}`, 'ok')
    } else {
      toast('저장된 Gemini 설정이 없습니다', 'warn')
    }
  }

  const setMallNameWrap = (v) => {
    setMallName(v)
    if (!idTouched) setBaseId(deriveId(v))
  }

  const pickFiles = async (kind, setter, current) => {
    const picked = await window.api.adminPickFile(kind)
    const add = (picked || []).filter(p => !current.includes(p))
    setter([...current, ...add].slice(0, MAX_FILES))
  }

  const toggleMalls = async () => {
    if (showMalls) {
      setShowMalls(false)
      return
    }
    const res = await window.api.adminListMalls()
    if (res && res.ok) {
      setMalls(res.malls)
      setShowMalls(true)
    } else {
      toast(`목록 조회 실패: ${(res && res.error) || '알 수 없는 오류'}`, 'err')
    }
  }

  const removeMall = async (id) => {
    setDeletingId(id)
    appendLog(`🗑 삭제 요청: ${id}`, 'step')
    const res = await window.api.adminDeleteMall({ id, doGit })
    setDeletingId(null)
    setConfirmDeleteId(null)
    if (res && res.ok) {
      appendLog(`✅ ${id} 삭제 완료 — rules.json ${doGit ? '갱신·커밋·푸시' : '갱신'}됨`, 'step')
      toast(`규칙 "${id}" 삭제 완료 — rules.json에 반영되었습니다`, 'ok', 6000)
      await refreshRules()
      await loadRulesVersion()
      const list = await window.api.adminListMalls()
      if (list && list.ok) setMalls(list.malls)
    } else {
      toast(`삭제 실패: ${(res && res.error) || '알 수 없는 오류'}`, 'err', 8000)
    }
  }

  const canRun = !running && apiKey.trim() && mallName.trim() && answerFile && (orderFiles.length || cartFiles.length) && deriveId(baseId)

  const run = async () => {
    if (!canRun) return
    setRunning(true)
    setLogs([{ line: '▶ 시작 — ' + new Date().toLocaleTimeString('ko-KR', { hour12: false }), level: 'step' }])
    window.api.setSetting('adminGeminiApiKey', apiKey.trim())
    window.api.setSetting('adminGeminiModel', model)
    const res = await window.api.adminRun({
      apiKey: apiKey.trim(),
      model,
      mallName: mallName.trim(),
      baseId: deriveId(baseId),
      cartFiles,
      orderFiles,
      answerFile,
      doGit
    })
    setRunning(false)
    if (res && res.ok) {
      await refreshRules()
      await loadRulesVersion()
      toast(`규칙 ${(res.ruleIds || []).join(' + ')} 생성 완료 — 규칙 관리에서 확인하세요`, 'ok', 6000)
    } else {
      const msg = (res && res.error) || '알 수 없는 오류'
      if (/트래픽이 많/.test(msg)) {
        appendLog('❌ ' + msg, 'err')
        await window.api.alertBox('현재 구글 서버 트래픽이 많으니 잠시 후 다시 시도하거나 모델을 변경해주세요.')
      } else {
        toast(`생성 실패: ${msg}`, 'err', 8000)
      }
    }
  }

  const input = 'w-full rounded-md border border-[#E2E8F0] bg-white px-2 py-1.5 text-[12.5px] text-[#1E293B]'
  const section = 'rounded-lg border border-[#E2E8F0] px-4 py-3'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="flex max-h-[92%] w-[1020px] max-w-full flex-col overflow-auto rounded-2xl bg-white shadow-2xl">
        <div style={{ zoom: 1.5 }} className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-3">
          <h2 className="text-[15px] font-bold text-[#1E293B]">🛡 새 쇼핑몰 규칙 자동 생성 (관리자)</h2>
          <div className="flex items-center gap-1">
            <button
              className="rounded px-2 py-0.5 text-[13px] text-[#64748B] hover:bg-[#F1F5F9]"
              onClick={() => window.api.openAdminManual()}
              title="관리자 매뉴얼(PDF) — 도구 사용법과 오류 대처"
            >
              📖 매뉴얼
            </button>
            <button className="rounded px-2 py-0.5 text-[13px] text-[#94A3B8] hover:bg-[#F1F5F9]" onClick={() => setAdminModal(false)}>✕ 닫기</button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-auto px-4 py-4">
          <div className={section}>
            <div className="mb-2 text-[13.5px] font-bold text-[#1E293B]">🔑 Gemini API</div>
            <div className="space-y-2">
              <input
                type="password"
                className={input}
                placeholder="Gemini API Key (aiza... — 실행 시 로컬 settings.json에 저장됩니다)"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <select className={input + ' flex-1'} value={model} onChange={e => setModel(e.target.value)}>
                  {GEMINI_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
                <button
                  className="shrink-0 rounded-md border border-[#E2E8F0] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#334155] hover:bg-[#F1F5F9]"
                  onClick={loadSavedGemini}
                  title="settings.json에 저장된 API 키와 모델을 다시 불러옵니다"
                >
                  💾 불러오기
                </button>
              </div>
            </div>
          </div>

          <div className={section}>
            <div className="mb-2 text-[13.5px] font-bold text-[#1E293B]">🏬 신규 쇼핑몰</div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-[12.5px] font-medium text-[#334155]">쇼핑몰 이름<span className="ml-1 text-red-500">*</span></span>
                <input className={input} placeholder="예: 무신사" value={mallName} onChange={e => setMallNameWrap(e.target.value)} />
              </div>
              <div className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-[12.5px] font-medium text-[#334155]">쇼핑몰 id</span>
                <input
                  className={input + ' flex-1 font-mono'}
                  placeholder="영문 소문자-하이픈 (예: musinsa)"
                  value={baseId}
                  onChange={e => { setIdTouched(true); setBaseId(e.target.value) }}
                />
              </div>
              <div className="ml-[104px] text-[11px] text-[#64748B]">
                {deriveId(baseId) ? (
                  <>
                    주문서 규칙 id: <span className="font-mono font-semibold text-[#4C3DE6]">{deriveId(baseId)}</span>
                    {' · '}
                    장바구니 규칙 id: <span className="font-mono font-semibold text-[#4C3DE6]">{deriveId(baseId)}-cart</span>
                  </>
                ) : (
                  '주문서 규칙은 입력한 id, 장바구니 규칙은 id-cart로 생성됩니다'
                )}
              </div>
            </div>
          </div>

          <div className={section}>
            <div className="mb-2 text-[13.5px] font-bold text-[#1E293B]">📁 샘플 파일 <span className="text-[11.5px] font-normal text-[#64748B]">(종류별 최대 2개 — HTML+MHTML 함께 넣으면 더 정확합니다)</span></div>
            <div className="space-y-2">
              <FileMultiRow
                label="주문서" hint="주문/결제 화면 HTML / MHTML — 이 파일만 넣으면 주문서 규칙만 생성"
                files={orderFiles}
                onAdd={() => pickFiles('sample', setOrderFiles, orderFiles)}
                onRemove={i => setOrderFiles(orderFiles.filter((_, j) => j !== i))}
              />
              <FileMultiRow
                label="장바구니" hint="장바구니 화면 HTML / MHTML — 이 파일만 넣으면 장바구니 규칙만 생성"
                files={cartFiles}
                onAdd={() => pickFiles('sample', setCartFiles, cartFiles)}
                onRemove={i => setCartFiles(cartFiles.filter((_, j) => j !== i))}
              />
              <FileMultiRow
                label="정답 엑셀" hint=".xls / .xlsx" required
                files={answerFile ? [answerFile] : []}
                onAdd={() => pickFiles('excel', v => setAnswerFile(v[0] || null), [])}
                onRemove={() => setAnswerFile(null)}
              />
            </div>
          </div>

          <div className={section}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13.5px] font-bold text-[#1E293B]">🏬 현재 구축된 쇼핑몰 목록</span>
              <button
                className="shrink-0 rounded-md border border-[#E2E8F0] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#334155] hover:bg-[#F1F5F9]"
                onClick={toggleMalls}
              >
                {showMalls ? '▲ 접기' : '▼ 목록 보기'}
              </button>
            </div>
            {showMalls && (
              <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-[#E2E8F0]">
                {(malls || []).map(m => (
                  <div key={m.id} className="flex items-center gap-2 border-b border-[#F1F5F9] px-3 py-1.5 last:border-b-0 hover:bg-[#F8FAFC]">
                    <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[#334155]">{m.name}</span>
                    <span className="shrink-0 font-mono text-[10.5px] text-[#94A3B8]">{m.id}</span>
                    {confirmDeleteId === m.id ? (
                      <>
                        <span className="shrink-0 text-[11px] font-semibold text-red-500">삭제할까요?</span>
                        <button
                          className="shrink-0 rounded bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-red-600 disabled:opacity-50"
                          disabled={deletingId === m.id || running}
                          onClick={() => removeMall(m.id)}
                        >
                          {deletingId === m.id ? '삭제 중...' : '예'}
                        </button>
                        <button className="shrink-0 rounded border border-[#E2E8F0] px-2 py-0.5 text-[11px] text-[#64748B] hover:bg-[#F1F5F9]" onClick={() => setConfirmDeleteId(null)}>아니오</button>
                      </>
                    ) : (
                      <button
                        className="shrink-0 rounded px-2 py-0.5 text-[11px] text-[#94A3B8] hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                        disabled={deletingId !== null || running}
                        onClick={() => setConfirmDeleteId(m.id)}
                      >
                        삭제
                      </button>
                    )}
                  </div>
                ))}
                {malls && !malls.length && <div className="px-3 py-3 text-[12px] text-[#94A3B8]">규칙이 없습니다</div>}
              </div>
            )}
            {showMalls && (
              <p className="mt-1.5 text-[11px] text-[#64748B]">
                삭제하면 소스 규칙·analysis 사본·실행 사본이 함께 지워지고 rules.json에서도 제외됩니다{doGit ? ' — Git 커밋/푸시까지 자동 반영됩니다.' : '.'}
              </p>
            )}
          </div>

          <label className="flex items-center justify-between gap-3 rounded-lg border border-[#E2E8F0] px-4 py-3">
            <span className="text-[13.5px] text-[#1E293B]">
              MHTML 폴더 열기 버튼 표시
              <span className="mt-0.5 block text-[11.5px] text-[#64748B]">화면 상단의 "MHTML 폴더 열기" 버튼을 켜거나 끕니다 (기본: 끄기)</span>
            </span>
            <input
              type="checkbox"
              className="h-5 w-5 shrink-0 accent-blue-600"
              checked={!!showOpenFolder}
              onChange={e => setShowOpenFolder(e.target.checked)}
            />
          </label>

          <label className="flex items-center justify-between gap-3 rounded-lg border border-[#E2E8F0] px-4 py-3">
            <span className="text-[13.5px] text-[#1E293B]">
              MHTML 파일 열기 버튼 표시
              <span className="mt-0.5 block text-[11.5px] text-[#64748B]">화면 상단의 "MHTML 파일 열기" 버튼을 켜거나 끕니다 (기본: 끄기)</span>
            </span>
            <input
              type="checkbox"
              className="h-5 w-5 shrink-0 accent-blue-600"
              checked={!!showOpenFiles}
              onChange={e => setShowOpenFiles(e.target.checked)}
            />
          </label>

          <label className="flex items-center justify-between gap-3 rounded-lg border border-[#E2E8F0] px-4 py-3">
            <span className="text-[13.5px] text-[#1E293B]">
              Git 자동 커밋/푸시
              <span className="mt-0.5 block text-[11.5px] text-[#64748B]">생성·삭제된 규칙 JSON + rules.json을 커밋·푸시해 규칙 업데이트 서버에 반영합니다</span>
            </span>
            <input type="checkbox" className="h-5 w-5 shrink-0 accent-blue-600" checked={doGit} onChange={e => setDoGit(e.target.checked)} />
          </label>

          <div className="flex gap-2">
            <button
              className={`flex-1 rounded-md px-4 py-2.5 text-[13.5px] font-bold text-white transition-colors duration-150 ${canRun ? 'bg-[#5B4DFB] hover:bg-[#4C3DE6]' : 'cursor-not-allowed bg-[#C7C3F5]'}`}
              onClick={run}
              disabled={running || !canRun}
            >
              {running ? '⏳ 생성 중... (로그를 확인하세요)' : '🚀 쇼핑몰 규칙 생성 및 자동 배포 시작'}
            </button>
          </div>

          <div>
            <div className="mb-1 text-[12px] font-semibold text-[#64748B]">진행 로그</div>
            <div
              ref={logBoxRef}
              className="h-48 overflow-auto rounded-lg bg-[#0F172A] p-3 font-mono text-[11.5px] leading-relaxed text-[#CBD5E1]"
            >
              {logs.length === 0 && <div className="text-[#475569]">— 대기 중 —</div>}
              {logs.map((l, i) => (
                <div
                  key={i}
                  className={l.level === 'err' ? 'text-red-400' : l.level === 'step' ? 'font-bold text-[#A5B4FC]' : ''}
                >
                  {l.line}
                </div>
              ))}
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}
