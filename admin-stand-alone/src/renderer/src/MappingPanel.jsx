import React, { useEffect, useState } from 'react'
import {
  subscribe, getState, closeMapping, setStep, steps, stepLabel,
  setMode, assemble, runPreview, registerFrame
} from './mapping-state.js'

export default function MappingPanel({ repoRoot, onSaved }) {
  const [, force] = useState(0)
  useEffect(() => subscribe(() => force(v => v + 1)), [])
  const s = getState()
  const [meta, setMeta] = useState(s.meta)
  useEffect(() => { setMeta(s.meta) }, [s.token])
  const rule = (s.assembled && s.assembled.rule) || null

  const doAssemble = async () => {
    await assemble(meta)
  }
  const doSave = async () => {
    if (!rule) return
    try {
      await window.ruleMgr.rulesSave(repoRoot, rule)
      onSaved && onSaved(`매핑 규칙 "${rule.id}" 저장 완료 (소스+analysis 사본)`)
      closeMapping()
    } catch (e) {
      window.alert('저장 실패: ' + String(e.message || e))
    }
  }

  return (
    <section style={{ border: '2px solid #DDD9FC', borderRadius: 10, padding: 14, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>🖱 클릭 매핑 {s.title ? `— ${s.title}` : ''}</h2>
        <span style={{ fontSize: 11, color: s.pickerReady ? '#1a7f37' : '#b45309' }}>{s.pickerReady ? '피커 준비됨' : '뷰어 로딩 중…'}</span>
        <button onClick={closeMapping} style={{ marginLeft: 'auto', cursor: 'pointer' }}>닫기</button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
        <iframe
          ref={registerFrame}
          src={s.url}
          sandbox="allow-scripts"
          style={{ width: '58%', height: 480, border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff' }}
          title="매핑 뷰어"
        />
        <div style={{ flex: 1 }}>
          <ol style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 12 }}>
            {steps().map(st => (
              <li key={st} style={{ margin: '3px 0', color: st === s.step ? '#5B4DFB' : '#334155', fontWeight: st === s.step ? 700 : 400 }}>
                <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setStep(st)}>{stepLabel(st)}</span>
                {s.picks[st === 'row' ? 'row' : st === 'optionRow' ? 'optionRow' : st === 'checked' ? 'checkedOnly' : st] && <span style={{ color: '#1a7f37' }}> ✓</span>}
                {st !== 'row' && st !== 'meta' && (
                  <button
                    onClick={() => setMode(st === 'optionRow' ? 'optionrow' : st)}
                    style={{ marginLeft: 6, fontSize: 10, cursor: 'pointer', background: st === s.step ? '#5B4DFB' : '#f1f5f9', color: st === s.step ? '#fff' : '#334155', border: 'none', borderRadius: 4, padding: '1px 6px' }}
                  >클릭 모드</button>
                )}
              </li>
            ))}
          </ol>

          <div style={{ fontSize: 12, display: 'grid', gridTemplateColumns: '84px 1fr', rowGap: 4 }}>
            <label>규칙 ID</label>
            <input value={meta.ruleId} onChange={e => setMeta({ ...meta, ruleId: e.target.value })} placeholder="예: musinsa-cart" style={inp} />
            <label>이름</label>
            <input value={meta.name} onChange={e => setMeta({ ...meta, name: e.target.value })} style={inp} />
            <label>match</label>
            <input value={meta.match} onChange={e => setMeta({ ...meta, match: e.target.value })} placeholder="URL에 포함될 도메인" style={inp} />
            <label>장바구니</label>
            <span><input type="checkbox" checked={meta.isCart} onChange={e => setMeta({ ...meta, isCart: e.target.checked })} /> 체크박스(⑥) 필수</span>
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button onClick={doAssemble} style={btn}>🧩 규칙 조립</button>
            <button
              onClick={() => rule && runPreview(rule)}
              disabled={!rule}
              style={{ ...btn, opacity: rule ? 1 : 0.5 }}
            >👁 추출 미리보기</button>
            <button
              onClick={doSave}
              disabled={!rule}
              style={{ ...btnPrimary, opacity: rule ? 1 : 0.5 }}
            >💾 저장</button>
          </div>

          {s.error && <p style={{ fontSize: 12, color: '#dc2626', marginTop: 6 }}>{s.error}</p>}
          {s.preview && s.preview.error && (
            <p style={{ fontSize: 12, color: '#dc2626', marginTop: 6 }}>미리보기 실패: {s.preview.error}</p>
          )}
          {s.preview && Array.isArray(s.preview.items) && (
            <div style={{ fontSize: 11, marginTop: 6 }}>
              <b>미리보기 {s.preview.count}건</b> (첫 {s.preview.items.length}개)
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
                <tbody>
                  {s.preview.items.map((it, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: 2 }}>{it.name}</td>
                      <td style={{ padding: 2 }}>×{it.qty}</td>
                      <td style={{ padding: 2 }}>{Number(it.unitPrice || 0).toLocaleString('ko-KR')}원</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {rule && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ fontSize: 12, cursor: 'pointer' }}>규칙 JSON</summary>
              <pre style={{ fontSize: 10, background: '#f8fafc', padding: 8, borderRadius: 6, overflow: 'auto', maxHeight: 200 }}>{JSON.stringify(rule, null, 2)}</pre>
            </details>
          )}
        </div>
      </div>
      {s.location && <p style={{ fontSize: 11, color: '#94a3b8', margin: '8px 0 0' }}>문서 URL: {s.location}</p>}
    </section>
  )
}

const inp = { border: '1px solid #e2e8f0', borderRadius: 4, padding: '2px 6px', fontSize: 12, width: '100%', boxSizing: 'border-box' }
const btn = { padding: '6px 12px', cursor: 'pointer', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff' }
const btnPrimary = { padding: '6px 14px', cursor: 'pointer', border: 'none', borderRadius: 6, background: '#5B4DFB', color: '#fff', fontWeight: 700 }
