import React, { useEffect, useState } from 'react'
import { deriveSpec, answerUnit, mergeShippingRows } from '../../shared/answer-logic.js'

// "엑셀 정답 만들기" — 캡처(Gemini: HTML 또는 화면 캡처 이미지) → 품목 추출 → 정답 xls 저장
// 캡처별 개별 추출로 sourceId 연결: 캡처 삭제시 해당 추출 결과도 삭제된다
let imageSeq = 0

const COLS = ['쇼핑몰 이름', '품목명', '규격', '단위', '수량', '단가', '총합', '']

export default function AnswerMakerPanel({ active = true }) {
  const [entries, setEntries] = useState([])         // { id, type: 'file'|'image', label, path?, data?, mimeType? }
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [keyMsg, setKeyMsg] = useState('')
  const [keyState, setKeyState] = useState(null)    // { stored, env, configured }
  const [models, setModels] = useState([])          // [{id, displayName}]
  const [model, setModel] = useState('gemini-3.5-flash-lite')
  const [conn, setConn] = useState(null)
  const [items, setItems] = useState([])            // {name, spec, unit, qty, unitPrice, sourceId, sourceLabel, isShipping}
  const [mallNames, setMallNames] = useState({})    // sourceId → 쇼핑몰 이름
  const [usage, setUsage] = useState(null)          // { date, count, rpd }
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [colWidths, setColWidths] = useState({})

  const refreshKey = async () => {
    try { setKeyState(await window.ruleMgr.google.hasKey()) } catch {}
  }
  useEffect(() => { refreshKey() }, [])

  // Ctrl+V 화면 캡처 붙여넣기 — 탭이 활성인 동안 이미지를 여러 장 추가할 수 있다
  useEffect(() => {
    if (!active) return
    const onPaste = async (e) => {
      const clipItems = [...((e.clipboardData || window.clipboardData)?.items || [])]
      const img = clipItems.find(it => String(it.type).startsWith('image/'))
      if (!img) return
      e.preventDefault()
      const blob = img.getAsFile()
      if (!blob) return
      const dataUrl = await new Promise(res => {
        const r = new FileReader()
        r.onload = () => res(r.result)
        r.readAsDataURL(blob)
      })
      imageSeq++
      setEntries(arr => [...arr, {
        id: `img-${Date.now()}-${imageSeq}`,
        type: 'image',
        mimeType: blob.type || 'image/png',
        data: String(dataUrl).split(',').pop(),
        label: `화면 캡처 ${arr.filter(x => x.type === 'image').length + 1}`
      }])
      setErr('')
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [active])

  const addFiles = async () => {
    const picked = await window.ruleMgr.answer.pickFile()
    if (!picked || !picked.length) return
    setEntries(fs => {
      const seen = new Set(fs.map(f => f.path))
      const add = picked.filter(p => !seen.has(p)).map(p => ({ id: `f-${p}`, type: 'file', path: p, label: p.split(/[\\/]/).pop() }))
      return [...fs, ...add]
    })
  }

  const removeEntry = (id) => {
    setEntries(fs => fs.filter(f => f.id !== id))
    setItems(arr => arr.filter(it => it.sourceId !== id))
    setMallNames(m => { const n = { ...m }; delete n[id]; return n })
  }

  const clearAll = () => {
    if (!entries.length && !items.length) return
    if (!confirm('추출 결과와 캡처 입력을 모두 삭제할까요?')) return
    setEntries([])
    setItems([])
    setMallNames({})
    setMsg('전체 삭제 완료 — 캡처 내용도 함께 삭제되었습니다')
  }

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
    if (!entries.length) { setErr('캡처 파일 또는 화면 캡처를 먼저 추가하세요'); return }
    setBusy(true)
    setErr('')
    setMsg('')
    const perEntry = {}
    const errs = []
    let fellBack = null
    for (const f of entries) {
      try {
        const req = f.type === 'file'
          ? { model, file: f.path }
          : { model, image: { mimeType: f.mimeType, data: f.data } }
        const r = await window.ruleMgr.answer.extract(req)
        if (r.usage) setUsage(r.usage)
        if (r.usedModel && r.usedModel !== model) fellBack = r.usedModel
        if (r.mallName) setMallNames(m => ({ ...m, [f.id]: r.mallName }))
        const rows = (r.items || []).map(it => {
          const specRaw = String(it.spec || '').trim()
          return {
            ...it,
            spec: deriveSpec(it.name, specRaw) || specRaw,
            unit: answerUnit(false),
            sourceId: f.id,
            sourceLabel: f.label,
            isShipping: false
          }
        })
        if (r.shippingFee != null && Number(r.shippingFee) > 0) {
          rows.push({
            name: '배송비', spec: '', unit: answerUnit(true), qty: 1, unitPrice: Number(r.shippingFee),
            sourceId: f.id, sourceLabel: f.label, isShipping: true
          })
        }
        perEntry[f.id] = rows
      } catch (e) {
        errs.push(`${f.label}: ${String(e.message || e).slice(0, 120)}`)
      }
    }
    setItems(prev => {
      const bySrc = {}
      for (const it of prev) { (bySrc[it.sourceId] = bySrc[it.sourceId] || []).push(it) }
      Object.assign(bySrc, perEntry)
      return entries.flatMap(f => bySrc[f.id] || [])
    })
    if (errs.length) setErr(errs.join('\n'))
    setMsg(`추출 완료: ${Object.keys(perEntry).length}/${entries.length} 캡처 — 내용을 확인하고 저장하세요` + (fellBack ? ` (모델 폴백: ${fellBack})` : ''))
    setBusy(false)
  }

  const save = async () => {
    if (!items.length) { setErr('저장할 품목이 없습니다'); return }
    const normal = items.filter(it => !it.isShipping).map(it => ({
      name: it.name, spec: it.spec || '', unit: it.unit || '개',
      qty: Number(it.qty) || 1, unitPrice: Number(it.unitPrice) || 0
    }))
    const shipMerged = mergeShippingRows(items.filter(it => it.isShipping).map(it => ({ qty: Number(it.qty) || 1, unitPrice: Number(it.unitPrice) || 0 })))
    const all = [...normal, ...shipMerged.map(s => ({ name: '배송비', spec: '', unit: '식', qty: s.qty, unitPrice: s.unitPrice }))]
    const r = await window.ruleMgr.answer.save({ items: all })
    if (r.ok) {
      setMsg(`저장 완료: ${r.path} — 품목 ${normal.length}건 + 배송비 ${shipMerged.length}행(단가별 합산)`)
    } else if (!r.canceled) {
      setMsg('저장 실패')
    }
  }

  const goodsTotal = items.filter(it => !it.isShipping).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0)
  const shipTotal = items.filter(it => it.isShipping).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0)
  const setItem = (i, field, value) => setItems(arr => arr.map((it, k) => k === i ? { ...it, [field]: value } : it))

  const startResize = idx => e => {
    e.preventDefault()
    e.stopPropagation()
    const th = e.currentTarget.parentElement
    const startX = e.clientX
    const startW = th.offsetWidth
    const move = ev => setColWidths(w => ({ ...w, [idx]: Math.max(40, startW + ev.clientX - startX) }))
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ width: 340, flexShrink: 0 }}>
        <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <h3 style={{ fontSize: 13, margin: '0 0 6px' }}>📎 캡처 입력 (여러 장)</h3>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={addFiles} style={btnSm}>＋ mhtml/html 파일 추가</button>
            <button onClick={clearAll} style={{ ...btnSm, color: '#dc2626' }}>🗑 전체 삭제</button>
          </div>
          <div style={{ marginTop: 6, border: '1px dashed #c7d2fe', borderRadius: 6, padding: '6px 8px', fontSize: 11, color: '#64748b' }}>
            쇼핑몰 화면을 캡처(PrintScreen 등)한 뒤 이 창에서 <b>Ctrl+V</b>로 여러 장 붙여넣을 수 있습니다.
            캡처를 삭제하면 그 캡처의 추출 결과도 함께 삭제됩니다.
          </div>
          <ul style={{ margin: '6px 0 0', paddingLeft: 14, fontSize: 11, color: '#475569' }}>
            {entries.map(f => (
              <li key={f.id} style={{ marginBottom: 2, wordBreak: 'break-all' }}>
                {f.type === 'image' ? '🖼 ' : '📄 '}{f.label}
                {mallNames[f.id] && <span style={{ color: '#5B4DFB', marginLeft: 4 }}>({mallNames[f.id]})</span>}
                <button onClick={() => removeEntry(f.id)} style={delBtn}>✕</button>
              </li>
            ))}
            {entries.length === 0 && <li style={{ color: '#94a3b8', listStyle: 'none' }}>입력 없음</li>}
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
              <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (폴백)</option>
              {models.map(m => <option key={m.id} value={m.id}>{m.displayName || m.id}</option>)}
            </select>
          </div>
          <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>
            사용량: 오늘 {usage ? usage.count : 0}회 호출 · RPD {usage && usage.rpd != null ? `${usage.rpd} (무료 등급 참고값)` : '미확인'}
            {model === 'gemini-3.5-flash-lite' && ' — 3.5 실패 시 3.1 Flash Lite로 자동 전환'}
          </div>
          <button onClick={loadModels} style={{ width: '100%', padding: '4px 0', cursor: 'pointer', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', fontSize: 11, marginBottom: 4 }}>
            📋 모델 목록 불러오기
          </button>
          <button onClick={testConn} style={{ width: '100%', padding: '5px 0', cursor: 'pointer', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', fontSize: 11 }}>
            🔗 연결 확인
          </button>
          {conn && <div style={{ fontSize: 10, marginTop: 4, color: conn.ok ? '#1a7f37' : '#dc2626' }}>{conn.text}</div>}
          {keyMsg && <div style={{ fontSize: 10, marginTop: 4, color: '#4c3de6' }}>{keyMsg}</div>}
        </section>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <button onClick={extract} disabled={busy || !entries.length} style={{ padding: '6px 16px', cursor: busy || !entries.length ? 'not-allowed' : 'pointer', border: 'none', borderRadius: 6, background: '#5B4DFB', color: '#fff', fontWeight: 700, fontSize: 12, opacity: busy || !entries.length ? 0.5 : 1 }}>
            {busy ? 'Gemini 추출 중…' : '▶ 품목 추출'}
          </button>
          <button onClick={save} disabled={!items.length} style={{ ...btnSm, opacity: items.length ? 1 : 0.5 }}>💾 xls 저장</button>
          <span style={{ fontSize: 11, color: '#64748b' }}>{msg}</span>
        </div>
        {err && <p style={{ fontSize: 12, color: '#dc2626', margin: '0 0 6px', whiteSpace: 'pre-wrap' }}>{err}</p>}
        {items.length > 0 && (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', color: '#475569' }}>
                  {COLS.map((label, i) => (
                    <th key={i} style={{ position: 'relative', padding: 4, textAlign: i >= 2 && i <= 6 ? 'center' : 'left', width: colWidths[i], userSelect: 'none' }}>
                      {label === '쇼핑몰 이름' && (
                        <button onClick={clearAll} style={{ ...btnSm, fontSize: 10, padding: '1px 6px', color: '#dc2626', borderColor: '#fecaca', marginRight: 4 }}>🗑 전체 삭제</button>
                      )}
                      {label}
                      {i < COLS.length - 1 && (
                        <span onMouseDown={startResize(i)} title="드래그로 열 너비 조절" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, cursor: 'col-resize', background: 'transparent' }} />
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => {
                  const prev = items[i - 1]
                  const groupStart = !prev || prev.sourceId !== it.sourceId
                  const sum = (Number(it.qty) || 0) * (Number(it.unitPrice) || 0)
                  const rowBg = it.isShipping ? '#fff7ed' : undefined
                  return (
                    <tr key={i} style={{ borderTop: '1px solid #f1f5f9', background: rowBg }}>
                      <td style={{ padding: 3, fontSize: 11, color: '#5B4DFB', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={mallNames[it.sourceId] || ''}>
                        {groupStart ? (mallNames[it.sourceId] || '—') : ''}
                      </td>
                      <td style={{ padding: 3 }}>
                        <input value={it.name} onChange={e => setItem(i, 'name', e.target.value)} style={{ width: '95%', border: '1px solid #f1f5f9', fontSize: 12, fontWeight: it.isShipping ? 700 : 400 }} />
                      </td>
                      <td style={{ padding: 3 }}>
                        <input value={it.spec} onChange={e => setItem(i, 'spec', e.target.value)} style={{ width: '95%', border: '1px solid #f1f5f9', fontSize: 11 }} />
                      </td>
                      <td style={{ padding: 3, textAlign: 'center' }}>
                        <input value={it.unit || ''} onChange={e => setItem(i, 'unit', e.target.value)} style={{ width: 44, border: '1px solid #f1f5f9', fontSize: 11, textAlign: 'center' }} />
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
              <span>품목 총합: <b>{goodsTotal.toLocaleString('ko-KR')}원</b></span>
              {shipTotal > 0 && <span style={{ color: '#b45309' }}>배송비: {shipTotal.toLocaleString('ko-KR')}원 (단위: 식)</span>}
              <span>최종 주문 금액: <b style={{ color: '#5B4DFB' }}>{(goodsTotal + shipTotal).toLocaleString('ko-KR')}원</b></span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const delBtn = { cursor: 'pointer', color: '#dc2626', border: 'none', background: 'none', marginLeft: 4 }
const btnSm = { padding: '3px 10px', fontSize: 11, cursor: 'pointer', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff' }
