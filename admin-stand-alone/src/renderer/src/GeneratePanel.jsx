import React, { useEffect, useRef, useState } from 'react'
import DiffView from './DiffView.jsx'
import { ruleIdFor, suggestBaseId } from '../../shared/rule-id.js'

const KIND_LABEL = { order: '주문서', cart: '장바구니' }
const SHIP_LABEL = { free: '배송비 무료', paid: '배송비 발생' }
const SLOT_KEYS = ['order.free', 'order.paid', 'cart.free', 'cart.paid']

export default function GeneratePanel({ repoRoot, bridge, settings, onSaved }) {
  const [mallName, setMallName] = useState('')
  const [baseId, setBaseId] = useState('')
  const [kinds, setKinds] = useState({ order: true, cart: false })
  const [slots, setSlots] = useState({ 'order.free': [], 'order.paid': [], 'cart.free': [], 'cart.paid': [] })
  const [answers, setAnswers] = useState({ free: '', paid: '' })
  const [answerBasis, setAnswerBasis] = useState('common')
  const [folderDir, setFolderDir] = useState('')
  const [scanSummary, setScanSummary] = useState(null)
  const [inbox, setInbox] = useState(null)
  const [model, setModel] = useState(settings && settings.generation && settings.generation.model || '')
  const [maxRepair, setMaxRepair] = useState(3)
  const [opts, setOpts] = useState({ rebuildBundle: true, registerBuiltin: false, gitCommit: false, gitPush: false })
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState([])
  const [generation, setGeneration] = useState(null)
  const [genDiffs, setGenDiffs] = useState({})
  const [msg, setMsg] = useState('')
  const logRef = useRef(null)

  useEffect(() => {
    const off = window.ruleMgr.generate.onProgress(m => setProgress(p => [...p.slice(-200), m]))
    return off
  }, [])
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [progress])
  useEffect(() => { loadInbox() }, [])
  useEffect(() => {
    const off = window.ruleMgr.onInbox(() => loadInbox())
    return off
  }, [])

  const loadInbox = async () => {
    try {
      const scan = await window.ruleMgr.inboxList()
      setInbox(scan)
      if (scan.mallName) setMallName(m => m || scan.mallName)
      setSlots(s => {
        const n = { ...s }
        for (const c of scan.captures) {
          const key = `${c.kind}.${c.shipTag || 'free'}`
          if (!n[key]) continue
          if (!n[key].some(x => x.path === c.path)) n[key].push({ path: c.path, metaPath: c.metaPath || null, tag: c.shipTag || 'free' })
        }
        return n
      })
    } catch {}
  }

  const effBaseId = baseId || suggestBaseId(mallName)
  const selectedKinds = Object.entries(kinds).filter(([, v]) => v).map(([k]) => k)

  const importFolder = async () => {
    const dir = await window.ruleMgr.pickDir()
    if (!dir) return
    setFolderDir(dir)
    try {
      const scan = await window.ruleMgr.generate.scanFolder(dir)
      setScanSummary(scan.summary)
      setSlots(s => {
        const n = { ...s }
        for (const c of scan.captures) {
          const key = `${c.kind}.${c.shipTag || 'free'}`
          if (!n[key]) n[key] = []
          if (!n[key].some(x => x.path === c.path)) n[key].push({ path: c.path, answerPath: c.answerPath || null, tag: c.shipTag || 'free' })
        }
        return n
      })
      if (scan.mallName) setMallName(m => m || scan.mallName)
      if (scan.answers.length) setAnswers(a => {
        const n = { ...a }
        for (const p of scan.answers) {
          if (/무료/.test(p) && !n.free) n.free = p
          else if (/유료|발생/.test(p) && !n.paid) n.paid = p
        }
        return n
      })
      setKinds(k => ({
        order: k.order || scan.captures.some(c => c.kind === 'order'),
        cart: k.cart || scan.captures.some(c => c.kind === 'cart')
      }))
    } catch (e) {
      setMsg('폴더 불러오기 실패: ' + String(e.message || e))
    }
  }

  const pickAnswer = async (ship) => {
    const files = await window.ruleMgr.pickAnswer()
    if (files && files.length) setAnswers(a => ({ ...a, [ship]: files[0] }))
  }
  const addSlotFiles = async (key) => {
    const files = await window.ruleMgr.pickSamples()
    if (!files || !files.length) return
    const ship = key.split('.')[1]
    setSlots(s => ({ ...s, [key]: [...s[key], ...files.slice(0, 8).map(p => ({ path: p, tag: ship }))] }))
  }

  const payload = () => {
    const samplesByKind = { order: [], cart: [] }
    for (const key of Object.keys(slots)) {
      const [kind, ship] = key.split('.')
      for (const e of slots[key]) {
        samplesByKind[kind].push({
          path: e.path,
          tag: ship,
          answerPath: answers[ship] || e.answerPath || undefined,
          metaPath: e.metaPath || undefined
        })
      }
    }
    return {
      mallName, baseId: effBaseId, kinds: selectedKinds, samplesByKind,
      answers: { free: answers.free || undefined, paid: answers.paid || undefined },
      answerExcel: answers.free || answers.paid || answerExcelFallback(),
      answerBasis, model, maxRepair
    }
  }
  const answerExcelFallback = () => {
    for (const key of Object.keys(slots)) for (const e of slots[key]) if (e.answerPath) return e.answerPath
    return null
  }

  const run = async () => {
    setRunning(true)
    setProgress([])
    setGeneration(null)
    setMsg('')
    try {
      const res = await window.ruleMgr.generate.start(payload())
      setGeneration(res)
      setMsg('생성 완료 — 아래 결과를 확인하고 적용하세요')
    } catch (e) {
      setMsg('생성 실패: ' + String(e.message || e))
    }
    setRunning(false)
  }

  useEffect(() => {
    if (!generation || !generation.results) return
    ;(async () => {
      const d = {}
      for (const r of generation.results) {
        if (!r.rule) continue
        const raw = await window.ruleMgr.rulesRead(r.rule.id)
        d[r.rule.id] = raw ? { before: raw, after: JSON.stringify(r.rule, null, 2) + '\n' } : null
      }
      setGenDiffs(d)
    })()
  }, [generation])

  const apply = async () => {
    if (!generation) return
    try {
      const r = await window.ruleMgr.generate.apply(repoRoot, generation, {
        apply: true,
        rebuildBundle: opts.rebuildBundle,
        registerBuiltin: opts.registerBuiltin,
        git: opts.gitCommit ? { commit: true, push: opts.gitPush, message: `feat: ${mallName} 쇼핑몰 규칙 추가 및 rules.json 갱신` } : null
      })
      for (const a of r.applied) await window.ruleMgr.shadowResolve(a.ruleId, 'approve')
      const errs = r.errors && r.errors.length ? ` — 오류: ${r.errors.join('; ')}` : ''
      setMsg(`적용 완료: 규칙 ${r.applied.length}건${r.bundle ? ` · rules.json v${r.bundle.version}` : ''}${r.git ? ' · Git 커밋됨' : ''}${errs} · Shadow 기록: 승인(approve)`)
      onSaved && onSaved()
    } catch (e) {
      setMsg('적용 실패: ' + String(e.message || e).split('\n')[0])
    }
  }

  const recordDecision = async (decision) => {
    if (!generation) return
    const ids = generation.results.filter(r => r.rule).map(r => r.rule.id)
    for (const id of ids) await window.ruleMgr.shadowResolve(id, decision)
    setMsg(`Shadow 판정 기록 완료: ${ids.join(', ')} → ${decision}`)
  }

  const installExtension = async () => {
    try {
      const r = await window.ruleMgr.extensionInstall()
      alert('확장 프로그램 폴더를 열었습니다.\n\n' + r.guide)
    } catch (e) {
      setMsg('확장 설치 준비 실패: ' + String(e.message || e))
    }
  }

  return (
    <section style={{ border: '2px solid #DDD9FC', borderRadius: 10, padding: 14, marginBottom: 14 }}>
      <h2 style={{ fontSize: 15, margin: '0 0 8px' }}>🤖 새 규칙 만들기 — AI 자동 생성 (§7.6)</h2>

      <div style={{ fontSize: 12, display: 'grid', gridTemplateColumns: '110px 1fr', rowGap: 6, alignItems: 'center' }}>
        <label>쇼핑몰 이름</label>
        <input value={mallName} onChange={e => setMallName(e.target.value)} placeholder="예: 무신사 (확장 전송·폴더 불러오기 시 자동)" style={inp} />
        <label>기본 ID</label>
        <input value={baseId} onChange={e => setBaseId(e.target.value)} placeholder={effBaseId || '쇼핑몰 이름에서 자동'} style={inp} />
        <label>생성 대상</label>
        <span style={{ display: 'flex', gap: 14 }}>
          {['order', 'cart'].map(k => (
            <label key={k}>
              <input type="checkbox" checked={kinds[k]} onChange={e => setKinds({ ...kinds, [k]: e.target.checked })} /> {KIND_LABEL[k]} → <code>{ruleIdFor(effBaseId, k)}</code>
            </label>
          ))}
        </span>
      </div>

      <div style={{ marginTop: 10, fontSize: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={importFolder} style={btnSm}>📂 캡처 폴더 불러오기</button>
          <button onClick={installExtension} style={btnSm}>🧩 확장 프로그램 설치</button>
          <button onClick={loadInbox} style={btnSm}>📥 확장 수신함 새로고침</button>
          <span style={{ fontSize: 11, color: '#64748b' }}>
            {folderDir ? folderDir.split(/[\\/]/).pop() : '폴더 지정 시 장바구니·주문서·무료/유료·정답을 자동 분류 (파일명/폴더명: 장바구니·주문서·무료·유료/발생)'}
          </span>
        </div>
        {inbox && inbox.captures.length > 0 && (
          <p style={{ fontSize: 11, color: '#1a7f37', margin: '6px 0' }}>
            📥 확장 수신함 {inbox.captures.length}건 자동 사용 중 ({inbox.captures.map(c => `${KIND_LABEL[c.kind] || c.kind}/${SHIP_LABEL[c.shipTag] || c.shipTag}`).join(', ')})
          </p>
        )}
        {scanSummary && (
          <p style={{ fontSize: 11, color: '#4c3de6', margin: '6px 0' }}>
            불러옴: 주문서 {scanSummary.order.free + scanSummary.order.paid + scanSummary.order.unknown}건
            (무료 {scanSummary.order.free}/발생 {scanSummary.order.paid}) ·
            장바구니 {scanSummary.cart.free + scanSummary.cart.paid + scanSummary.cart.unknown}건
            (무료 {scanSummary.cart.free}/발생 {scanSummary.cart.paid}) · 정답 {scanSummary.answers}개
            {scanSummary.merged ? ` · html/mhtml 중복 ${scanSummary.merged}쌍 병합` : ''}
            {mallName ? ` · 쇼핑몰 이름 자동 입력: ${mallName}` : ''}
          </p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
          {SLOT_KEYS.map(key => {
            const [kind, ship] = key.split('.')
            const arr = slots[key]
            return (
              <div key={key} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}>
                <b>{KIND_LABEL[kind]} · {SHIP_LABEL[ship]}</b>
                <span style={{ color: '#94a3b8', fontSize: 11 }}> {arr.length}건</span>
                <div style={{ marginTop: 4 }}>
                  <button onClick={() => addSlotFiles(key)} style={btnSm}>＋ 파일 추가</button>
                </div>
                {arr.length > 0 && (
                  <ul style={{ margin: '4px 0 0', paddingLeft: 14, fontSize: 10, color: '#475569' }}>
                    {arr.map(e => <li key={e.path}>{e.path.split(/[\\/]/).pop()}</li>)}
                  </ul>
                )}
              </div>
            )
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
          {['free', 'paid'].map(ship => (
            <div key={ship} style={{ border: '1px dashed #c7d2fe', borderRadius: 8, padding: 8 }}>
              <b>{SHIP_LABEL[ship]} 정답 Excel</b>
              <div style={{ marginTop: 4 }}>
                <button onClick={() => pickAnswer(ship)} style={btnSm}>파일 선택</button>
              </div>
              <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{answers[ship] ? answers[ship].split(/[\\/]/).pop() : '없음 — 태그된 캡처의 폴더 정답 사용'}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 8 }}>
          <label>정답 기준 화면 </label>
          <select value={answerBasis} onChange={e => setAnswerBasis(e.target.value)} style={inpSm}>
            <option value="order">주문서</option>
            <option value="cart">장바구니</option>
            <option value="common">공통/알 수 없음 (0건만 판정)</option>
          </select>
          <span style={{ fontSize: 10, color: '#94a3b8' }}> — 무료/유료 정답 2개를 각각 넣으면 자동으로 캡처별 대조됩니다</span>
        </div>

        <div style={{ marginTop: 8 }}>
          <label>모델 </label>
          <select value={model} onChange={e => setModel(e.target.value)} style={inpSm}>
            <option value="">기본 (GLM-5.3)</option>
            {bridge && bridge.codingPlanModels && bridge.codingPlanModels.map(m => (
              <option key={m.id} value={m.id}>{m.model}</option>
            ))}
          </select>
          {' · '}자가 수정 최대 <input type="number" min="0" max="3" value={maxRepair} onChange={e => setMaxRepair(Math.max(0, Math.min(3, Number(e.target.value) || 0)))} style={{ width: 40 }} />회
          <span style={{ fontSize: 10, color: '#94a3b8' }}> — 빠른 생성은 flash 모델 권장 (후보 3개 동시 생성)</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={run} disabled={running || !mallName} style={{ ...btnPrimary, opacity: running || !mallName ? 0.5 : 1 }}>
          {running ? '생성 중… (GLM 후보 3개 → 검증 → Jev 판정)' : '▶ 생성 실행'}
        </button>
        {generation && <button onClick={apply} style={btnPrimary}>📥 프로젝트에 적용</button>}
      </div>

      {progress.length > 0 && (
        <pre ref={logRef} style={{ fontSize: 10, background: '#0f172a', color: '#e2e8f0', padding: 8, borderRadius: 6, maxHeight: 140, overflow: 'auto', marginTop: 8 }}>
          {progress.map((p, i) => `[${p.kind || '-'}] ${p.message}`).join('\n')}
        </pre>
      )}

      {msg && <p style={{ fontSize: 12, color: msg.startsWith('생성 실패') || msg.includes('일치하지 않아') ? '#dc2626' : '#4c3de6', marginTop: 6, whiteSpace: 'pre-wrap' }}>{msg}</p>}

      {generation && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, fontSize: 11, color: '#64748b' }}>
          <span>관리자 판정 기록(§19 Shadow):</span>
          <button onClick={() => recordDecision('approve')} style={btnSm}>승인(approve)</button>
          <button onClick={() => recordDecision('repair')} style={btnSm}>수정 필요(repair)</button>
          <button onClick={() => recordDecision('reject')} style={btnSm}>폐기(reject)</button>
        </div>
      )}

      {generation && generation.results && generation.results.map(r => (
        <div key={r.kind} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, marginTop: 8, fontSize: 12 }}>
          <b>{KIND_LABEL[r.kind] || r.kind} ({r.ruleId})</b> — 상태:{' '}
          <b style={{ color: r.status === 'approved' ? '#1a7f37' : r.status === 'repaired' ? '#b45309' : '#dc2626' }}>{r.status}</b>
          {r.decision && <> · 판정: {r.decision.action} ({r.decision.reason})</>}
          {r.deterministic && (
            <div style={{ color: '#64748b', marginTop: 4 }}>
              추출 {r.deterministic.itemCount}건{r.deterministic.itemCountExpected != null ? ` / 정답 ${r.deterministic.itemCountExpected}건` : ''}
              {' · '}합계 {Number(r.deterministic.subtotal || 0).toLocaleString('ko-KR')}원{r.deterministic.subtotalExpected != null ? ` / 정답 ${Number(r.deterministic.subtotalExpected).toLocaleString('ko-KR')}원` : ''}
              {r.deterministic.checkedOnlyValid === false && ' · checkedOnly 오류'}
            </div>
          )}
          {r.deterministic && Array.isArray(r.deterministic.perSample) && r.deterministic.perSample.length > 0 && (
            <div style={{ color: r.deterministic.perSample.every(p => p.countOk && p.totalOk) ? '#1a7f37' : '#dc2626', marginTop: 2, fontSize: 11 }}>
              캡처별 대조: {r.deterministic.perSample.map(p =>
                `${p.label} ${p.count}/${p.expectedCount}건 ${p.countOk && p.totalOk ? '✓' : '✗'}`
              ).join(' · ')}
            </div>
          )}
          {r.rule && genDiffs[r.rule.id] && (
            <details style={{ marginTop: 4 }}>
              <summary style={{ cursor: 'pointer', color: '#b45309' }}>기존 규칙 대비 변경 diff</summary>
              <DiffView before={genDiffs[r.rule.id].before} after={genDiffs[r.rule.id].after} />
            </details>
          )}
          {r.rule && !genDiffs[r.rule.id] && genDiffs[r.rule.id] !== undefined && (
            <p style={{ fontSize: 11, color: '#1a7f37', margin: '4px 0 0' }}>신규 규칙 — 기존 파일 없음</p>
          )}
          {r.rule && (
            <details style={{ marginTop: 4 }}>
              <summary style={{ cursor: 'pointer' }}>규칙 JSON</summary>
              <pre style={{ fontSize: 10, background: '#f8fafc', padding: 8, borderRadius: 6, overflow: 'auto', maxHeight: 200 }}>{JSON.stringify(r.rule, null, 2)}</pre>
            </details>
          )}
        </div>
      ))}
      <p style={{ fontSize: 11, color: '#94a3b8', margin: '8px 0 0' }}>
        안전 기본값: 생성 결과는 로컬 검증 + Jev 판정 통과분만 승인됩니다. 무료/유료 정답 2개를 넣으면 캡처별로 자동 대조되며, 화면 총액과 정답이 다르면 AI 실행 전에 차단됩니다.
      </p>
    </section>
  )
}

const inp = { border: '1px solid #e2e8f0', borderRadius: 4, padding: '2px 6px', fontSize: 12 }
const inpSm = { border: '1px solid #e2e8f0', borderRadius: 4, padding: '2px 4px', fontSize: 11 }
const btnSm = { padding: '2px 8px', fontSize: 11, cursor: 'pointer', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff' }
const btnPrimary = { padding: '6px 14px', cursor: 'pointer', border: 'none', borderRadius: 6, background: '#5B4DFB', color: '#fff', fontWeight: 700 }
