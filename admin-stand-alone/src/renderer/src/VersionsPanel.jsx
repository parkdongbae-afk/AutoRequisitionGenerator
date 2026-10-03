import React, { useEffect, useState } from 'react'

function VersionTable({ rows }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 6 }}>
      <thead>
        <tr style={{ background: '#f1f5f9', color: '#475569' }}>
          <th style={{ textAlign: 'left', padding: 4 }}>구분</th>
          <th style={{ textAlign: 'left', padding: 4 }}>이름</th>
          <th style={{ textAlign: 'left', padding: 4 }}>버전</th>
          <th style={{ textAlign: 'left', padding: 4 }}>마지막 업데이트</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([group, name, version, date], i) => (
          <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
            <td style={{ padding: 4, color: '#64748b' }}>{group}</td>
            <td style={{ padding: 4 }}>{name}</td>
            <td style={{ padding: 4, fontWeight: name === '프로그램' ? 700 : 400 }}>
              {version || <span style={{ color: '#94a3b8' }}>미확인</span>}
            </td>
            <td style={{ padding: 4, color: '#64748b' }}>{date || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const REMOTE_FILES = [
  ['품의캡처 확장', 'app/extension/manifest.json'],
  ['품의 자동 선택 확장', 'app/extension-autoselect/manifest.json'],
  ['장바구니/주문서 저장 확장', 'admin-stand-alone/extension-장바구니주문서저장/manifest.json'],
  ['품의 요구 생성기 프로그램', 'app/src/main/index.js'],
  ['쇼핑몰 규칙 관리자 프로그램', 'admin-stand-alone/package.json'],
  ['쇼핑몰 규칙(rules.json)', 'rules.json']
]

export default function VersionsPanel() {
  const [v, setV] = useState(null)
  const [err, setErr] = useState('')
  const [remote, setRemote] = useState(null)
  const [remoteBusy, setRemoteBusy] = useState(false)
  const load = async () => {
    setErr('')
    try { setV(await window.ruleMgr.versions()) } catch (e) { setErr(String(e.message || e)) }
  }
  useEffect(() => { load() }, [])
  const loadRemote = async () => {
    setRemoteBusy(true)
    try { setRemote(await window.ruleMgr.versionsRemote()) } catch (e) { setRemote({ error: String(e.message || e) }) }
    setRemoteBusy(false)
  }

  const adminRows = v ? [
    ['프로그램', '프로그램', v.app, v.adminAppUpdatedAt],
    ['쇼핑몰 규칙', 'rules.json', v.repoFound ? `v${v.rulesVersion || '?'}` : '대상 저장소 미선택', v.rulesUpdatedAt],
    ['확장 프로그램', '장바구니/주문서 저장', (v.extensions.find(x => x.owner === 'admin') || {}).version, (v.extensions.find(x => x.owner === 'admin') || {}).updatedAt],
    ['실행 환경', 'Electron / Chromium / Node', `${v.electron} / ${v.chrome} / ${v.node}`, '—']
  ] : []

  const userRows = v ? [
    ['프로그램', '프로그램 (메인창 좌측 하단 표시)', v.userApp && v.userApp.version, v.userApp && v.userApp.updatedAt],
    ['확장 프로그램', '품의캡처', (v.extensions.find(x => x.name === '품의캡처') || {}).version, (v.extensions.find(x => x.name === '품의캡처') || {}).updatedAt],
    ['확장 프로그램', '품의 자동 선택', (v.extensions.find(x => x.name === '품의 자동 선택') || {}).version, (v.extensions.find(x => x.name === '품의 자동 선택') || {}).updatedAt]
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
          버전은 대상 저장소의 manifest.json(확장)·app/src/main/index.js APP_VERSION(사용자용 앱) 기준이며, 날짜는 Git 마지막 커밋일입니다.
        </p>
      </section>

      <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ fontSize: 15, margin: 0 }}>🌐 GitHub 원격 버전</h2>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>github.com/parkdongbae-afk/AutoRequisitionGenerator</span>
          <button onClick={loadRemote} disabled={remoteBusy} style={{ marginLeft: 'auto', padding: '4px 12px', cursor: remoteBusy ? 'wait' : 'pointer' }}>
            {remoteBusy ? '확인 중… (fetch)' : '원격 버전 확인'}
          </button>
        </div>
        {!remote && <p style={{ fontSize: 12, color: '#94a3b8', margin: '6px 0 0' }}>버튼을 누르면 origin/main에서 최신 파일 버전을 가져옵니다.</p>}
        {remote && remote.error && <p style={{ fontSize: 12, color: '#dc2626', margin: '6px 0 0' }}>오류: {remote.error}</p>}
        {remote && !remote.error && (
          <>
            <p style={{ fontSize: 11, color: remote.fetched ? '#1a7f37' : '#b45309', margin: '6px 0 0' }}>
              {remote.fetched ? 'origin/main에서 최신 상태를 가져왔습니다.' : 'fetch 실패 — 마지막 fetch 시점의 origin/main 기준입니다.'}
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 6 }}>
              <thead>
                <tr style={{ background: '#f1f5f9', color: '#475569' }}>
                  <th style={{ textAlign: 'left', padding: 4 }}>파일</th>
                  <th style={{ textAlign: 'left', padding: 4 }}>원격 버전</th>
                </tr>
              </thead>
              <tbody>
                {REMOTE_FILES.map(([label, file]) => (
                  <tr key={file} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: 4 }}>{label}</td>
                    <td style={{ padding: 4, fontWeight: 600 }}>
                      {remote.versions && remote.versions[file]
                        ? remote.versions[file]
                        : <span style={{ color: '#94a3b8' }}>미확인</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>
    </div>
  )
}
