import React, { useEffect, useState } from 'react'

// §7.8 배포/Git — 변경 파일 목록·선택 stage·diff·commit/push 분리.
// git add ./-A·force push는 서비스 단계에서 금지되며, push 실패는 커밋 보존과 함께 별도 보고된다(§17.5).
export default function GitPanel({ onDone }) {
  const [branch, setBranch] = useState('')
  const [ahead, setAhead] = useState(null)
  const [files, setFiles] = useState([])
  const [checked, setChecked] = useState({})
  const [diffText, setDiffText] = useState('')
  const [message, setMessage] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    try {
      const st = await window.ruleMgr.git.status()
      setBranch(st.branch)
      setFiles(st.files)
      setChecked(Object.fromEntries(st.files.map(f => [f.path, f.staged])))
    } catch (e) {
      setMsg('git status 실패: ' + String(e.message || e))
    }
    const ab = await window.ruleMgr.git.ahead()
    setAhead(ab && ab.ahead)
  }

  useEffect(() => { refresh() }, [])

  const selected = () => files.filter(f => checked[f.path]).map(f => f.path)

  const showDiff = async () => {
    setDiffText(await window.ruleMgr.git.diff(selected()))
  }
  const stage = async () => {
    setBusy(true)
    try {
      await window.ruleMgr.git.stage(selected())
      setMsg(`staged: ${selected().length}파일`)
      await refresh()
    } catch (e) { setMsg('stage 실패: ' + String(e.message || e)) }
    setBusy(false)
  }
  const commit = async () => {
    setBusy(true)
    try {
      const r = await window.ruleMgr.git.commit(message)
      setMsg(`커밋 완료: ${r.hash}`)
      setMessage('')
      await refresh()
      onDone && onDone()
    } catch (e) { setMsg('커밋 실패: ' + String(e.message || e)) }
    setBusy(false)
  }
  const push = async () => {
    setBusy(true)
    try {
      const r = await window.ruleMgr.git.push()
      setMsg(r.ok ? `push 완료 (${r.branch})` : `push 실패 — 로컬 커밋은 보존됨: ${r.error}`)
    } catch (e) { setMsg('push 실패 — 로컬 커밋은 보존됨: ' + String(e.message || e)) }
    setBusy(false)
  }

  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>🚀 배포/Git (§7.8)</h2>
        <span style={{ fontSize: 12, color: '#64748b' }}>branch <b>{branch || '…'}</b>{ahead != null && ` · 미푸시 커밋 ${ahead}건`}</span>
        <button onClick={refresh} style={{ marginLeft: 'auto', padding: '4px 12px', cursor: 'pointer' }}>새로고침</button>
      </div>
      <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0' }}>
        작업 파일만 선택해 stage합니다(§17.2). force push·`git add .`는 금지이며, push 실패 시에도 로컬 커밋은 보존됩니다(§17.5).
      </p>
      {files.length === 0
        ? <p style={{ fontSize: 12, color: '#94a3b8' }}>변경 파일이 없습니다.</p>
        : (
          <div style={{ maxHeight: 180, overflow: 'auto', border: '1px solid #f1f5f9', borderRadius: 6, fontSize: 11 }}>
            {files.map(f => (
              <label key={f.path + (f.renamedFrom || '')} style={{ display: 'block', padding: '2px 6px', borderBottom: '1px solid #f8fafc' }}>
                <input
                  type="checkbox"
                  checked={!!checked[f.path]}
                  onChange={e => setChecked({ ...checked, [f.path]: e.target.checked })}
                />{' '}
                <span style={{ color: f.untracked ? '#94a3b8' : f.staged ? '#1a7f37' : '#b45309' }}>
                  {f.untracked ? '신규' : f.staged ? 'staged' : '변경'}
                </span>{' '}
                <code>{f.path}</code>
              </label>
            ))}
          </div>
          )}
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <button onClick={showDiff} disabled={!selected().length} style={{ ...btn, opacity: selected().length ? 1 : 0.5 }}>🔍 선택 diff 보기</button>
        <button onClick={stage} disabled={busy || !selected().length} style={{ ...btn, opacity: selected().length ? 1 : 0.5 }}>⬆ 선택 stage</button>
        <input
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="커밋 메시지 (예: feat: 무신사 쇼핑몰 규칙 추가)"
          style={{ flex: 1, minWidth: 220, border: '1px solid #e2e8f0', borderRadius: 4, padding: '4px 8px', fontSize: 12 }}
        />
        <button onClick={commit} disabled={busy || !message} style={{ ...btnPrimary, opacity: message ? 1 : 0.5 }}>Commit</button>
        <button onClick={push} disabled={busy} style={btn}>Push</button>
      </div>
      {msg && <p style={{ fontSize: 12, color: '#4c3de6', marginTop: 6 }}>{msg}</p>}
      {diffText && (
        <pre style={{ fontSize: 10, background: '#0f172a', color: '#e2e8f0', padding: 8, borderRadius: 6, maxHeight: 200, overflow: 'auto', marginTop: 8 }}>{diffText}</pre>
      )}
    </section>
  )
}

const btn = { padding: '5px 12px', cursor: 'pointer', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff' }
const btnPrimary = { padding: '5px 14px', cursor: 'pointer', border: 'none', borderRadius: 6, background: '#5B4DFB', color: '#fff', fontWeight: 700 }
