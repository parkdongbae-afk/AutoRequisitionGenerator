import React, { useState } from 'react'
import DiffView from './DiffView.jsx'

const SEV_COLOR = { ERROR: '#dc2626', WARNING: '#b45309', INFO: '#2563eb', PASS: '#1a7f37' }

// §7.7 검증 센터 + §7.4 규칙 비교
export default function VerificationPanel({ rules, onDone }) {
  const [tab, setTab] = useState('verify')
  const [results, setResults] = useState(null)
  const [summary, setSummary] = useState(null)
  const [running, setRunning] = useState(false)
  const [sevFilter, setSevFilter] = useState('ALL')
  const [cmpA, setCmpA] = useState('')
  const [cmpB, setCmpB] = useState('')
  const [cmpData, setCmpData] = useState(null)
  const [sampleDir, setSampleDir] = useState('')
  const [sampleRes, setSampleRes] = useState(null)

  const runSamples = async () => {
    if (!sampleDir) return
    setRunning(true)
    setSampleRes(null)
    try {
      setSampleRes(await window.ruleMgr.verifySamples(sampleDir))
    } catch (e) {
      setSampleRes({ results: [{ file: '-', verdict: 'ERROR', problems: [String(e.message || e)] }], summary: { ERROR: 1, WARNING: 0, INFO: 0, PASS: 0, ok: false }, scanned: 0 })
    }
    setRunning(false)
  }

  const runVerify = async () => {
    setRunning(true)
    try {
      const r = await window.ruleMgr.verifyAll()
      setResults(r.results)
      setSummary(r.summary)
      onDone && onDone()
    } catch (e) {
      setResults([{ severity: 'ERROR', code: 'VERIFY_FAILED', message: String(e.message || e), ruleId: null }])
    }
    setRunning(false)
  }

  const runCompare = async () => {
    if (!cmpA || !cmpB) return
    const [a, b] = await Promise.all([window.ruleMgr.rulesRead(cmpA), window.ruleMgr.rulesRead(cmpB)])
    if (!a || !b) { setCmpData(null); return }
    setCmpData({ before: pretty(a, cmpA), after: pretty(b, cmpB), same: a === b })
  }

  const shown = (results || []).filter(r => sevFilter === 'ALL' || r.severity === sevFilter)

  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>🧪 검증 센터 · 규칙 비교</h2>
        <span style={{ marginLeft: 'auto' }} />
        <button onClick={() => setTab('verify')} style={tabBtn(tab === 'verify')}>§7.7 전체 검증</button>
        <button onClick={() => setTab('samples')} style={tabBtn(tab === 'samples')}>§7.7 샘플 추출</button>
        <button onClick={() => setTab('compare')} style={tabBtn(tab === 'compare')}>§7.4 규칙 비교</button>
      </div>

      {tab === 'verify' && (
        <div style={{ marginTop: 8 }}>
          <button onClick={runVerify} disabled={running} style={{ ...btnPrimary, opacity: running ? 0.5 : 1 }}>
            {running ? '검증 중…' : '▶ 전체 검증 실행'}
          </button>
          {summary && (
            <p style={{ fontSize: 12, margin: '8px 0 4px' }}>
              {['ERROR', 'WARNING', 'INFO', 'PASS'].map(s => (
                <span key={s} style={{ color: SEV_COLOR[s], marginRight: 12 }}>{s} {summary[s] || 0}</span>
              ))}
              <span style={{ color: summary.ok ? '#1a7f37' : '#dc2626', fontWeight: 700 }}>
                {summary.ok ? '적용 가능 (ERROR 0)' : 'ERROR 있음 — 적용·배포 차단 대상'}
              </span>
            </p>
          )}
          {results && (
            <>
              <div style={{ fontSize: 11, margin: '4px 0' }}>
                {['ALL', 'ERROR', 'WARNING', 'INFO', 'PASS'].map(s => (
                  <button key={s} onClick={() => setSevFilter(s)} style={{ ...btnSm, background: sevFilter === s ? '#5B4DFB' : '#fff', color: sevFilter === s ? '#fff' : '#334155' }}>{s}</button>
                ))}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginTop: 4 }}>
                <tbody>
                  {shown.map((r, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: 3, width: 70, color: SEV_COLOR[r.severity], fontWeight: 700 }}>{r.severity}</td>
                      <td style={{ padding: 3, width: 170, color: '#64748b' }}>{r.ruleId || '(프로젝트)'}</td>
                      <td style={{ padding: 3, width: 170, color: '#94a3b8' }}>{r.code}</td>
                      <td style={{ padding: 3 }}>{r.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {tab === 'samples' && (
        <div style={{ marginTop: 8, fontSize: 12 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button onClick={async () => { const d = await window.ruleMgr.pickDir(); if (d) setSampleDir(d) }} style={btnSm}>캡처 폴더 선택…</button>
            <span style={{ color: '#64748b', fontSize: 11 }}>{sampleDir || '폴더를 선택하세요 (하위 폴더 포함, 최대 60개)'}</span>
            <button onClick={runSamples} disabled={running || !sampleDir} style={{ ...btnPrimary, opacity: running || !sampleDir ? 0.5 : 1 }}>
              {running ? '검증 중…' : '▶ 샘플 추출 검증'}
            </button>
          </div>
          {sampleRes && (
            <>
              <p style={{ margin: '8px 0 4px' }}>
                스캔 {sampleRes.scanned}건 · {['ERROR', 'WARNING', 'INFO', 'PASS'].map(s => (
                  <span key={s} style={{ color: SEV_COLOR[s], marginRight: 10 }}>{s} {sampleRes.summary[s] || 0}</span>
                ))}
                <span style={{ color: sampleRes.summary.ok ? '#1a7f37' : '#dc2626', fontWeight: 700 }}>
                  {sampleRes.summary.ok ? '정답 대조 통과' : 'ERROR 있음'}
                </span>
              </p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginTop: 4 }}>
                <tbody>
                  {sampleRes.results.map((r, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: 3, width: 60, color: SEV_COLOR[r.verdict], fontWeight: 700 }}>{r.verdict}</td>
                      <td style={{ padding: 3, width: 200 }}>{r.file}</td>
                      <td style={{ padding: 3, width: 140, color: '#64748b' }}>{r.ruleId || '—'}{r.itemCount != null ? ` · ${r.itemCount}건${r.expectedCount != null ? `/${r.expectedCount}` : ''}` : ''}</td>
                      <td style={{ padding: 3 }}>{(r.problems || []).join(' · ') || '정답 대조 통과'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {tab === 'compare' && (
        <div style={{ marginTop: 8, fontSize: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={cmpA} onChange={e => setCmpA(e.target.value)} style={selCss}>
              <option value="">규칙 A 선택</option>
              {rules.map(r => <option key={r.id} value={r.id}>{r.id}</option>)}
            </select>
            <span>vs</span>
            <select value={cmpB} onChange={e => setCmpB(e.target.value)} style={selCss}>
              <option value="">규칙 B 선택</option>
              {rules.map(r => <option key={r.id} value={r.id}>{r.id}</option>)}
            </select>
            <button onClick={runCompare} disabled={!cmpA || !cmpB} style={{ ...btnPrimary, opacity: cmpA && cmpB ? 1 : 0.5 }}>비교</button>
          </div>
          {cmpData && (
            cmpData.same
              ? <p style={{ color: '#1a7f37', marginTop: 8 }}>두 규칙이 동일합니다.</p>
              : <DiffView before={cmpData.before} after={cmpData.after} maxHeight={380} />
          )}
        </div>
      )}
    </section>
  )
}

function pretty(raw, id) {
  try { return JSON.stringify(JSON.parse(raw), null, 2) + '\n' } catch { return raw || `(읽기 실패: ${id})` }
}

const tabBtn = active => ({ padding: '3px 10px', fontSize: 12, cursor: 'pointer', border: '1px solid #e2e8f0', borderRadius: 6, background: active ? '#5B4DFB' : '#fff', color: active ? '#fff' : '#334155' })
const btnPrimary = { padding: '6px 14px', cursor: 'pointer', border: 'none', borderRadius: 6, background: '#5B4DFB', color: '#fff', fontWeight: 700 }
const btnSm = { padding: '1px 8px', fontSize: 10, cursor: 'pointer', border: '1px solid #e2e8f0', borderRadius: 4, marginRight: 4 }
const selCss = { border: '1px solid #e2e8f0', borderRadius: 4, padding: '3px 6px', fontSize: 12, minWidth: 160 }
