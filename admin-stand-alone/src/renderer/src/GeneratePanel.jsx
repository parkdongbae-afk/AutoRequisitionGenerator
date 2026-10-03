import React, { useEffect, useState } from 'react'

/*
 * 새 규칙 탭 — AI 생성 없음(§7.6 생성 단계 폐지).
 * 관리자가 주문서/장바구니 규칙 JSON을 직접 탑재하면 단계별 검증 체크리스트로
 * 통과 여부를 표시하고, 전부 통과해야 저장소에 반영할 수 있다.
 */
const KIND_LABEL = { order: '주문서', cart: '장바구니' }

function runChecks(rule, fileName, existingIds) {
  const checks = []
  const add = (name, ok, level = 'error', detail = '') => checks.push({ name, ok, level, detail })

  add('JSON 문법', !!rule, 'error', rule ? '' : '파싱 실패한 파일')
  if (!rule) return checks

  const id = String(rule.id || '')
  add('규칙 ID 형식', /^[a-z0-9][a-z0-9-]*$/.test(id), 'error',
    id ? (id.endsWith('-cart') ? '장바구니 규칙(-cart 접미사)' : '주문서 규칙') : 'id 없음')

  add('규칙 이름(name)', !!String(rule.name || '').trim(), 'error', String(rule.name || ''))

  const match = Array.isArray(rule.match) ? rule.match.filter(Boolean) : []
  add('match 도메인', match.length > 0 && match.every(m => /^[a-z0-9.-]+$/i.test(m)), 'error',
    match.length ? match.join(', ') : 'match 비어 있음')

  add('상품 행 선택자(rowSelector)', !!String(rule.rowSelector || '').trim(), 'error', String(rule.rowSelector || ''))

  const f = rule.fields || {}
  const missing = ['name', 'price'].filter(k => !f[k] || !String(f[k].sel || '').trim())
  add('필수 필드(name·price 셀렉터)', missing.length === 0, 'error',
    missing.length ? `누락: ${missing.join(', ')}` : 'name·price 셀렉터 있음')

  const priceIs = rule.priceIs == null ? 'lineTotal' : rule.priceIs
  add('priceIs 유효값', ['lineTotal', 'unit'].includes(priceIs), 'error', priceIs)

  const isCart = id.endsWith('-cart')
  if (isCart && !rule.checkedOnly) {
    add('장바구니 checkedOnly', false, 'warning', '-cart 규칙은 checkedOnly 권장(§9.6)')
  } else {
    add('장바구니 checkedOnly', true, 'info', isCart ? '설정됨' : '해당 없음(주문서)')
  }

  const dup = existingIds.includes(id)
  add('ID 중복 검사', !dup, 'error', dup ? `이미 저장소에 존재: ${id}` : '중복 없음')

  const expectedFile = `${id}.json`
  add('파일명 일치', fileName === expectedFile, 'warning',
    fileName === expectedFile ? expectedFile : `탑재 파일 ${fileName} ≠ 권장 ${expectedFile}`)

  return checks
}

