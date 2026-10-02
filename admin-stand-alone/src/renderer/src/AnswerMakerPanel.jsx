import React, { useEffect, useState } from 'react'

// "엑셀 정답 만들기" — 캡처(Gemini) → 품목 추출 → 정답 xls 저장
export default function AnswerMakerPanel() {
  const [files, setFiles] = useState([])            // { path, label }
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [keyMsg, setKeyMsg] = useState('')
  const [keyState, setKeyState] = useState(null)    // { stored, env, configured }
  const [models, setModels] = useState([])          // [{id, displayName}]
  const [model, setModel] = useState('gemini-3.5-flash-lite')
  const [conn, setConn] = useState(null)
  const [items, setItems] = useState([])            // {name, spec, qty, unitPrice}
  const [orderTotal, setOrderTotal] = useState(null)
  const [shippingFee, setShippingFee] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const refreshKey = async () => {
    try { setKeyState(await window.ruleMgr.google.hasKey()) } catch {}
  }
  useEffect(() => { refreshKey() }, [])

  const addFiles = async () => {
    const picked = await window.ruleMgr.answer.pickFile()
    if (!picked || !picked.length) return
    setFiles(fs => {
      const seen = new Set(fs.map(f => f.path))
      const add = picked.filter(p => !seen.has(p)).map(p => ({ path: p, label: p.split(/[\\/]/).pop() }))
      return [...fs, ...add]
    })
  }
  const removeFile = (path) => setFiles(fs => fs.filter(f => f.path !== path))

  const saveKey = async () => {
    const r = await window.ruleMgr.google.setKey(apiKeyInput)
    setKeyMsg(r.ok ? 'Key를 safeStorage로 암호화해 저장했습니다' : (r.message || '저장 실패'))
    setApiKeyInput('')
    await refreshKey()
  }
  const clearKey = async () => {
    await window.ruleMgr.google.clearKey()
    setKeyMsg('저장된 Key를 삭제했습니다')
    setKeyState(await window.ruleMgr.google.hasKey())
    setModels([])
    setConn(null)
  }

  const loadModels = async () => {
    setErr('')
    try {
      const key = apiKeyInput.trim() || undefined
      const { models: list } = await window.ruleMgr.google.listModels(key)
      setModels(list)
      setModel(m => (list.some(x => x.id === m) ? m : (list.find(x => /flash-lite/i.test(x.id)) || list[0] || { id: m }).id))
      setConn({ ok: true, text: `연결 성공 — generateContent 모델 ${list.length}개` })
    } catch (e) {
      setConn({ ok: false, text: '연결 실패 — ' + String(e.message || e).slice(0, 120) })
    }
  }
  const testConn = async () => {
    setErr('')
    const key = apiKeyInput.trim() || undefined
    const r = await window.ruleMgr.google.test(key)
    setConn(r.ok
      ? { ok: true, text: `연결 성공 — 모델 ${r.models}개` }
      : { ok: false, text: '연결 실패 — ' + (r.message || r.code) })
  }

  const extract = async () => {
    if (!files.length) { setErr('캡처 파일을 먼저 추가하세요'); return }
    setBusy(true)
    setErr('')
    try {
      const r = await window.ruleMgr.answer.extract({ model, files: files.map(f => f.path) })
      setItems(r.items)
      setOrderTotal(r.orderTotal)
      setShippingFee(r.shippingFee)
      setMsg(`추출 완료: ${r.items.length}건 — 내용을 확인하고 저장하세요`)
    } catch (e) {
      setErr('추출 실패: ' + String(e.message || e).slice(0, 200))
    }
    setBusy(false)
  }

  const save = async () => {
    if (!items.length) { setErr('저장할 품목이 없습니다'); return }
    const r = await window.ruleMgr.answer.save({ items })
    if (r.ok) { setMsg(`저장 완료: ${r.path} (${r.count}건)`) } else if (!r.canceled) { setMsg('저장 실패') }
  }

  const total = items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unitPrice) || 0), 0)
  const setItem = (i, field, value) => setItems(arr => arr.map((it, k) => k === i ? { ...it, [field]: value } : it))

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ width: 340, flexShrink: 0 }}>
        <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <h3 style={{ fontSize: 13, margin: '0 0 6px' }}>📎 캡처 파일 (여러 장)</h3>
          <button onClick={addFiles} style={btnSm}>＋ mhtml/html 추가</button>
          <ul style={{ margin: '6px 0 0', paddingLeft: 14, fontSize: 11, color: '#475569' }}>
            {files.map(f => (
              <li key={f.path} style={{ marginBottom: 2, wordBreak: 'break-all' }}>
                {f.label} <button onClick={() => removeFile(f.path)} style={delBtn}>✕</button>
              </li>
            ))}
            {files.length === 0 && <li style={{ color: '#94a3b8', listStyle: 'none' }}>파일 없음</li>}
          </ul>
        </section>

        <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
          <h3 style={{ fontSize: 13, margin: '0 0 6px' }}>🔑 구글 API</h3>
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <input type="password" value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)} placeholder="Google API Key" autoComplete="off" style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 4, padding: '3px 6px', fontSize: 11, minWidth: 0 }} />
            <button onClick={saveKey} disabled={!apiKeyInput} style={{ ...btnSm, opacity: apiKeyInput ? 1 : 0.5 }}>저장</button>
          </div>
          <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6 }}>
            저장 상태: {keyState ? (keyState.stored ? 'safeStorage 저장됨' : keyState.env ? '환경변수 사용 중' : '미설정') : '확인 중…'}
            {keyState && keyState.stored && <button onClick={clearKey} style={{ marginLeft: 6, fontSize: 10, cursor: 'pointer' }}>삭제</button>}
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <select value={model} onChange={e => setModel(e.target.value)} style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 11, minWidth: 0 }}>
              <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash Lite (기본)</option>
              {models.map(m => <option key={m.id} value={m.id}>{m.displayName || m.id}</option>)}
            </select>
          </div>
          <button onClick={loadModels} style={{ width: '100%', padding: '4px 0', cursor: 'pointer', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', fontSize: 11, marginBottom: 4 }}>
            📋 모델 목록 불러오기
          </button>
          <button onClick={testConn} style={{ width: '100%', padding: '5px 0', cursor: 'pointer', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', fontSize: 11 }}>
            🔗 연결 확인
          </button>
          {conn && <div style={{ fontSize: 10, marginTop: 4, color: conn.ok ? '#1a7f37' : '#dc2626' }}>{conn.text}</div>}
        </section>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <button onClick={extract} disabled={busy || !files.length} style={{ padding: '6px 16px', cursor: busy || !files.length ? 'not-allowed' : 'pointer', border: 'none', borderRadius: 6, background: '#5B4DFB', color: '#fff', fontWeight: 700, fontSize: 12, opacity: busy || !files.length ? 0.5 : 1 }}>
            {busy ? 'Gemini 추출 중…' : '▶ 품목 추출'}
          </button>
          <button onClick={save} disabled={!items.length} style={{ ...btnSm, opacity: items.length ? 1 : 0.5 }}>💾 xls 저장</button>
          <span style={{ fontSize: 11, color: '#64748b' }}>{msg}</span>
        </div>
        {err && <p style={{ fontSize: 12, color: '#dc2626', margin: '0 0 6px', whiteSpace: 'pre-wrap' }}>{err}</p>}
        {items.length > 0 && (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f1f5f9', color: '#475569' }}>
                  <th style={{ padding: 4, textAlign: 'left' }}>품목명</th>
                  <th style={{ padding: 4, textAlign: 'left', width: 120 }}>규격</th>
                  <th style={{ padding: 4, width: 60 }}>수량</th>
                  <th style={{ padding: 4, width: 90 }}>단가</th>
                  <th style={{ padding: 4, width: 90 }}>총합</th>
                  <th style={{ padding: 4, width: 30 }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => {
                  const sum = (Number(it.qty) || 0) * (Number(it.unitPrice) || 0)
                  return (
                    <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: 3 }}>
                        <input value={it.name} onChange={e => setItem(i, 'name', e.target.value)} style={{ width: '95%', border: '1px solid #f1f5f9', fontSize: 12 }} />
                      </td>
                      <td style={{ padding: 3 }}>
                        <input value={it.spec} onChange={e => setItem(i, 'spec', e.target.value)} style={{ width: '95%', border: '1px solid #f1f5f9', fontSize: 11 }} />
                      </td>
                      <td style={{ padding: 3, textAlign: 'center' }}>
                        <input type="number" value={it.qty} onChange={e => setItem(i, 'qty', Number(e.target.value) || 0)} style={{ width: 48, border: '1px solid #f1f5f9', textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: 3, textAlign: 'right' }}>
                        <input type="number" value={it.unitPrice} onChange={e => setItem(i, 'unitPrice', Number(e.target.value) || 0)} style={{ width: 72, border: '1px solid #f1f5f9', textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: 3, textAlign: 'right' }}>{sum.toLocaleString('ko-KR')}원</td>
                      <td style={{ padding: 3, textAlign: 'center' }}>
                        <button onClick={() => setItems(arr => arr.filter((_, k) => k !== i))} style={{ cursor: 'pointer', color: '#dc2626', border: 'none', background: 'none' }}>✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div style={{ marginTop: 10, fontSize: 13, display: 'flex', gap: 20 }}>
              <span>품목 총합: <b>{total.toLocaleString('ko-KR')}원</b></span>
              {shippingFee != null && shippingFee > 0 && <span style={{ color: '#b45309' }}>배송비: {Number(shippingFee).toLocaleString('ko-KR')}원</span>}
              <span>최종 주문 금액: <b style={{ color: '#5B4DFB' }}>{(total + (Number(shippingFee) || 0)).toLocaleString('ko-KR')}원</b></span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const delBtn = { cursor: 'pointer', color: '#dc2626', border: 'none', background: 'none', marginLeft: 4 }
const btnSm = { padding: '3px 10px', fontSize: 11, cursor: 'pointer', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff' }
