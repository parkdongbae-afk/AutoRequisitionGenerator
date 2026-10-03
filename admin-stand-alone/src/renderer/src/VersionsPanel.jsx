import React, { useEffect, useState } from 'react'

export default function VersionsPanel() {
  const [v, setV] = useState(null)
  const [err, setErr] = useState('')
  const load = async () => {
    setErr('')
    try { setV(await window.ruleMgr.versions()) } catch (e) { setErr(String(e.message || e)) }
  }
  useEffect(() => { load() }, [])
  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>ℹ 버전 정보</h2>
        <button onClick={load} style={{ marginLeft: 'auto', padding: '4px 12px', cursor: 'pointer' }}>새로고침</button>
      </div>
      {err && <p style={{ fontSize: 12, color: '#dc2626' }}>오류: {err}</p>}
      {v && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 8 }}>
          <thead>
            <tr style={{ background: '#f1f5f9', color: '#475569' }}>
              <th style={{ textAlign: 'left', padding: 4 }}>구분</th>
              <th style={{ textAlign: 'left', padding: 4 }}>이름</th>
              <th style={{ textAlign: 'left', padding: 4 }}>버전</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderTop: '1px solid #f1f5f9' }}>
              <td style={{ padding: 4 }}>프로그램</td><td>쇼핑몰 규칙 관리자</td>
              <td style={{ fontWeight: 700 }}>{v.app}</td>
            </tr>
            <tr style={{ borderTop: '1px solid #f1f5f9' }}>
              <td style={{ padding: 4 }}>쇼핑몰 규칙</td><td>rules.json</td>
              <td>{v.repoFound ? `v${v.rulesVersion || '?'}` : <span style={{ color: '#b45309' }}>대상 저장소 미선택</span>}</td>
            </tr>
            {v.extensions.map(x => (
              <tr key={x.name} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={{ padding: 4 }}>확장 프로그램</td><td>{x.name}</td>
                <td>{x.version || <span style={{ color: '#94a3b8' }}>미확인</span>}</td>
              </tr>
            ))}
            <tr style={{ borderTop: '1px solid #f1f5f9' }}>
              <td style={{ padding: 4 }}>실행 환경</td><td>Electron / Chromium / Node</td>
              <td>{v.electron} / {v.chrome} / {v.node}</td>
            </tr>
          </tbody>
        </table>
      )}
      <p style={{ fontSize: 11, color: '#94a3b8', margin: '6px 0 0' }}>
        확장 프로그램 버전은 대상 저장소의 app/extension·app/extension-autoselect·admin-stand-alone/extension-장바구니주문서저장 manifest.json 기준입니다.
      </p>
    </section>
  )
}