export default function GeneratePanel({ repoRoot, onSaved }) {
  const [loaded, setLoaded] = useState([])   // { fileName, text, rule, kind, checks }
  const [existingIds, setExistingIds] = useState([])
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.ruleMgr.rulesList()
      .then(list => setExistingIds(list.map(r => r.id)))
      .catch(() => {})
  }, [])

  const pickFiles = async () => {
    const picked = await window.ruleMgr.answer.pickFile()
    if (!picked || !picked.length) return
    const entries = []
    for (const path of picked) {
      const fileName = path.split(/[\\/]/).pop()
      let text = ''
      let rule = null
      let parseError = null
      try {
        text = await window.ruleMgr.rulesReadFile(path)
      } catch (e) {
        parseError = String(e.message || e)
      }
      if (text) {
        try { rule = JSON.parse(text) } catch (e) { parseError = String(e.message || e) }
      }
      const kind = (rule && rule.id || fileName).endsWith('-cart') ? 'cart' : 'order'
      const checks = rule ? runChecks(rule, fileName, existingIds) : []
      if (parseError) checks.unshift({ name: 'JSON 문법', ok: false, level: 'error', detail: parseError.slice(0, 120) })
      entries.push({ fileName, text, rule, kind, checks })
    }
    setLoaded(entries)
    setMsg(`${entries.length}개 파일 탑재 — 검증 결과를 확인하세요`)
  }

  const setKind = (idx, kind) => {
    setLoaded(arr => arr.map((e, i) => {
      if (i !== idx) return e
      let rule = e.rule
      if (rule) {
        const baseId = rule.id.replace(/-cart$/, '')
        const nextId = kind === 'cart' ? `${baseId}-cart` : baseId
        rule = { ...rule, id: nextId }
        return { ...e, rule, kind, checks: runChecks(rule, e.fileName, existingIds) }
      }
      return { ...e, kind }
    }))
  }

  const allPassed = loaded.length > 0 && loaded.every(e =>
    e.checks.length > 0 && e.checks.every(c => c.ok || c.level !== 'error'))

  const saveAll = async () => {
    if (!allPassed) return
    if (!confirm(`${loaded.length}개 규칙을 저장소에 반영할까요? (rules.json 재생성 포함)`)) return
    setSaving(true)
    try {
      for (const e of loaded) {
        await window.ruleMgr.rulesSave(repoRoot, e.rule)
      }
      const r = await window.ruleMgr.rulesRebuildJson(true)
      setMsg(`저장 완료 — 규칙 ${loaded.length}건 · rules.json v${r.version} 재생성`)
      setLoaded([])
      const list = await window.ruleMgr.rulesList()
      setExistingIds(list.map(x => x.id))
      if (onSaved) onSaved()
    } catch (e2) {
      setMsg('저장 실패: ' + String(e2.message || e2))
    }
    setSaving(false)
  }

  return (
    <div>
      <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, margin: '0 0 6px' }}>📥 규칙 JSON 탑재·검증</h2>
        <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 8px' }}>
          AI 생성 단계는 폐지되었습니다. 주문서/장바구니 규칙 JSON 파일을 직접 탑재하면
          단계별 검증 체크리스트로 통과 여부를 확인한 뒤 저장소에 반영합니다.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={pickFiles} style={{ padding: '6px 16px', cursor: 'pointer', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', fontSize: 12 }}>
            📄 JSON 파일 탑재
          </button>
          <button onClick={saveAll} disabled={!allPassed || saving} style={{ padding: '6px 16px', cursor: allPassed ? 'pointer' : 'not-allowed', border: 'none', borderRadius: 6, background: allPassed ? '#5B4DFB' : '#c7c7c7', color: '#fff', fontWeight: 700, fontSize: 12, opacity: saving ? 0.6 : 1 }}>
            {saving ? '저장 중…' : '💾 저장소 반영 (rules.json 재생성)'}
          </button>
          <span style={{ fontSize: 12, color: '#64748b' }}>{msg}</span>
        </div>
        {!repoRoot && <p style={{ fontSize: 12, color: '#b45309', margin: '6px 0 0' }}>먼저 홈 탭에서 대상 저장소를 선택하세요.</p>}
      </section>

      {loaded.map((e, idx) => {
        const errors = e.checks.filter(c => !c.ok && c.level === 'error').length
        const warnings = e.checks.filter(c => !c.ok && c.level === 'warning').length
        return (
          <section key={idx} style={{ border: `1px solid ${errors ? '#fecaca' : '#bbf7d0'}`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <h3 style={{ fontSize: 13, margin: 0 }}>{e.fileName}</h3>
              <select value={e.kind} onChange={ev => setKind(idx, ev.target.value)} style={{ border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 12 }}>
                <option value="order">{KIND_LABEL.order}</option>
                <option value="cart">{KIND_LABEL.cart}</option>
              </select>
              <span style={{ fontSize: 12, color: errors ? '#dc2626' : warnings ? '#b45309' : '#1a7f37', fontWeight: 700 }}>
                {errors ? `❌ 오류 ${errors}개` : warnings ? `⚠ 경고 ${warnings}개 — 저장 가능` : '✅ 전체 통과'}
              </span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <tbody>
                {e.checks.map((c, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '4px 8px', width: 24 }}>{c.ok ? '✅' : c.level === 'warning' ? '⚠' : '❌'}</td>
                    <td style={{ padding: '4px 8px', fontWeight: 600, width: 220 }}>{c.name}</td>
                    <td style={{ padding: '4px 8px', color: c.ok ? '#1a7f37' : c.level === 'warning' ? '#b45309' : '#dc2626' }}>{c.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )
      })}
    </div>
  )
}
