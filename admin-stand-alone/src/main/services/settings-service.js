/*
 * 설정 서비스 (ADMIN_SATAD_ALONE.MD §21, JEV.MD §2.3·§19·§20.1)
 * - TYPESAFE_API_KEY는 Electron safeStorage로 암호화해 저장한다(평문 저장 금지).
 * - safeStorage를 못 쓰는 환경에서는 저장을 거부하고 환경변수 사용을 안내한다.
 * - 순수 함수(통계·임계값 게이트)는 node 단위 테스트 가능하다.
 */
import fs from 'node:fs'
import path from 'node:path'

export const SETTINGS_FILE = 'settings.json'

export const DEFAULT_SETTINGS = {
  schemaVersion: 1,
  recentProjects: [],
  lastProject: '',
  jev: {
    // Shadow Mode는 §19에 따라 초기 고정 — 데이터 50건+ 일치율 확인 전 해제 불가
    shadowMode: true,
    autoApproveEnabled: false,
    minShadowRecords: 50,
    minAgreement: 0.8,
    timeoutMs: 60000
  },
  verify: {
    // §9.6 — 장바구니 checkedOnly 예외 몰(사유가 규칙 notes로 문서화된 것만 등록)
    checkedOnlyExcuses: ['naver-cart']
  },
  ui: {
    // §7.1/§28 — 글자 크기 배율(설정 탭에서 조절, 1 = 기본 100%)
    fontScale: 1.2
  },
  generation: {
    model: '',
    allowFallback: true,
    maxRepairAttempts: 3,
    apply: {
      // §7.6 안전한 기본값
      saveDraft: true,
      applyProject: true,
      rebuildBundle: true,
      syncUserRules: false,
      registerBuiltin: false,
      gitCommit: false,
      gitPush: false
    }
  },
  privacy: {
    maskEmail: true,
    maskPhone: true,
    maskAddress: true,
    maskName: true,
    maskOrderId: true
  }
}

function settingsPath(userDataDir) {
  return path.join(userDataDir, SETTINGS_FILE)
}

function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return base
  const out = Array.isArray(base) ? [...base] : { ...base }
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k], v)
    } else if (v !== undefined) {
      out[k] = v
    }
  }
  return out
}

export function loadSettings(userDataDir) {
  let stored = {}
  try {
    stored = JSON.parse(fs.readFileSync(settingsPath(userDataDir), 'utf-8'))
  } catch {
    stored = {}
  }
  return deepMerge(DEFAULT_SETTINGS, stored)
}

export function saveSettings(userDataDir, partial) {
  const next = deepMerge(loadSettings(userDataDir), partial || {})
  fs.mkdirSync(userDataDir, { recursive: true })
  fs.writeFileSync(settingsPath(userDataDir), JSON.stringify(next, null, 2) + '\n', 'utf-8')
  return next
}

/*
 * TYPESAFE_API_KEY 저장(JEV.MD §2.3) — encryptFn은 Electron safeStorage
 * encryptString → base64 결과를 주입받는다. encryptFn이 없으면 저장하지 않고
 * 실패를 반환한다(평문 폴백 금지).
 */
export function storeTypesafeKey(userDataDir, plainKey, { encryptFn } = {}) {
  const key = String(plainKey || '').trim()
  if (!key) throw new Error('빈 API Key는 저장할 수 없습니다')
  if (typeof encryptFn !== 'function') {
    return { ok: false, code: 'JEV_KEY_STORE_UNAVAILABLE', message: 'safeStorage를 사용할 수 없어 Key를 저장하지 않았습니다. 환경변수 TYPESAFE_API_KEY를 사용하세요.' }
  }
  const encrypted = Buffer.from(encryptFn(key), 'binary').toString('base64')
  saveSettings(userDataDir, { jevKey: { encrypted, scheme: 'safeStorage.v1' } })
  return { ok: true }
}

export function loadTypesafeKey(userDataDir, { decryptFn } = {}) {
  let rec = null
  try {
    rec = loadSettings(userDataDir).jevKey
  } catch {
    rec = null
  }
  if (!rec || !rec.encrypted || typeof decryptFn !== 'function') return null
  try {
    const buf = decryptFn(Buffer.from(rec.encrypted, 'base64'))
    const s = String(buf || '')
    return s || null
  } catch {
    return null
  }
}

export function clearTypesafeKey(userDataDir) {
  const s = loadSettings(userDataDir)
  delete s.jevKey
  fs.mkdirSync(userDataDir, { recursive: true })
  fs.writeFileSync(settingsPath(userDataDir), JSON.stringify(s, null, 2) + '\n', 'utf-8')
}

/*
 * Shadow Mode 통계 (§19.2) — 관리자 판정과 Jev 판정의 일치율을 낸다.
 * localDecision은 로컬 검증 결과(pass/fail), jevDecision은 approve/repair/reject/human_review.
 */
export function shadowStats(records) {
  // E2E 스모크가 남긴 기록은 통계 오염이므로 제외한다(notes에 e2e 태그)
  const all = (Array.isArray(records) ? records : [])
    .filter(r => r && !/e2e/i.test(String(r.notes || '')))
  const judged = all.filter(r => r.jevDecision)
  const withAdmin = judged.filter(r => r.adminDecision && r.adminDecision !== '')
  const agreed = withAdmin.filter(r => decisionAgrees(r)).length
  return {
    records: all.length,
    judged: judged.length,
    compared: withAdmin.length,
    agreed,
    agreement: withAdmin.length ? agreed / withAdmin.length : 0
  }
}

function decisionAgrees(r) {
  // 로컬 실패는 어떤 Jev 판정과도 "배포 보류"로 합의된 것으로 본다(§13 로컬 게이트 우선)
  if (r.localDecision === 'fail') return r.jevDecision !== 'approve' || r.adminDecision !== 'approve'
  const j = r.jevDecision
  const a = r.adminDecision
  if (j === a) return true
  // human_review는 보류 계열끼리는 합의로 인정하지 않는다(보수적 평가)
  return false
}

/*
 * 자동 승인 허용 게이트 (§19.2·§18) — Shadow 데이터가 충분하고 일치율이
 * 임계값 이상일 때만 사용자가 자동 승인을 켤 수 있다. 기본은 항상 금지.
 */
export function autoApproveAllowed(settings, stats) {
  const jev = (settings && settings.jev) || {}
  if (!jev.autoApproveEnabled) return { allowed: false, reason: '자동 승인이 설정에서 꺼져 있습니다' }
  if (jev.shadowMode) return { allowed: false, reason: 'Shadow Mode 사용 중 — 판정을 기록만 합니다' }
  const min = Number(jev.minShadowRecords) || 50
  const minAgree = Number(jev.minAgreement) || 0.8
  if (!stats || stats.compared < min) {
    return { allowed: false, reason: `Shadow 비교 데이터 부족 (${(stats && stats.compared) || 0}/${min}건)` }
  }
  if (stats.agreement < minAgree) {
    return { allowed: false, reason: `관리자 판정 일치율 부족 (${Math.round(stats.agreement * 100)}% < ${Math.round(minAgree * 100)}%)` }
  }
  return { allowed: true, reason: '자동 승인 조건 충족' }
}
