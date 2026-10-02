import React, { useEffect, useRef, useState } from 'react'
import DiffView from './DiffView.jsx'
import { ruleIdFor, suggestBaseId } from '../../shared/rule-id.js'

const KIND_LABEL = { order: '주문서', cart: '장바구니' }

export default function GeneratePanel({ repoRoot, bridge, settings, onSaved }) {
  const [mallName, setMallName] = useState('')
  const [baseId, setBaseId] = useState('')
  const [kinds, setKinds] = useState({ order: true, cart: false })
  const [samples, setSamples] = useState({ order: [], cart: [] })
  const [answerExcel, setAnswerExcel] = useState('')
  const [answerBasis, setAnswerBasis] = useState('common')
  const [model, setModel] = useState(settings && settings.generation && settings.generation.model || '')
  const [maxRepair, setMaxRepair] = useState(3)
  const [opts, setOpts] = useState({
    apply: true, rebuildBundle: true, registerBuiltin: false, gitCommit: false, gitPush: false
  })
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState([])
  const [generation, setGeneration] = useState(null)
  const [genDiffs, setGenDiffs] = useState({})
  const [msg, setMsg] = useState('')
  const logRef = useRef(null)

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

  useEffect(() => {
    const off = window.ruleMgr.generate.onProgress(m => {
      setProgress(p => [...p.slice(-200), m])
    })
    return off
  }, [])
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [progress])

  const effBaseId = baseId || suggestBaseId(mallName)
  const selectedKinds = Object.entries(kinds).filter(([, v]) => v).map(([k]) => k)

  const pickSample = async (kind) => {
    const files = await window.ruleMgr.pickSamples()
    if (files && files.length) {
      setSamples(s => ({ ...s, [kind]: files.slice(0, 8).map(p => ({ path: p, answerPath: null, tag: '' })) }))
    }
  }
  const pickAnswer = async () => {
    const files = await window.ruleMgr.pickAnswer()
    if (files && files.length) setAnswerExcel(files[0])
  }

  const [folderDir, setFolderDir] = useState('')
  const [scanSummary, setScanSummary] = useState(null)
  const importFolder = async () => {
    const dir = await window.ruleMgr.pickDir()
    if (!dir) return
    setFolderDir(dir)
    try {
      const scan = await window.ruleMgr.generate.scanFolder(dir)
      setScanSummary(scan.summary)
      setSamples({
        order: scan.captures.filter(c => c.kind === 'order'),
        cart: scan.captures.filter(c => c.kind === 'cart')
      })
      // 스캔에 캡처가 있는 화면 종류는 생성 대상을 자동으로 켠다 — 한쪽 파일이 무시되지 않게
      setKinds(k => ({
        order: k.order || scan.captures.some(c => c.kind === 'order'),
        cart: k.cart || scan.captures.some(c => c.kind === 'cart')
      }))
      if (scan.answers.length) setAnswerExcel(scan.answers[0])
    } catch (e) {
      setMsg('폴더 불러오기 실패: ' + String(e.message || e))
    }
  }

  const payload = () => ({
    mallName,
    baseId: effBaseId,
    kinds: selectedKinds,
    samplesByKind: samples,
    answerExcel,
    answerBasis,
    model,
    maxRepair
  })

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
      setMsg('생성 실패: ' + String(e.message || e).split('\n')[0])
    }
    setRunning(false)
  }

  const apply = async () => {
    if (!generation) return
    try {
      const r = await window.ruleMgr.generate.apply(repoRoot, generation, {
        apply: true,
        rebuildBundle: opts.rebuildBundle,
        registerBuiltin: opts.registerBuiltin,
        git: opts.gitCommit ? { commit: true, push: opts.gitPush, message: `feat: ${mallName} 쇼핑몰 규칙 추가 및 rules.json 갱신` } : null
      })
      const errs = r.errors && r.errors.length ? ` — 오류: ${r.errors.join('; ')}` : ''
      setMsg(`적용 완료: 규칙 ${r.applied.length}건${r.bundle ? ` · rules.json v${r.bundle.version}` : ''}${r.git ? ' · Git 커밋됨' : ''}${errs}`)
      onSaved && onSaved()
    } catch (e) {
      setMsg('적용 실패: ' + String(e.message || e).split('\n')[0])
    }
  }

  return (
    <section style={{ border: '2px solid #DDD9FC', borderRadius: 10, padding: 14, marginBottom: 14 }}>
      <h2 style={{ fontSize: 15, margin: '0 0 8px' }}>🤖 새 규칙 만들기 — AI 자동 생성 (§7.6)</h2>

      <div style={{ fontSize: 12, display: 'grid', gridTemplateColumns: '110px 1fr', rowGap: 6, alignItems: 'center' }}>
        <label>쇼핑몰 이름</label>
        <input value={mallName} onChange={e => setMallName(e.target.value)} placeholder="예: 무신사" style={inp} />
        <label>기본 ID</label>
        <input value={baseId} onChange={e => setBaseId(e.target.value)} placeholder={effBaseId || '쇼핑몰 이름에서 자동'} style={inp} />
        <label>생성 대상</label>
        <span style={{ display: 'flex', gap: 14 }}>
          {['order', 'cart'].map(k => (
            <label key={k}>
              <input
                type="checkbox"
                checked={kinds[k]}
                onChange={e => setKinds({ ...kinds, [k]: e.target.checked })}
              /> {KIND_LABEL[k]} → <code>{ruleIdFor(effBaseId, k)}</code>
            </label>
          ))}
        </span>
        <label>캡처 폴더</label>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={importFolder} style={btnSm}>📂 폴더 불러오기</button>
          <span style={{ fontSize: 11, color: '#64748b' }}>
            {folderDir ? folderDir.split(/[\\/]/).pop() : '폴더 지정 시 장바구니·주문서·정답을 자동 분류 (파일명/폴더명: 장바구니·주문서, 무료·유료)'}
          </span>
        </span>
        {scanSummary && (
          <span style={{ fontSize: 11, color: '#4c3de6', gridColumn: '2' }}>
            불러옴: 주문서 {scanSummary.order.free + scanSummary.order.paid + scanSummary.order.unknown}건
            (무료 {scanSummary.order.free}/발생 {scanSummary.order.paid}) ·
            장바구니 {scanSummary.cart.free + scanSummary.cart.paid + scanSummary.cart.unknown}건
            (무료 {scanSummary.cart.free}/발생 {scanSummary.cart.paid}) · 정답 {scanSummary.answers}개
            {scanSummary.merged ? ` · html/mhtml 중복 ${scanSummary.merged}쌍 병합(mhtml 우선)` : ''}
            {scanSummary.truncated ? ' · 40개 초과 일부 생략' : ''}
            {' · '}<b>생성 대상이 자동 선택됨</b>
          </span>
        )}
        {selectedKinds.map(k => (
          <React.Fragment key={k}>
            <label>{KIND_LABEL[k]} 샘플</label>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button onClick={() => pickSample(k)} style={btnSm}>파일 직접 선택</button>
              <span style={{ fontSize: 11, color: '#64748b' }}>
                {samples[k].length ? samples[k].map(s => s.path.split(/[\\/]/).pop()).join(', ') : '없음'}
              </span>
            </span>
          </React.Fragment>
        ))}
        <label>정답 Excel</label>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={pickAnswer} style={btnSm}>파일 선택</button>
          <span style={{ fontSize: 11, color: '#64748b' }}>{answerExcel ? answerExcel.split(/[\\/]/).pop() : '없음'}</span>
          <select value={answerBasis} onChange={e => setAnswerBasis(e.target.value)} style={inpSm}>
            <option value="order">정답 기준: 주문서</option>
            <option value="cart">정답 기준: 장바구니</option>
            <option value="common">공통/알 수 없음 (0건만 판정)</option>
          </select>
        </span>
        <label>모델</label>
        <select value={model} onChange={e => setModel(e.target.value)} style={inpSm}>
          <option value="">기본 (브리지 기본 모델)</option>
          {bridge && bridge.codingPlanModels && bridge.codingPlanModels.map(m => (
            <option key={m.id} value={m.id}>{m.model}</option>
          ))}
        </select>
        <label>자가 수정</label>
        <span>
          최대 <input type="number" min="0" max="3" value={maxRepair} onChange={e => setMaxRepair(Math.max(0, Math.min(3, Number(e.target.value) || 0)))} style={{ width: 40 }} />회
          {' · '}
          <label><input type="checkbox" checked={opts.rebuildBundle} onChange={e => setOpts({ ...opts, rebuildBundle: e.target.checked })} /> rules.json 재생성</label>
          {' '}
          <label><input type="checkbox" checked={opts.registerBuiltin} onChange={e => setOpts({ ...opts, registerBuiltin: e.target.checked })} /> builtin 등록</label>
          {' '}
          <label><input type="checkbox" checked={opts.gitCommit} onChange={e => setOpts({ ...opts, gitCommit: e.target.checked })} /> Git 커밋</label>
          {' '}
          <label><input type="checkbox" checked={opts.gitPush} disabled={!opts.gitCommit} onChange={e => setOpts({ ...opts, gitPush: e.target.checked })} /> push</label>
        </span>
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

      {msg && <p style={{ fontSize: 12, color: '#4c3de6', marginTop: 6 }}>{msg}</p>}

      {generation && generation.results && generation.results.map(r => (
        <div key={r.kind} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, marginTop: 8, fontSize: 12 }}>
          <b>{KIND_LABEL[r.kind]} ({r.ruleId})</b> — 상태:{' '}
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
        안전 기본값: 생성 결과는 로컬 검증 + Jev 판정 통과분만 승인됩니다. Shadow Mode 사용 중에는 판정이 기록만 되고, Git push는 직접 선택해야 수행됩니다.
      </p>
    </section>
  )
}

const inp = { border: '1px solid #e2e8f0', borderRadius: 4, padding: '2px 6px', fontSize: 12 }
const inpSm = { border: '1px solid #e2e8f0', borderRadius: 4, padding: '2px 4px', fontSize: 11 }
const btnSm = { padding: '2px 8px', fontSize: 11, cursor: 'pointer', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff' }
const btnPrimary = { padding: '6px 14px', cursor: 'pointer', border: 'none', borderRadius: 6, background: '#5B4DFB', color: '#fff', fontWeight: 700 }
