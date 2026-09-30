import React, { useEffect, useRef, useState } from 'react'

const LV_COLOR = { error: '#dc2626', warn: '#b45309', info: '#334155', debug: '#94a3b8' }

// §7.9 로그 화면 — 레벨 필터·복사·파일 내보내기(민감정보는 main에서 마스킹된다)
export default function LogPanel({ onClose }) {
  const [level, setLevel] = useState('ALL')
  const [logs, setLogs] = useState([])
  const [msg, setMsg] = useState('')
  const boxRef = useRef(null)

  const load = async () => setLogs(await window.ruleMgr.log.list({ level }))
  useEffect(() => { load() }, [level])
  useEffect(() => {
    const off = window.ruleMgr.log.onLog(() => load())
    return off
  }, [])
  useEffect(() => { if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight }, [logs])

  const copy = async () => {
    const text = logs.map(l => `${l.timestamp} [${l.level}] (${l.step}) ${l.message}`).join('\n')
    await navigator.clipboard.writeText(text)
    setMsg('클립보드에 복사했습니다')
  }
  const save = async () => {
    const r = await window.ruleMgr.log.export(level)
    setMsg(r.ok ? `저장 완료: ${r.path} (${r.lines}행)` : '취소됨')
  }

  return (
    <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: '#0f172a', color: '#e2e8f0', padding: '8px 16px', maxHeight: 320, zIndex: 60, borderTop: '2px solid #5B4DFB' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <b style={{ fontSize: 12 }}>📋 작업 로그 (§7.9)</b>
        {['ALL', 'error', 'warn', 'info'].map(l => (
          <button key={l} onClick={() => setLevel(l)} style={{ fontSize: 10, cursor: 'pointer', border: 'none', borderRadius: 4, padding: '1px 8px', background: level === l ? '#5B4DFB' : '#1e293b', color: level === l ? '#fff' : '#94a3b8' }}>
            {l}{l !== 'ALL' ? '' : ` (${logs.length})`}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button onClick={copy} style={{ fontSize: 10, cursor: 'pointer' }}>복사</button>
          <button onClick={save} style={{ fontSize: 10, cursor: 'pointer' }}>파일 저장</button>
          <button onClick={onClose} style={{ fontSize: 10, cursor: 'pointer' }}>닫기 ✕</button>
        </span>
      </div>
      <div ref={boxRef} style={{ maxHeight: 210, overflow: 'auto', marginTop: 6, fontFamily: 'Consolas, monospace', fontSize: 10.5 }}>
        {logs.length === 0 && <div style={{ color: '#64748b' }}>로그가 없습니다 — 생성·저장·Git 작업을 실행하면 기록됩니다.</div>}
        {logs.map((l, i) => (
          <div key={i} style={{ color: LV_COLOR[l.level] || '#e2e8f0', padding: '1px 0' }}>
            {l.timestamp.slice(11, 19)} [{l.level}] ({l.step}) {l.message}
          </div>
        ))}
      </div>
      {msg && <div style={{ fontSize: 10, color: '#7dd3fc', marginTop: 4 }}>{msg}</div>}
    </div>
  )
}
