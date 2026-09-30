import React, { useEffect, useState } from 'react'

const PHASES = [
  ['Phase 0', '기준선 고정', '완료'],
  ['Phase 1', '관리자 앱 골격', '진행 중 — 브리지 감지·모델 목록'],
  ['Phase 2', '프로젝트 탐지와 대시보드', '예정'],
  ['Phase 3', '규칙 조회·편집·검증', '예정'],
  ['Phase 4', '트랜잭션·백업', '예정'],
  ['Phase 5', '클릭 매핑', '예정'],
  ['Phase 6', 'Z.ai Coding Plan 연동', '브리지 감지 완료, 생성 예정'],
  ['Phase 7', '자가 검증·수정', '예정'],
  ['Phase 8', 'builtin·삭제·Git', '예정'],
  ['Phase 9', '전체 회귀·패키징', '예정']
]

export default function App() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [jev, setJev] = useState(null)
  const [jevTesting, setJevTesting] = useState(false)

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

  const [project, setProject] = useState(null)
  const [rules, setRules] = useState([])
  const [editing, setEditing] = useState(null)
  const [editText, setEditText] = useState('')
  const [msg, setMsg] = useState('')

  const loadProject = async (choose) => {
    const p = choose ? await window.ruleMgr.projectChoose() : await window.ruleMgr.projectDetect()
    if (p) { setProject(p); setRules(await window.ruleMgr.rulesList()) }
    else { setProject(null); setRules([]) }
  }

  const editRule = async (id) => {
    const raw = await window.ruleMgr.rulesRead(id)
    setEditing(id)
    setEditText(raw)
  }
  const saveRule = async () => {
    try {
      const rule = JSON.parse(editText)
      await window.ruleMgr.rulesSave(project.repoRoot, rule)
      setMsg(`규칙 "${rule.id}" 저장 완료`)
      await loadProject(false)
    } catch (e) { setMsg('저장 실패: ' + String(e.message || e)) }
  }
  const deleteRule = async (id) => {
    if (!confirm(`규칙 "${id}"을(를) 삭제할까요? 소스·분석·사용자 사본이 함께 지워집니다.`)) return
    const r = await window.ruleMgr.rulesDelete(id)
    setMsg(r && r.error ? ('삭제 실패: ' + r.error) : `삭제 완료: ${id}`)
    await loadProject(false)
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

  useEffect(() => { refresh(); loadProject(false) }, [])

  return (
    <div style={{ fontFamily: 'Malgun Gothic, sans-serif', padding: 20, color: '#0f172a' }}>
      <h1 style={{ fontSize: 20, margin: '0 0 4px' }}>쇼핑몰 규칙 관리자 <span style={{ fontSize: 12, color: '#94a3b8' }}>단독 실행형 v0.1.0</span></h1>
      <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13 }}>
        ADMIN_SATAD_ALONE.MD 기준 — 사용자용 앱과 독립 실행(별도 userData·잠금·포트)
      </p>

      <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ fontSize: 15, margin: 0 }}>📁 대상 저장소</h2>
          <button onClick={() => loadProject(false)} style={{ marginLeft: 'auto', padding: '4px 12px', cursor: 'pointer' }}>다시 탐지</button>
          <button onClick={() => loadProject(true)} style={{ padding: '4px 12px', cursor: 'pointer' }}>폴더 선택…</button>
        </div>
        {project ? (
          <div style={{ fontSize: 13, marginTop: 6 }}>
            <p style={{ margin: '2px 0' }}>경로: {project.repoRoot}</p>
            <p style={{ margin: '2px 0' }}>규칙 {project.rulesCount}개 · rules.json v{project.rulesJsonVersion || '?'} · Git {project.git ? '연결' : '없음'}</p>
            {rules.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 6 }}>
                <thead><tr style={{ color: '#64748b' }}><th style={{ textAlign: 'left', padding: 3 }}>id</th><th style={{ textAlign: 'left' }}>이름</th><th style={{ textAlign: 'left' }}>checkedOnly</th><th style={{ textAlign: 'left' }}>optionRows</th><th style={{ textAlign: 'left' }}>조작</th></tr></thead>
                <tbody>
                  {rules.map(r => (
                    <tr key={r.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: 3 }}>{r.id}</td><td>{r.name}</td>
                      <td style={{ color: r.checkedOnly ? '#1a7f37' : '#94a3b8' }}>{r.checkedOnly ? '✓' : '—'}</td>
                      <td style={{ color: r.optionRows ? '#1a7f37' : '#94a3b8' }}>{r.optionRows ? '✓' : '—'}</td>
                      <td style={{ padding: 3 }}>
                        <button onClick={() => editRule(r.id)} style={{ marginRight: 4, cursor: 'pointer' }}>편집</button>
                        <button onClick={() => deleteRule(r.id)} style={{ cursor: 'pointer', color: '#dc2626' }}>삭제</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <p style={{ fontSize: 12, color: '#b45309' }}>저장소를 찾지 못했습니다 — rules.json과 .git이 있는 폴더를 선택하세요.</p>
        )}
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
            {status.detected && status.otherModels && status.otherModels.length > 0 && (
              <p style={{ margin: '8px 0 0', color: '#94a3b8', fontSize: 12 }}>기타 제공사 모델 {status.otherModels.length}개</p>
            )}
            {!status.detected && status.hint && <p style={{ fontSize: 12 }}>{status.hint}</p>}
          </div>
        )}
      </section>

      {editing && (
      <section style={{ border: '2px solid #DDD9FC', borderRadius: 10, padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ fontSize: 15, margin: 0 }}>✏️ 규칙 편집: {editing}</h2>
          <button style={{ marginLeft: 'auto', cursor: 'pointer' }} onClick={() => setEditing(null)}>닫기</button>
        </div>
        <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={16} style={{ width: '100%', fontFamily: 'Consolas, monospace', fontSize: 12 }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={saveRule} style={{ padding: '6px 14px', background: '#5B4DFB', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}>💾 저장 (소스+analysis 사본)</button>
          <button onClick={registerBuiltin} style={{ padding: '6px 14px', cursor: 'pointer' }}>🧩 builtin 등록</button>
          <button onClick={rebuildJson} style={{ padding: '6px 14px', cursor: 'pointer' }}>📥 rules.json 재생성</button>
          <button onClick={commitGit} style={{ padding: '6px 14px', cursor: 'pointer' }}> Git 커밋</button>
        </div>
        {msg && <p style={{ fontSize: 12, color: '#4c3de6', marginTop: 6 }}>{msg}</p>}
      </section>
      <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ fontSize: 15, margin: 0 }}>⚖️ TypeSafe Jev — 판정 게이트</h2>
          <button onClick={testJev} disabled={jevTesting || !(jev && jev.configured)} style={{ marginLeft: 'auto', padding: '4px 12px', cursor: 'pointer' }}>
            {jevTesting ? '테스트 중…' : '연결 테스트'}
          </button>
        </div>
        <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0' }}>
          구성: <b>{jev ? (jev.configured ? 'TYPESAFE_API_KEY 설정됨' : '미설정 — 환경변수 확인') : '확인 중…'}</b>
          {' · '}Shadow Mode: <b>{jev ? (jev.shadowMode ? '사용' : '끔') : '-'}</b> (초기 구현은 Shadow Mode 고정)
        </p>
        {jev && jev.test && (
          <p style={{ fontSize: 12, color: jev.test.ok ? '#1a7f37' : '#dc2626', margin: '4px 0' }}>
            연결 테스트: {jev.test.ok ? '성공' : `실패${jev.test.code ? ` (${jev.test.code})` : ''} — ${jev.test.message}`}
          </p>
        )}
        <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>
          Jev는 selector 안정성·상품명 품질·실패 원인·배포 가능성만 판정합니다. 건수·금액 판정은 로컬 검증기가 담당하며, 로컬 검증 실패 규칙은 Jev 결과와 무관하게 배포가 차단됩니다.
        </p>
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
  )
}
