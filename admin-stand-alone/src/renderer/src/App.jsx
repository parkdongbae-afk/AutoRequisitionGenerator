import React, { useEffect, useState, useSyncExternalStore } from 'react'
import GeneratePanel from './GeneratePanel.jsx'
import AnswerMakerPanel from './AnswerMakerPanel.jsx'
import MappingPanel from './MappingPanel.jsx'
import DiffView from './DiffView.jsx'
import VerificationPanel from './VerificationPanel.jsx'
import GitPanel from './GitPanel.jsx'
import LogPanel from './LogPanel.jsx'
import { diffLines, diffSummary } from '../../shared/line-diff.js'
import { subscribe, getMappingActiveSnapshot, startMapping } from './mapping-state.js'

const TABS = [
  ['home', '🏠 홈'],
  ['generate', '🤖 새 규칙'],
  ['answer', '📑 엑셀 정답 만들기'],
  ['mapping', '🖱 클릭 매핑'],
  ['verify', '🧪 검증 센터'],
  ['git', '🚀 배포/Git'],
  ['backup', '💾 백업/복원'],
  ['settings', '⚙ 설정']
]

const PHASES = [
  ['Phase 0', '기준선 고정', '완료'],
  ['Phase 1', '관리자 앱 골격', '완료'],
  ['Phase 2', '프로젝트 탐지와 대시보드', '완료'],
  ['Phase 3', '규칙 조회·편집·검증', '완료'],
  ['Phase 4', '트랜잭션·백업', '완료 — 저장·삭제 트랜잭션'],
  ['Phase 5', '클릭 매핑', '완료'],
  ['Phase 6', 'Z.ai Coding Plan 연동', '완료 — 유사 규칙 자동 선정 포함'],
  ['Phase 7', '자가 검증·수정', '완료 — 실측 데이터 피드백 루프'],
  ['Phase 8', 'builtin·삭제·Git', '완료'],
  ['Phase 9', '전체 회귀·패키징', '완료 — E2E·portable']
]

const FONT_STEPS = [1.0, 1.1, 1.2, 1.3, 1.5]

