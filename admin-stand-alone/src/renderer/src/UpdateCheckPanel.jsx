import React, { useEffect, useState } from 'react'

/*
 * 업데이트 확인 탭 (Zai Coding Plan 작업 지시서)
 * 하루 1회 각 쇼핑몰 규칙/공지 페이지 변경 감지(해시 비교) → 변경분만 Gemini 요약 →
 * 탭 상태·데스크톱 알림·이메일(SMTP 설정시)로 전달. 지금 점검으로 수동 실행도 가능.
 */
const STATUS_LABEL = {
  baseline: ['·', '첫 점검(기준 해시 저장)', '#64748b'],
  unchanged: ['✅', '변경 없음', '#1a7f37'],
  changed: ['⚠️', '규칙 변경 감지', '#b45309'],
  error: ['❓', '확인 실패', '#dc2626']
}

export default function UpdateCheckPanel() {
  const [st, setSt] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [cfg, setCfg] = useState({ enabled: true, hour: 3 })
  const [email, setEmail] = useState({ host: 'smtp.gmail.com', port: 465, user: '', to: '', pass: '' })
  const [emailMsg, setEmailMsg] = useState('')

  const load = async () => {
    try {
      const r = await window.ruleMgr.updateCheck.getStatus()
      setSt(r)
      const s = await window.ruleMgr.settings.get()
      const uc = s.updateCheck || {}
      setCfg({ enabled: uc.enabled !== false, hour: Number(uc.hour ?? 3) })
      const em = uc.email || {}
      setEmail(e => ({ ...e, host: em.host || 'smtp.gmail.com', port: Number(em.port) || 465, user: em.user || '', to: em.to || '' }))
    } catch (e) { setMsg(String(e.message || e)) }
  }
  useEffect(() => { load() }, [])

  const saveShops = async (shops) => {
    await window.ruleMgr.updateCheck.setShops(shops)
    await load()
  }

  const addShop = async () => {
    if (!/^https?:\/\//.test(url.trim())) { setMsg('URL은 http(s)://로 시작해야 합니다'); return }
    const shops = [...(st ? st.shops.map(s => ({ id: s.id, name: s.name, url: s.url })) : []), { name: name.trim() || url.trim(), url: url.trim() }]
    await saveShops(shops)
    setName(''); setUrl(''); setMsg('쇼핑몰을 추가했습니다')
  }

  const removeShop = async (id) => {
    if (!confirm('이 쇼핑몰을 점검 목록에서 삭제할까요?')) return
    await saveShops((st.shops || []).filter(s => s.id !== id).map(s => ({ id: s.id, name: s.name, url: s.url })))
  }

  const runNow = async () => {
    setBusy(true); setMsg('전체 점검 중…')
    try {
      const r = await window.ruleMgr.updateCheck.runNow()
      setMsg(`점검 완료 — ${r.total}몰 중 변경 ${r.changedCount}건 · Gemini ${r.geminiCalls}회 · 이메일: ${r.email}`)
    } catch (e) { setMsg('점검 실패: ' + String(e.message || e)) }
    await load()
    setBusy(false)
  }

  const saveCfg = async (patch) => {
    const next = { ...cfg, ...patch }
    setCfg(next)
    await window.ruleMgr.settings.set({ updateCheck: { enabled: next.enabled, hour: Number(next.hour) || 3 } })
  }

  const saveEmail = async () => {
    await window.ruleMgr.settings.set({ updateCheck: { email: { host: email.host, port: Number(email.port) || 465, user: email.user, to: email.to } } })
    if (email.pass) {
      const r = await window.ruleMgr.updateCheck.setEmailPass(email.pass)
      if (!r || !r.ok) { setEmailMsg(r && r.message ? r.message : '비밀번호 저장 실패'); return }
    }
    setEmailMsg('이메일 설정을 저장했습니다 — 변경 감지시 이 주소로 발송됩니다')
    setEmail(e => ({ ...e, pass: '' }))
  }

  const label = st ? (st.todayChanged > 0 ? `🔔 업데이트 확인 ⚠️ ${st.todayChanged}` : '🔔 업데이트 확인') : '🔔 업데이트 확인'

  return (
    <div>
      <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 15, margin: 0 }}>{label}</h2>
          <button onClick={runNow} disabled={busy} style={{ marginLeft: 'auto', padding: '6px 16px', cursor: busy ? 'wait' : 'pointer', border: 'none', borderRadius: 6, background: '#5B4DFB', color: '#fff', fontWeight: 700, fontSize: 12, opacity: busy ? 0.6 : 1 }}>
            {busy ? '점검 중…' : '🔄 지금 점검'}
          </button>
        </div>
        <p style={{ fontSize: 12, color: '#64748b', margin: '6px 0' }}>
          {st ? (
            <>
              마지막 점검: <b>{st.lastFullCheckAt ? String(st.lastFullCheckAt).replace('T', ' ').slice(0, 16) : '아직 없음'}</b>
              {' · '}전체 점검 {st.lastFullCheckDate ? '완료' : '미실행'}
              {' · '}<b style={{ color: st.todayChanged > 0 ? '#b45309' : '#1a7f37' }}>오늘 변경 쇼핑몰: {st.todayChanged}개</b>
              {' · '}점검 예약: 매일 {cfg.hour}시{cfg.enabled ? '' : ' (자동 점검 꺼짐)'}
            </>
          ) : '불러오는 중…'}
        </p>
        {msg && <p style={{ fontSize: 12, color: '#4c3de6', margin: '2px 0', whiteSpace: 'pre-wrap' }}>{msg}</p>}
      </section>

      <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 14 }}>
        <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>📋 쇼핑몰별 상태</h3>
        {st && st.shops.length === 0 && (
          <p style={{ fontSize: 12, color: '#94a3b8', margin: '4px 0' }}>
            점검할 쇼핑몰이 없습니다 — 아래에서 규칙/공지 페이지 URL을 추가하세요.
          </p>
        )}
        {st && st.shops.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f1f5f9', color: '#475569' }}>
                <th style={{ textAlign: 'left', padding: 4 }}>쇼핑몰</th>
                <th style={{ textAlign: 'left', padding: 4 }}>상태</th>
                <th style={{ textAlign: 'left', padding: 4 }}>마지막 확인</th>
                <th style={{ textAlign: 'left', padding: 4 }}>마지막 변경</th>
                <th style={{ textAlign: 'left', padding: 4 }}>Gemini 요약</th>
                <th style={{ padding: 4 }}></th>
              </tr>
            </thead>
            <tbody>
              {st.shops.map(s => {
                const [icon, text, color] = STATUS_LABEL[s.status] || ['—', '미점검', '#94a3b8']
                return (
                  <tr key={s.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: 4 }}>
                      <b>{s.name}</b>
                      <div style={{ fontSize: 10, color: '#94a3b8', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <a href={s.url} target="_blank" rel="noreferrer" style={{ color: '#5B4DFB' }}>{s.url}</a>
                      </div>
                    </td>
                    <td style={{ padding: 4, color }}>
                      {icon} {text}
                      {s.lastError && <div style={{ fontSize: 10, color: '#dc2626' }}>{s.lastError}</div>}
                    </td>
                    <td style={{ padding: 4, color: '#64748b' }}>{s.lastCheckedAt ? String(s.lastCheckedAt).replace('T', ' ').slice(0, 16) : '—'}</td>
                    <td style={{ padding: 4, color: '#64748b' }}>{s.lastChangedAt ? String(s.lastChangedAt).replace('T', ' ').slice(0, 16) : '—'}</td>
                    <td style={{ padding: 4, fontSize: 11, maxWidth: 320 }}>
                      {s.status === 'changed' && !s.lastSummary && <span style={{ color: '#94a3b8' }}>(요약 없음 — Gemini Key 미설정 또는 실패)</span>}
                      {s.lastSummary && (
                        <details>
                          <summary style={{ cursor: 'pointer', color: '#b45309' }}>{String(s.lastSummary.summary || '').slice(0, 60)}{s.lastSummary.summary && s.lastSummary.summary.length > 60 ? '…' : ''}</summary>
                          <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{s.lastSummary.summary}</div>
                          {s.lastSummary.impact && <div style={{ marginTop: 4, color: '#dc2626' }}><b>영향:</b> {s.lastSummary.impact}</div>}
                        </details>
                      )}
                      {s.status !== 'changed' && !s.lastSummary && '—'}
                    </td>
                    <td style={{ padding: 4 }}>
                      <button onClick={() => removeShop(s.id)} style={{ cursor: 'pointer', color: '#dc2626', border: 'none', background: 'none' }}>✕</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="쇼핑몰 이름 (예: 무신사 공지)" style={{ border: '1px solid #e2e8f0', borderRadius: 4, padding: '4px 8px', fontSize: 12, width: 200 }} />
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://… 규칙/공지 페이지 URL" style={{ flex: 1, minWidth: 260, border: '1px solid #e2e8f0', borderRadius: 4, padding: '4px 8px', fontSize: 12 }} />
          <button onClick={addShop} style={{ padding: '4px 14px', cursor: 'pointer', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff', fontSize: 12 }}>＋ 추가</button>
        </div>
      </section>

      <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 14 }}>
        <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>⚙ 점검 설정</h3>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12, flexWrap: 'wrap' }}>
          <label>
            <input type="checkbox" checked={cfg.enabled} onChange={e => saveCfg({ enabled: e.target.checked })} /> 하루 1회 자동 점검
          </label>
          <label>
            점검 시각{' '}
            <select value={cfg.hour} onChange={e => saveCfg({ hour: Number(e.target.value) })} style={{ border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 12 }}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}시</option>)}
            </select>
          </label>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>앱이 실행 중일 때만 점검하며, 미실행 날이 있으면 다음 실행시 보완합니다. 변경 없는 쇼핑몰은 Gemini를 호출하지 않습니다.</span>
        </div>
      </section>

      <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
        <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>📧 이메일 알림 (SMTP — 설정시 변경 감지에만 발송)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 90px 1fr', gap: 6, fontSize: 12, alignItems: 'center' }}>
          <label>SMTP 호스트</label>
          <input value={email.host} onChange={e => setEmail({ ...email, host: e.target.value })} style={inp} placeholder="smtp.gmail.com" />
          <label>포트</label>
          <input value={email.port} onChange={e => setEmail({ ...email, port: e.target.value })} style={inp} placeholder="465" />
          <label>계정(발신)</label>
          <input value={email.user} onChange={e => setEmail({ ...email, user: e.target.value })} style={inp} placeholder="me@gmail.com" />
          <label>앱 비밀번호</label>
          <input type="password" value={email.pass} onChange={e => setEmail({ ...email, pass: e.target.value })} style={inp} placeholder="저장된 경우 입력 불필요" autoComplete="off" />
          <label>수신자</label>
          <input value={email.to} onChange={e => setEmail({ ...email, to: e.target.value })} style={inp} placeholder="admin@example.com" />
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={saveEmail} style={{ padding: '4px 14px', cursor: 'pointer', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff', fontSize: 12 }}>💾 이메일 설정 저장</button>
          {emailMsg && <span style={{ fontSize: 11, color: '#4c3de6' }}>{emailMsg}</span>}
        </div>
        <p style={{ fontSize: 11, color: '#94a3b8', margin: '6px 0 0' }}>
          Gmail 사용시 계정의 앱 비밀번호(2단계 인증 활성 후 발급)를 입력하세요. 비밀번호는 safeStorage로 암호화 저장됩니다.
        </p>
      </section>

      {st && st.log && st.log.length > 0 && (
        <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginTop: 14 }}>
          <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>🧾 점검 로그</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <tbody>
              {st.log.map((l, i) => (
                <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={{ padding: 3, color: '#64748b', width: 150 }}>{String(l.ts || '').replace('T', ' ').slice(0, 19)}</td>
                  <td style={{ padding: 3 }}>전체 {l.total}몰 · 변경 {l.changed}건 · Gemini {l.geminiCalls}회{l.errors ? ` · 오류 ${l.errors}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}

const inp = { border: '1px solid #e2e8f0', borderRadius: 4, padding: '3px 6px', fontSize: 12, width: '100%', boxSizing: 'border-box' }
