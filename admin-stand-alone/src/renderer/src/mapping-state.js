/*
 * 클릭 매핑 상태 (§12) — React 밖 싱글턴으로 관리해 iframe 메시지와
 * E2E(window.__mgr)가 UI 렌더 타이밍 없이 동일 계약으로 동작하게 한다.
 */
const STEPS = ['row', 'name', 'qty', 'price', 'shipping', 'checked', 'optionRow', 'meta']
const STEP_LABEL = {
  row: '① 상품 행', name: '② 상품명', qty: '③ 수량', price: '④ 단가',
  shipping: '⑤ 배송비', checked: '⑥ 체크박스', optionRow: '⑦ 옵션 행', meta: '⑧ 확인·저장'
}
const STEP_MODE = { row: 'row', name: 'name', qty: 'qty', price: 'price', shipping: 'shipping', checked: 'checked', optionRow: 'optionrow', meta: 'row' }

const state = {
  token: null,
  url: '',
  location: '',
  title: '',
  step: 'row',
  mode: 'row',
  picks: {},
  fieldSamples: {},
  pickerReady: false,
  meta: { baseId: '', name: '', match: '', isCart: false, ruleId: '', priceIs: 'lineTotal' },
  preview: null,
  assembled: null,
  error: ''
}

const listeners = new Set()
let emitCount = 0
let everSubscribed = false
// 모듈 복제 여부·emit 순서 추적 — 구독 레이스 진단용(§10-A 디버깅)
export const instanceId = Math.random().toString(36).slice(2, 8)
const debugLog = []
function dlog(event, detail = '') {
  debugLog.push({ t: Date.now(), event, detail: String(detail).slice(0, 60) })
  if (debugLog.length > 40) debugLog.shift()
}
dlog('module-init', instanceId)
const emit = () => { emitCount++; dlog('emit', `listeners=${listeners.size}`); for (const l of [...listeners]) l() }

export function subscribe(listener) {
  listeners.add(listener)
  everSubscribed = true
  console.info('[mapping-debug] subscribe called — listeners:', listeners.size, 'instanceId:', instanceId)
  return () => { listeners.delete(listener); console.info('[mapping-debug] unsubscribed — listeners:', listeners.size) }
}

export function getState() {
  return state
}

// useSyncExternalStore용 스냅샷 — 불리언(참조 안정)으로 React 재렌더 루프 방지
export function getMappingActiveSnapshot() {
  return !!state.token
}

export function stepLabel(step) {
  return STEP_LABEL[step] || step
}

export function steps() {
  return state.meta.isCart ? STEPS : STEPS.filter(s => s !== 'checked')
}

let frameEl = null

export function registerFrame(el) {
  frameEl = el
  if (el) sendMode()
}

function sendMode() {
  if (frameEl && frameEl.isConnected && frameEl.contentWindow) {
    frameEl.contentWindow.postMessage(
      { type: 'picker-mode', mode: state.mode, rowSelector: state.picks.row && state.picks.row.selector }, '*'
    )
    state.lastPostedMode = state.mode
    state.lastPostedAt = Date.now()
  } else {
    state.lastPostedMode = null
  }
}

export function startMapping(opened, meta = {}) {
  state.token = opened.token
  state.url = `admin-sample://${opened.token}/?picker=1`
  state.location = opened.location || ''
  state.title = opened.title || ''
  state.step = 'row'
  state.mode = 'row'
  state.picks = {}
  state.fieldSamples = {}
  state.pickerReady = false
  state.preview = null
  state.assembled = null
  state.error = ''
  state.meta = { baseId: '', name: '', match: '', isCart: false, ruleId: '', priceIs: 'lineTotal', ...meta }
  emit()
}

export function closeMapping() {
  if (state.token) window.ruleMgr.mapping.close(state.token)
  state.token = null
  state.url = ''
  frameEl = null
  emit()
}

export function setStep(step) {
  if (!steps().includes(step)) return
  state.step = step
  state.error = ''
  setMode(STEP_MODE[step] || 'row', false)
  emit()
}

export function setMode(mode, syncStep = true) {
  state.mode = mode
  if (syncStep) {
    const byMode = Object.entries(STEP_MODE).find(([, m]) => m === mode)
    if (byMode && steps().includes(byMode[0])) state.step = byMode[0]
  }
  sendMode()
  emit()
}

function handlePick(payload) {
  const kind = payload && payload.kind
  if (!kind) return
  if (kind === 'row' || kind === 'optionrow' || kind === 'checked') {
    const key = kind === 'optionrow' ? 'optionRow' : kind === 'checked' ? 'checkedOnly' : 'row'
    state.picks[key] = payload
  } else {
    if (!state.fieldSamples[kind]) state.fieldSamples[kind] = []
    state.fieldSamples[kind].push({ selector: payload.selector, sampleText: payload.sampleText })
    state.picks[kind] = payload
  }
  // 현재 단계가 기다리던 종류의 피킹만 위자드 진행으로 이어진다 — 늦게 도착한
  // 이전 단계 피킹이 사용자가 방금 고른 모드를 덮어쓰지 않는다.
  const expected = STEP_MODE[state.step]
  if (kind === expected) {
    const next = STEPS[STEPS.indexOf(state.step) + 1]
    if (next && steps().includes(next)) {
      state.step = next
      state.mode = STEP_MODE[next] || 'row'
      sendMode()
    }
  }
  emit()
}

export async function assemble(metaOverride = {}) {
  const meta = { ...state.meta, ...metaOverride }
  state.meta = meta
  state.error = ''
  const res = await window.ruleMgr.mapping.assemble({
    picks: state.picks,
    fieldSamples: state.fieldSamples,
    meta
  })
  state.assembled = res
  if (res && res.error) state.error = res.error
  emit()
  return res
}

export async function runPreview(rule) {
  const res = await window.ruleMgr.mapping.preview({ token: state.token, rule })
  state.preview = res
  if (res && res.error) state.error = res.error
  emit()
  return res
}

window.addEventListener('message', (e) => {
  const d = e.data
  if (!d || typeof d !== 'object') return
  if (d.type === 'picker-ready') {
    state.pickerReady = true
    emit()
  } else if (d.type === 'picker-select') {
    handlePick(d.payload)
  }
})

window.__mgr = {
  startMapping: (token, meta) => startMapping({ token }, meta),
  setMode: m => setMode(m),
  setStep: s => setStep(s),
  state: () => JSON.parse(JSON.stringify({
    token: state.token, step: state.step, mode: state.mode,
    picks: state.picks, pickerReady: state.pickerReady, meta: state.meta, emitCount, listeners: listeners.size, everSubscribed, instanceId, debugLog: debugLog.slice(-12),
    lastPostedMode: state.lastPostedMode, hasFrame: !!(frameEl && frameEl.contentWindow)
  })),
  assemble: meta => assemble(meta),
  preview: rule => runPreview(rule)
}