export default function App() {
  console.info('[mapping-debug] App render entered')
  const [activeTab, setActiveTab] = useState('home')
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [jev, setJev] = useState(null)
  const [jevTesting, setJevTesting] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [keyMsg, setKeyMsg] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [fixtureMsg, setFixtureMsg] = useState('')

  const [project, setProject] = useState(null)
  const [rules, setRules] = useState([])
  const [editing, setEditing] = useState(null)
  const [editText, setEditText] = useState('')
  const [editOrig, setEditOrig] = useState('')
  const [showDiff, setShowDiff] = useState(false)
  const [msg, setMsg] = useState('')
  const mappingActive = useSyncExternalStore(subscribe, getMappingActiveSnapshot)
  const [txs, setTxs] = useState([])
  const [deleteAsk, setDeleteAsk] = useState(null)
  const [deleteTyped, setDeleteTyped] = useState('')
  const [lastLog, setLastLog] = useState(null)
  const [logCounts, setLogCounts] = useState({ error: 0, warn: 0 })
  const [showLogs, setShowLogs] = useState(false)
  const [q, setQ] = useState('')
  const [kindFilter, setKindFilter] = useState('all')
  const [fontScale, setFontScale] = useState(1.2)

  useEffect(() => {
    const off = window.ruleMgr.log.onLog(e => setLastLog(e))
    const t = setInterval(async () => { try { setLogCounts(await window.ruleMgr.log.counts()) } catch {} }, 2500)
    return () => { off(); clearInterval(t) }
  }, [])

  useEffect(() => {
    window.ruleMgr.settings.get()
      .then(s => setFontScale((s.ui && s.ui.fontScale) || 1.2))
      .catch(() => {})
  }, [])

  const shownRules = rules.filter(r => {
    if (q && !(String(r.id) + String(r.name)).toLowerCase().includes(q.toLowerCase())) return false
    if (kindFilter === 'cart' && !/-cart$/.test(r.id)) return false
    if (kindFilter === 'order' && /-cart$/.test(r.id)) return false
    return true
  })

  const refresh = async () => {
    setLoading(true)
    setError('')
    try {
      setStatus(await window.ruleMgr.zaiBridgeStatus())
      setJev(await window.ruleMgr.jev.getStatus())
    } catch (e) {
      setError(String(e.message || e))
    }
    setLoading(false)
  }

  const testJev = async () => {
    setJevTesting(true)
    try {
      const r = await window.ruleMgr.jev.testConnection()
      setJev(j => ({ ...(j || {}), test: r }))
    } catch (e) {
      setJev(j => ({ ...(j || {}), test: { ok: false, message: String(e.message || e) } }))
    }
    setJevTesting(false)
  }

  const loadProject = async (choose) => {
    const p = choose ? await window.ruleMgr.projectChoose() : await window.ruleMgr.projectDetect()
    if (p) { setProject(p); setRules(await window.ruleMgr.rulesList()) }
    else { setProject(null); setRules([]) }
  }

  const loadTxs = async () => setTxs(await window.ruleMgr.tx.list())

  const rollbackTx = async (id) => {
    if (!confirm(`트랜잭션 ${id}을(를) 되돌릴까요? 적용된 파일이 스냅샷으로 복원됩니다.`)) return
    const r = await window.ruleMgr.tx.rollback(id)
    setMsg(r.ok ? `되돌리기 완료: ${id}` : `되돌리기 실패: ${r.error}`)
    await loadTxs()
    await loadProject(false)
  }

  const editRule = async (id) => {
    const raw = await window.ruleMgr.rulesRead(id)
    setEditing(id)
    setEditText(raw)
    setEditOrig(raw)
  }
  const saveRule = async () => {
    try {
      const rule = JSON.parse(editText)
      await window.ruleMgr.rulesSave(project.repoRoot, rule)
      setMsg(`규칙 "${rule.id}" 저장 완료`)
      await loadProject(false)
      await loadTxs()
    } catch (e) { setMsg('저장 실패: ' + String(e.message || e)) }
  }
  const deleteRule = async (id) => {
    let targets = []
    try {
      targets = await window.ruleMgr.rulesDeletePreview(project.repoRoot, id)
    } catch (e) {
      setMsg('삭제 불가: ' + String(e.message || e))
      return
    }
    setDeleteAsk({ id, targets })
    setDeleteTyped('')
  }
  const confirmDelete = async () => {
    const { id } = deleteAsk
    if (deleteTyped !== id) { setMsg('규칙 ID가 일치하지 않습니다'); return }
    setDeleteAsk(null)
    const r = await window.ruleMgr.rulesDelete(id)
    setMsg(r && r.ok === false ? `삭제 실패(자동 복구됨): ${r.error || r.status}` : `삭제 완료: ${id} (트랜잭션 ${r.id || '-'})`)
    await loadProject(false)
    await loadTxs()
  }
  const registerBuiltin = async () => {
    const r = await window.ruleMgr.rulesBuiltin()
    setMsg('builtin 등록: ' + JSON.stringify(r && r.added ? r : r))
    await loadProject(false)
  }
  const rebuildJson = async () => {
    const r = await window.ruleMgr.rulesRebuildJson(true)
    setMsg(`rules.json 재생성: 규칙 ${r.count}건 · v${r.version}`)
    await loadProject(false)
  }
  const commitGit = async () => {
    if (!project) return
    const r = await window.ruleMgr.gitCommit(project.repoRoot, ['app/src/main/lib/rules', 'app/analysis/rules', 'rules.json'], 'feat: 쇼핑몰 규칙 갱신 (쇼핑몰 규칙 관리자)', false)
    setMsg(r.pushed ? '커밋+푸시 완료' : '커밋 완료(푸시 없음)')
  }

  const saveKey = async () => {
    try {
      const r = await window.ruleMgr.settings.setJevKey(keyInput)
      setKeyMsg(r && r.ok ? 'Key를 safeStorage로 암호화해 저장했습니다' : (r && r.message) || '저장 실패')
      setKeyInput('')
      setJev(await window.ruleMgr.jev.getStatus())
    } catch (e) { setKeyMsg('저장 실패: ' + String(e.message || e)) }
  }
  const clearKey = async () => {
    await window.ruleMgr.settings.clearJevKey()
    setKeyMsg('저장된 Key를 삭제했습니다')
    setJev(await window.ruleMgr.jev.getStatus())
  }

  const openMapping = async () => {
    const opened = await window.ruleMgr.mapping.openFile()
    if (opened) {
      startMapping(opened, { baseId: '', name: '', match: '', isCart: false })
      setActiveTab('mapping')
    }
  }

  const collectFixtures = async () => {
    setFixtureMsg('픽스처 판정 수집 중… (72케이스)')
    try {
      const r = await window.ruleMgr.shadowCollectFixtures()
      setFixtureMsg(`수집 완료: ${r.recorded}/${r.total} 기록 (Jev 오류 ${r.errors})`)
      setJev(await window.ruleMgr.jev.getStatus())
    } catch (e) {
      setFixtureMsg('수집 실패: ' + String(e.message || e))
    }
  }

  const changeFont = async (v) => {
    setFontScale(v)
    try { await window.ruleMgr.settings.set({ ui: { fontScale: v } }) } catch {}
  }

  useEffect(() => { refresh(); loadProject(false); loadTxs() }, [])
  useEffect(() => {
    console.info('[mapping-debug] effect enter')
    const un = subscribe(() => {
      console.info('[mapping-debug] notify — listeners will re-read snapshot')
    })
    console.info('[mapping-debug] subscribe complete')
    return un
  }, [])
  useEffect(() => {
    // useSyncExternalStore가 구독을 커밋 시점에 완료한 뒤 passive effect에서 handshake를 연다
    window.__mappingSubscriptionReady = true
    console.info('[mapping-debug] subscription ready')
  }, [])
  useEffect(() => {
    if (mappingActive) setActiveTab('mapping')
  }, [mappingActive])

  const diffStat = diffSummary(diffLines(editOrig, editText))

  return (
    <div style={{ fontFamily: 'Malgun Gothic, sans-serif', color: '#0f172a', zoom: fontScale }}>
      <header style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 40, borderBottom: '2px solid #5B4DFB', padding: '10px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h1 style={{ fontSize: 18, margin: 0 }}>쇼핑몰 규칙 관리자</h1>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>v0.13.0</span>
          {project && <span style={{ fontSize: 11, color: '#64748b' }}>{project.repoRoot.split(/[\\/]/).pop()} · 규칙 {project.rulesCount}종 · v{project.rulesJsonVersion || '?'}</span>}
        </div>
        <nav style={{ display: 'flex', gap: 2, marginTop: 8 }}>
          {TABS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{ padding: '7px 14px', cursor: 'pointer', border: 'none', borderRadius: '8px 8px 0 0', fontSize: 13, fontWeight: activeTab === id ? 700 : 400, background: activeTab === id ? '#5B4DFB' : '#eef2f7', color: activeTab === id ? '#fff' : '#334155' }}
            >{label}{id === 'mapping' && mappingActive ? ' ●' : ''}</button>
          ))}
        </nav>
      </header>

      <main style={{ padding: '16px 16px 48px' }}>
      <div style={{ display: activeTab === 'home' ? 'block' : 'none' }}>
        <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ fontSize: 15, margin: 0 }}>📁 대상 저장소</h2>
            <button onClick={() => loadProject(false)} style={{ marginLeft: 'auto', padding: '4px 12px', cursor: 'pointer' }}>다시 탐지</button>
            <button onClick={() => loadProject(true)} style={{ padding: '4px 12px', cursor: 'pointer' }}>폴더 선택…</button>
          </div>
          {project ? (
            <div style={{ fontSize: 12, marginTop: 6 }}>
              <p style={{ margin: '2px 0' }}>경로: {project.repoRoot}</p>
              <p style={{ margin: '2px 0' }}>규칙 {project.rulesCount}개 · rules.json v{project.rulesJsonVersion || '?'} · Git {project.git ? '연결' : '없음'}</p>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="ID·이름 검색" style={{ border: '1px solid #e2e8f0', borderRadius: 4, padding: '3px 8px', fontSize: 12, width: 200 }} />
                <select value={kindFilter} onChange={e => setKindFilter(e.target.value)} style={{ border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 12 }}>
                  <option value="all">전체 {rules.length}종</option>
                  <option value="cart">장바구니만</option>
                  <option value="order">주문서만</option>
                </select>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{shownRules.length}건 표시</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 6 }}>
                <thead><tr style={{ color: '#64748b' }}><th style={{ textAlign: 'left', padding: 3 }}>id</th><th style={{ textAlign: 'left' }}>이름</th><th style={{ textAlign: 'left' }}>checkedOnly</th><th style={{ textAlign: 'left' }}>optionRows</th><th style={{ textAlign: 'left' }}>조작</th></tr></thead>
                <tbody>
                  {shownRules.map(r => (
                    <tr key={r.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: 3 }}>{r.id}</td><td>{r.name}</td>
                      <td style={{ color: r.checkedOnly ? '#1a7f37' : '#94a3b8' }}>{r.checkedOnly ? '✓' : '—'}</td>
                      <td style={{ color: r.optionRows ? '#1a7f37' : '#94a3b8' }}>{r.optionRows ? '✓' : '—'}</td>
                      <td style={{ padding: 3 }}>
                        <button onClick={() => { editRule(r.id) }} style={{ marginRight: 4, cursor: 'pointer' }}>편집</button>
                        <button onClick={() => deleteRule(r.id)} style={{ cursor: 'pointer', color: '#dc2626' }}>삭제</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: '#b45309' }}>저장소를 찾지 못했습니다 — [폴더 선택…]으로 rules.json과 .git이 있는 폴더를 지정하세요.</p>
          )}
        </section>

        <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
          <h2 style={{ fontSize: 15, margin: '0 0 8px' }}>⚡ 빠른 작업</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setActiveTab('generate')} style={quickBtn}>🤖 새 규칙 만들기</button>
            <button onClick={openMapping} style={quickBtn}>🖱 클릭 매핑</button>
            <button onClick={() => setActiveTab('verify')} style={quickBtn}>🧪 검증 센터</button>
            <button onClick={registerBuiltin} style={quickBtn}>🧩 builtin 등록</button>
            <button onClick={rebuildJson} style={quickBtn}>📥 rules.json 재생성</button>
          </div>
        </section>
      </div>

      <div style={{ display: activeTab === 'generate' ? 'block' : 'none' }}>
        {project
          ? <GeneratePanel repoRoot={project.repoRoot} bridge={status} settings={null} onSaved={() => { loadProject(false); loadTxs() }} />
          : (
            <div style={{ border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 8, padding: 12, fontSize: 12 }}>
              <b>규칙을 생성하려면 먼저 대상 저장소를 선택하세요.</b>
              <button onClick={() => loadProject(true)} style={{ marginLeft: 8, padding: '3px 10px', cursor: 'pointer' }}>📁 폴더 선택…</button>
            </div>
          )}
      </div>

      <div style={{ display: activeTab === 'answer' ? 'block' : 'none' }}>
        <AnswerMakerPanel />
      </div>

      <div style={{ display: activeTab === 'mapping' ? 'block' : 'none' }}>
        {mappingActive && project
          ? <MappingPanel repoRoot={project.repoRoot} onSaved={() => { loadProject(false); loadTxs(); setMsg('매핑 규칙 저장 완료') }} />
          : (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, fontSize: 12 }}>
              캡처 HTML/MHTML을 열어 요소를 클릭하는 방식으로 규칙을 만듭니다.
              <button onClick={openMapping} style={{ marginLeft: 10, padding: '4px 14px', cursor: 'pointer' }}>📂 샘플 열기</button>
            </div>
          )}
      </div>

      <div style={{ display: activeTab === 'verify' ? 'block' : 'none' }}>
        {project
          ? <VerificationPanel rules={rules} onDone={loadProject} />
          : <p style={{ fontSize: 12, color: '#b45309' }}>먼저 대상 저장소를 선택하세요 (홈 탭 → 폴더 선택…).</p>}
      </div>

      <div style={{ display: activeTab === 'git' ? 'block' : 'none' }}>
        {project && project.git
          ? <GitPanel onDone={loadTxs} />
          : <p style={{ fontSize: 12, color: '#b45309' }}>Git 저장소가 연결된 대상 저장소를 선택하세요 (홈 탭).</p>}
      </div>

      <div style={{ display: activeTab === 'backup' ? 'block' : 'none' }}>
        <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ fontSize: 15, margin: 0 }}>💾 백업/복원 (트랜잭션 §13.2)</h2>
            <button onClick={loadTxs} style={{ marginLeft: 'auto', padding: '4px 12px', cursor: 'pointer' }}>새로고침</button>
          </div>
          {txs.length === 0 && <p style={{ fontSize: 12, color: '#94a3b8', margin: '6px 0 0' }}>아직 적용 이력이 없습니다 — 규칙 저장·생성 적용 시 자동 기록됩니다.</p>}
          {txs.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 6 }}>
              <tbody>
                {txs.map(t => (
                  <tr key={t.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: 3 }}>{String(t.finishedAt || '').replace('T', ' ').slice(0, 19)}</td>
                    <td style={{ padding: 3, color: t.status === 'applied' ? '#1a7f37' : t.status === 'rolled_back' ? '#94a3b8' : '#b45309' }}>{t.status}</td>
                    <td style={{ padding: 3, maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.changes.join('\n')}>
                      {t.changes.map(c => c.split(/[\\/]/).slice(-2).join('/')).join(', ')}
                    </td>
                    <td style={{ padding: 3 }}>
                      {t.status === 'applied'
                        ? <button onClick={() => rollbackTx(t.id)} style={{ cursor: 'pointer', color: '#b45309' }}>↩ 되돌리기</button>
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <div style={{ display: activeTab === 'settings' ? 'block' : 'none' }}>
        <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <h2 style={{ fontSize: 15, margin: '0 0 8px' }}>🔤 글자 크기 (File-Setting)</h2>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {FONT_STEPS.map(v => (
              <button key={v} onClick={() => changeFont(v)} style={{ padding: '5px 14px', cursor: 'pointer', border: '1px solid #e2e8f0', borderRadius: 6, background: fontScale === v ? '#5B4DFB' : '#fff', color: fontScale === v ? '#fff' : '#334155', fontWeight: fontScale === v ? 700 : 400 }}>
                {Math.round(v * 100)}%
              </button>
            ))}
            <span style={{ fontSize: 12, color: '#64748b' }}>현재 {Math.round(fontScale * 100)}% — 즉시 적용·자동 저장 (기본 120%)</span>
          </div>
        </section>

        <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ fontSize: 15, margin: 0 }}>⚖️ TypeSafe Jev — 판정 게이트</h2>
            <button onClick={testJev} disabled={jevTesting || !(jev && jev.configured)} style={{ marginLeft: 'auto', padding: '4px 12px', cursor: 'pointer' }}>
              {jevTesting ? '테스트 중…' : '연결 테스트'}
            </button>
          </div>
          <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0' }}>
            구성: <b>{jev ? (jev.configured ? 'TYPESAFE_API_KEY 설정됨' : '미설정 — 아래에서 저장 또는 환경변수 확인') : '확인 중…'}</b>
            {' · '}Shadow Mode: <b>{jev ? (jev.shadowMode ? '사용' : '끔') : '-'}</b>
          </p>
          {jev && jev.test && (
            <p style={{ fontSize: 12, color: jev.test.ok ? '#1a7f37' : '#dc2626', margin: '4px 0' }}>
              연결 테스트: {jev.test.ok ? '성공' : `실패${jev.test.code ? ` (${jev.test.code})` : ''} — ${jev.test.message}`}
            </p>
          )}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '8px 0' }}>
            <input type={showKey ? 'text' : 'password'} value={keyInput} onChange={e => setKeyInput(e.target.value)} placeholder="TYPESAFE_API_KEY" autoComplete="off" style={{ border: '1px solid #e2e8f0', borderRadius: 4, padding: '3px 6px', fontSize: 12, width: 260 }} />
            <button onClick={() => setShowKey(v => !v)} style={{ fontSize: 11, cursor: 'pointer' }}>{showKey ? '숨김' : '표시'}</button>
            <button onClick={saveKey} disabled={!keyInput} style={{ fontSize: 11, cursor: 'pointer' }}>💾 저장(safeStorage)</button>
            <button onClick={clearKey} style={{ fontSize: 11, cursor: 'pointer' }}>삭제</button>
            {keyMsg && <span style={{ fontSize: 11, color: '#4c3de6' }}>{keyMsg}</span>}
          </div>
          {jev && jev.stats && (
            <p style={{ fontSize: 12, margin: '4px 0', color: '#64748b' }}>
              Shadow 수집: 기록 {jev.stats.records}건 · Jev 판정 {jev.stats.judged}건 · 관리자 비교 {jev.stats.compared}건 · 일치 {jev.stats.agreed}건
              ({jev.stats.compared ? `${Math.round(jev.stats.agreement * 100)}%` : '-'})
              {jev.autoApprove && (
                <span style={{ color: jev.autoApprove.allowed ? '#1a7f37' : '#94a3b8' }}>
                  {' · '}자동 승인: {jev.autoApprove.allowed ? '가능' : `불가 — ${jev.autoApprove.reason}`}
                </span>
              )}
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '4px 0' }}>
            <button onClick={collectFixtures} style={{ fontSize: 11, cursor: 'pointer' }}>🧾 §19.2 픽스처 수집 (72케이스)</button>
            {fixtureMsg && <span style={{ fontSize: 11, color: '#4c3de6' }}>{fixtureMsg}</span>}
          </div>
          <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>
            Jev는 selector 안정성·상품명 품질·실패 원인·배포 가능성만 판정합니다. 건수·금액 판정은 로컬 검증기가 담당하며, 로컬 검증 실패 규칙은 배포가 차단됩니다. Shadow 비교 데이터 50건+ 일치율 충족 전까지 자동 승인은 비활성입니다.
          </p>
        </section>

        <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ fontSize: 15, margin: 0 }}>🤖 Z.ai Coding Plan 브리지 — OpenCode 감지</h2>
            <button onClick={refresh} disabled={loading} style={{ marginLeft: 'auto', padding: '4px 12px', cursor: 'pointer' }}>
              {loading ? '확인 중…' : '새로고침'}
            </button>
          </div>
          {error && <p style={{ color: '#dc2626', fontSize: 12 }}>오류: {error}</p>}
          {!status && !loading && <p style={{ color: '#94a3b8', fontSize: 12 }}>새로고침을 눌러 설치된 OpenCode를 확인하세요</p>}
          {status && (
            <div style={{ fontSize: 13, marginTop: 8 }}>
              <p style={{ margin: '4px 0' }}>
                감지: <b>{status.detected ? '설치됨' : '미설치'}</b>
                {status.detected && <> · 도구: {status.tool} · 버전: {status.version || '?'}</>}
                {status.detected && <> · Z.AI Coding Plan 인증: <b style={{ color: status.codingPlanAuth ? '#1a7f37' : '#b45309' }}>{status.codingPlanAuth ? '등록됨' : '미등록'}</b></>}
              </p>
              {status.detected && !status.codingPlanAuth && (
                <p style={{ color: '#b45309', fontSize: 12 }}>터미널에서 `opencode auth login`으로 Z.AI Coding Plan을 등록하세요.</p>
              )}
              {status.codingPlanModels && status.codingPlanModels.length > 0 && (
                <>
                  <p style={{ margin: '8px 0 4px', fontWeight: 700 }}>Coding Plan 모델 ({status.codingPlanModels.length}개)</p>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {status.codingPlanModels.map(m => (
                      <li key={m.id} style={{ margin: '2px 0' }}>{m.model} <span style={{ color: '#94a3b8', fontSize: 11 }}>({m.id})</span></li>
                    ))}
                  </ul>
                </>
              )}
              {!status.detected && status.hint && <p style={{ fontSize: 12 }}>{status.hint}</p>}
            </div>
          )}
        </section>

        <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
          <h2 style={{ fontSize: 15, margin: '0 0 8px' }}>📋 구현 진행 현황 (ADMIN_SATAD_ALONE.MD §25)</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <tbody>
              {PHASES.map(([p, name, state]) => (
                <tr key={p} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '4px 8px', width: 70, color: '#64748b' }}>{p}</td>
                  <td style={{ padding: '4px 8px' }}>{name}</td>
                  <td style={{ padding: '4px 8px', color: state.startsWith('완료') ? '#1a7f37' : state.startsWith('진행') ? '#b45309' : '#94a3b8' }}>{state}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      </main>

      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 55 }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 16, width: 820, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ fontSize: 15, margin: 0 }}>✏️ 규칙 편집: {editing}</h2>
              <button style={{ marginLeft: 'auto', cursor: 'pointer' }} onClick={() => setEditing(null)}>닫기</button>
            </div>
            <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={18} style={{ width: '100%', fontFamily: 'Consolas, monospace', fontSize: 12, marginTop: 8 }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button onClick={saveRule} style={{ padding: '6px 14px', background: '#5B4DFB', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}>💾 저장 (소스+analysis 사본)</button>
              <button onClick={() => setShowDiff(v => !v)} style={{ padding: '6px 14px', cursor: 'pointer' }}>
                {showDiff ? 'diff 닫기' : `🔍 변경 전후 비교${diffStat.changed ? ` (+${diffStat.added}/−${diffStat.removed})` : ' (변경 없음)'}`}
              </button>
              <button onClick={registerBuiltin} style={{ padding: '6px 14px', cursor: 'pointer' }}>🧩 builtin 등록</button>
              <button onClick={rebuildJson} style={{ padding: '6px 14px', cursor: 'pointer' }}>📥 rules.json 재생성</button>
              <button onClick={commitGit} style={{ padding: '6px 14px', cursor: 'pointer' }}> Git 커밋</button>
            </div>
            {showDiff && <DiffView before={editOrig} after={editText} />}
            {msg && <p style={{ fontSize: 12, color: '#4c3de6', marginTop: 6 }}>{msg}</p>}
          </div>
        </div>
      )}

      {deleteAsk && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 55 }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 18, width: 480, border: '2px solid #dc2626' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 15, color: '#dc2626' }}>🗑 규칙 삭제 확인 (§16.2 2단계)</h3>
            <p style={{ fontSize: 12, margin: '4px 0' }}><b>{deleteAsk.id}</b> — 아래 파일이 트랜잭션 스냅샷 후 삭제되고 rules.json이 재반영됩니다.</p>
            <ul style={{ fontSize: 11, color: '#64748b', margin: '4px 0 10px', paddingLeft: 18 }}>
              {deleteAsk.targets.map(t => <li key={t}>{t}</li>)}
            </ul>
            <p style={{ fontSize: 12, margin: '4px 0' }}>삭제 확인: 규칙 ID <b>{deleteAsk.id}</b>를 입력하세요.</p>
            <input value={deleteTyped} onChange={e => setDeleteTyped(e.target.value)} placeholder={deleteAsk.id} autoFocus style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 4, padding: '4px 8px', fontSize: 13, boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteAsk(null)} style={{ padding: '6px 14px', cursor: 'pointer' }}>취소</button>
              <button onClick={confirmDelete} disabled={deleteTyped !== deleteAsk.id} style={{ padding: '6px 14px', cursor: deleteTyped === deleteAsk.id ? 'pointer' : 'not-allowed', background: deleteTyped === deleteAsk.id ? '#dc2626' : '#fca5a5', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700 }}>삭제</button>
            </div>
          </div>
        </div>
      )}

      {showLogs && <LogPanel onClose={() => setShowLogs(false)} />}

      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '5px 16px', fontSize: 11, color: '#64748b', display: 'flex', gap: 12, alignItems: 'center', zIndex: 50 }}>
        <span style={{ color: (logCounts.error || 0) > 0 ? '#dc2626' : (logCounts.warn || 0) > 0 ? '#b45309' : '#1a7f37', fontWeight: 700 }}>
          오류 {logCounts.error || 0} · 경고 {logCounts.warn || 0}
        </span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lastLog ? `마지막 작업: ${lastLog.message}` : '대기 중 — 작업을 실행하면 여기에 상태가 표시됩니다'}
        </span>
        <button onClick={() => setShowLogs(v => !v)} style={{ fontSize: 11, cursor: 'pointer' }}>📋 로그</button>
      </div>
    </div>
  )
}

const quickBtn = { padding: '8px 16px', cursor: 'pointer', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', fontSize: 12 }
