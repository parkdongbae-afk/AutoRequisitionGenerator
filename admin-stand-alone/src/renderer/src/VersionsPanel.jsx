import React, { useEffect, useState } from 'react'

function VersionTable({ rows }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 6 }}>
      <thead>
        <tr style={{ background: '#f1f5f9', color: '#475569' }}>
          <th style={{ textAlign: 'left', padding: 4 }}>구분</th>
          <th style={{ textAlign: 'left', padding: 4 }}>이름</th>
          <th style={{ textAlign: 'left', padding: 4 }}>버전</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([group, name, version], i) => (
          <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
            <td style={{ padding: 4, color: '#64748b' }}>{group}</td>
            <td style={{ padding: 4 }}>{name}</td>
            <td style={{ padding: 4, fontWeight: name === '프로그램' ? 700 : 400 }}>
              {version || <span style={{ color: '#94a3b8' }}>미확인</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function VersionsPanel() {
  const [v, setV] = useState(null)
  const [err, setErr] = useState('')
  const load = async () => {
    setErr('')
    try { setV(await window.ruleMgr.versions()) } catch (e) { setErr(String(e.message || e)) }
  }
  useEffect(() => { load() }, [])

  const adminRows = v ? [
    ['프로그램', '프로그램', v.app],
    ['쇼핑몰 규칙', 'rules.json', v.repoFound ? `v${v.rulesVersion || '?'}` : '대상 저장소 미선택'],
    ['확장 프로그램', '장바구니/주문서 저장', (v.extensions.find(x => x.owner === 'admin') || {}).version],
    ['실행 환경', 'Electron / Chromium / Node', `${v.electron} / ${v.chrome} / ${v.node}`]
  ] : []

  const userRows = v ? [
    ['프로그램', '프로그램 (자동품의요구생성기_Portable)', v.userApp && v.userApp.version],
    ['확장 프로그램', '품의캡처', (v.extensions.find(x => x.name === '품의캡처') || {}).version],
    ['확장 프로그램', '품의 자동 선택', (v.extensions.find(x => x.name === '품의 자동 선택') || {}).version]
  ] : []

  return (
    <div>
      <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ fontSize: 15, margin: 0 }}>ℹ 버전 정보 — 쇼핑몰 규칙 관리자</h2>
          <button onClick={load} style={{ marginLeft: 'auto', padding: '4px 12px', cursor: 'pointer' }}>새로고침</button>
        </div>
        {err && <p style={{ fontSize: 12, color: '#dc2626' }}>오류: {err}</p>}
        {v ? <VersionTable rows={adminRows} /> : <p style={{ fontSize: 12, color: '#94a3b8' }}>확인 중…</p>}
      </section>

      <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
        <h2 style={{ fontSize: 15, margin: '0 0 6px' }}>ℹ 버전 정보 — 품의 요구 생성기 (사용자용 앱)</h2>
        {v ? <VersionTable rows={userRows} /> : null}
        <p style={{ fontSize: 11, color: '#94a3b8', margin: '6px 0 0' }}>
          버전은 대상 저장소의 manifest.json(확장)·app/package.json(사용자용 앱) 기준입니다.
        </p>
      </section>
    </div>
  )
}
