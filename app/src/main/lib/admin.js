// 관리자 모듈 (ADMIN.md) — 신규 쇼핑몰 규칙 Gemini 자동 생성 원클릭
// ① 샘플(장바구니/주문서 각 최대 2파일) + 정답 엑셀 → 화면 종류별 프롬프트 조립
// ② 주문서 규칙(입력 id)과 장바구니 규칙(id + '-cart')을 각각/동시 생성
// ③ 소스 rules(app/src/main/lib/rules/) + 사용자 rules(userData) + analysis 사본 동시 저장
// ④ rules.json 재생성(make-rules-json.js와 동일 로직 인라인 — 패키지 exe에 node 없어도 동작)
// ⑤ git add/commit/push + 구축된 몰 목록 조회/삭제(삭제분 rules.json 반영)
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { verifyRuleSamples } from './admin-verify.js'
import {
  SAMPLE_CHAR_LIMIT, MAX_FILES_PER_KIND, ADMIN_GENERATED_MARKER, ORDER, EXAMPLE_RULE_IDS,
  rulesSourceDir, rulesAnalysisDir, deriveId, sampleHtmlText, answerSummary,
  buildPromptText, buildRepairPromptText
} from './admin-text.js'

export { deriveId, sampleHtmlText, answerSummary }

const execFileAsync = promisify(execFile)

const REPAIR_MAX_ATTEMPTS = 3
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

// 503(과부하)·429(쿼터)·5xx·네트워크 오류에 대한 재시도 간격(지수 백오프)과 대체 모델 사슬
const RETRY_DELAYS_MS = [2000, 4000, 8000]
const MODEL_FALLBACKS = ['gemini-2.5-flash', 'gemini-2.0-flash']

export function resolveRepoRoot() {
  const starts = []
  if (process.env.PORTABLE_EXECUTABLE_DIR) starts.push(process.env.PORTABLE_EXECUTABLE_DIR)
  starts.push(path.resolve(app.getAppPath(), '..'))
  starts.push(app.getAppPath())
  for (const start of starts) {
    let dir = path.resolve(start)
    for (let i = 0; i < 5 && dir; i++) {
      if (fs.existsSync(path.join(dir, 'rules.json')) && fs.existsSync(path.join(dir, '.git'))) return dir
      const up = path.dirname(dir)
      if (up === dir) break
      dir = up
    }
  }
  return null
}

function userRulesDir() {
  return path.join(app.getPath('userData'), 'rules')
}

// 파일명에서 쇼핑몰 id 파생 (영문 소문자+숫자+하이픈). 끝의 -cart는 베이스 id로 보고 벗긴다 —
// 주문서 id = 입력값, 장바구니 id = 주문서 id + '-cart' 규칙을 항상 성립시키기 위함

// 프롬프트 빌더 — 본문은 admin-text.js(순수 모듈). 저장소 기준은 현재 앱 위치에서 탐지한다.
export function buildPrompt({ mallName, kind, ruleId, samples, answer }) {
  return buildPromptText({ mallName, kind, ruleId, samples, answer, repoRoot: resolveRepoRoot() })
}

// 자가 수정용 프롬프트 — 기존 프롬프트 구성에 '이전 규칙 + 실제 추출 결과 + 문제'를 추가하고
// 수정된 규칙 JSON만 다시 받는다. (판정은 admin-verify.js의 verifyRuleSamples가 담당)
export function buildRepairPrompt({ mallName, kind, ruleId, samples, answer, rule, verification }) {
  return buildRepairPromptText({ mallName, kind, ruleId, samples, answer, rule, verification, repoRoot: resolveRepoRoot() })
}

export async function callGemini({ apiKey, model, prompt, log }) {  const chain = [model, ...MODEL_FALLBACKS.filter(m => m !== model && !model.startsWith(m))]
  let lastErr = null
  for (let mi = 0; mi < chain.length; mi++) {
    const m = chain[mi]
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        return await geminiOnce({ apiKey, model: m, prompt })
      } catch (e) {
        lastErr = e
        if (!e.retryable) throw e
        if (attempt < RETRY_DELAYS_MS.length) {
          const wait = RETRY_DELAYS_MS[attempt]
          if (log) log(`  ⚠ ${m} 호출 실패(${e.status || '네트워크'}) — ${wait / 1000}초 후 재시도합니다 (${attempt + 1}/${RETRY_DELAYS_MS.length})`, 'err')
          await new Promise(r => setTimeout(r, wait))
        }
      }
    }
    if (mi < chain.length - 1 && log) log(`  ⚠ ${m} 재시도 ${RETRY_DELAYS_MS.length}회 모두 실패 — 대체 모델 ${chain[mi + 1]}(으)로 자동 전환합니다`, 'err')
  }
  const err = new Error('현재 구글 서버 트래픽이 많으니 잠시 후 다시 시도하거나 모델을 변경해주세요')
  err.traffic = true
  err.detail = lastErr ? lastErr.message : ''
  throw err
}

async function geminiOnce({ apiKey, model, prompt }) {
  let res
  try {
    res = await fetch(`${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: Object.assign(
          { temperature: 0.2, responseMimeType: 'application/json', maxOutputTokens: 16384 },
          /2\.5/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}
        )
      }),
      signal: AbortSignal.timeout(180000)
    })
  } catch (e) {
    const err = new Error(`네트워크 오류: ${String(e.message || e)}`)
    err.retryable = true
    throw err
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const err = new Error(`Gemini API 오류 ${res.status}: ${String(body).slice(0, 200)}`)
    err.status = res.status
    err.retryable = isRetryableStatus(res.status)
    throw err
  }
  const data = await res.json()
  const cand = data.candidates && data.candidates[0]
  const text = cand && cand.content && Array.isArray(cand.content.parts)
    ? cand.content.parts.map(p => p.text || '').join('')
    : ''
  if (!text) {
    const reason = data.promptFeedback && data.promptFeedback.blockReason ? ` (차단 사유: ${data.promptFeedback.blockReason})` : ''
    throw new Error(`Gemini 응답이 비어 있습니다${reason}`)
  }
  return text
}

function validateRule(r) {
  const errs = []
  if (!r || typeof r !== 'object' || Array.isArray(r)) errs.push('JSON이 객체가 아님')
  if (!errs.length) {
    if (!r.id || !/^[a-z0-9][a-z0-9-]*$/i.test(String(r.id))) errs.push('id가 영문 식별자 형식이 아님')
    if (!r.name) errs.push('name 없음')
    if (!Array.isArray(r.match) || !r.match.length) errs.push('match 배열 없음')
    if (!r.rowSelector && r.orientation !== 'column') errs.push('rowSelector 없음')
    const f = r.fields || {}
    if (!f.name || !f.name.sel) errs.push('fields.name.sel 없음')
    if (!f.price || (!f.price.sel && !f.price.regex)) errs.push('fields.price 없음')
  }
  if (errs.length) throw new Error('생성된 규칙 형식 문제 — ' + errs.join(', '))
}

export function extractRuleJson(text) {
  let s = String(text || '').trim()
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  const a = s.indexOf('{')
  const b = s.lastIndexOf('}')
  if (a === -1 || b <= a) throw new Error('Gemini 응답에서 JSON을 찾지 못했습니다')
  const rule = JSON.parse(s.slice(a, b + 1))
  validateRule(rule)
  return rule
}

// make-rules-json.js와 동일한 순서 로직. 삭제된 몰(ORDER에 있으나 파일 없음)은 건너뛴다.
export function buildRulesList(repoRoot) {
  const dir = rulesSourceDir(repoRoot)
  const byId = {}
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json') || f === 'meta.json') continue
    const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'))
    if (!r.id) continue
    byId[r.id] = r
  }
  const missing = ORDER.filter(id => !byId[id])
  if (missing.length) console.log('[rules] ORDER 중 파일 없음(삭제됨 — rules.json 제외): ' + missing.join(','))
  const extra = Object.keys(byId).filter(id => !ORDER.includes(id))
  const present = ORDER.filter(id => byId[id])
  return { list: present.map(id => byId[id]).concat(extra.map(id => byId[id])), extra, missing }
}

// rules.json 문서 조립 — {version, generatedAt, count, rules} 형식(구 배열 형식은 읽기에서 하위호환)
function bumpPatch(v) {
  const m = String(v || '').trim().match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!m) return '1.0.0'
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`
}

export function buildRulesJsonDoc(repoRoot, { bump = false } = {}) {
  const { list, extra, missing } = buildRulesList(repoRoot)
  const outPath = path.join(repoRoot, 'rules.json')
  let prev = null
  try { prev = JSON.parse(fs.readFileSync(outPath, 'utf-8')) } catch {}
  const prevVersion = prev && !Array.isArray(prev) ? prev.version : null
  const prevGeneratedAt = prev && !Array.isArray(prev) ? prev.generatedAt : null
  return {
    version: bump ? bumpPatch(prevVersion || '1.0.0') : (prevVersion || '1.0.0'),
    generatedAt: bump ? new Date().toISOString() : (prevGeneratedAt || new Date().toISOString()),
    count: list.length,
    rules: list,
    extra,
    missing
  }
}

export function rebuildRulesJson(repoRoot, { bump = false } = {}) {
  const doc = buildRulesJsonDoc(repoRoot, { bump })
  const out = path.join(repoRoot, 'rules.json')
  fs.writeFileSync(out, JSON.stringify({ version: doc.version, generatedAt: doc.generatedAt, count: doc.count, rules: doc.rules }, null, 2), 'utf-8')
  const metaPath = path.join(rulesSourceDir(repoRoot), 'meta.json')
  const prevMeta = (() => { try { return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) } catch { return {} } })()
  const metaVersion = bump ? doc.version : (prevMeta.version || doc.version)
  const metaGenerated = bump ? doc.generatedAt : (prevMeta.generatedAt || doc.generatedAt)
  fs.writeFileSync(metaPath, JSON.stringify({ version: metaVersion, generatedAt: metaGenerated }, null, 2) + '\n', 'utf-8')
  return { out, count: doc.count, version: metaVersion, generatedAt: metaGenerated, extra: doc.extra, missing: doc.missing }
}

// 저장소 루트 rules.json의 버전 메타 — 설정 화면 표시용
export function readRulesVersion() {
  const repoRoot = resolveRepoRoot()
  if (!repoRoot) return null
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(repoRoot, 'rules.json'), 'utf-8'))
    if (Array.isArray(parsed)) return { version: null, generatedAt: null, count: parsed.length, legacy: true }
    return { version: parsed.version || null, generatedAt: parsed.generatedAt || null, count: Array.isArray(parsed.rules) ? parsed.rules.length : null, legacy: false }
  } catch {
    return null
  }
}

async function gitDeploy({ repoRoot, files, message, log }) {
  const opts = { cwd: repoRoot, windowsHide: true }
  await execFileAsync('git', ['add', '--', ...files], opts)
  log(`$ git add ${files.join(' ')}`)
  try {
    const { stdout } = await execFileAsync('git', ['commit', '-m', message], opts)
    log(`$ git commit → ${String(stdout || '').trim().split('\n')[0]}`)
  } catch (e) {
    const errText = String((e && e.stderr) || e.stdout || e.message || '')
    if (/nothing to commit/.test(errText)) {
      log('커밋할 변경사항이 없습니다 — 커밋 생략')
      return
    }
    throw new Error('git commit 실패: ' + errText.slice(0, 400))
  }
  try {
    await execFileAsync('git', ['push'], opts)
    log('$ git push 완료 — GitHub 규칙 업데이트 서버에 반영됩니다')
  } catch (e) {
    const errText = String((e && e.stderr) || e.stdout || e.message || '')
    if (/Everything up-to-date/.test(errText)) {
      log('원격이 이미 최신입니다')
      return
    }
    throw new Error('git push 실패: ' + errText.slice(0, 400))
  }
}

function writeRuleCopies({ repoRoot, rule, log }) {
  const srcDir = rulesSourceDir(repoRoot)
  fs.mkdirSync(srcDir, { recursive: true })
  const srcFile = path.join(srcDir, `${rule.id}.json`)
  fs.writeFileSync(srcFile, JSON.stringify(rule, null, 2), 'utf-8')
  log(`  소스 규칙: ${srcFile}`)

  fs.mkdirSync(userRulesDir(), { recursive: true })
  const userFile = path.join(userRulesDir(), `${rule.id}.json`)
  fs.writeFileSync(userFile, JSON.stringify({ ...rule, notes: rule.notes + ' (실행 중 앱에 즉시 적용되는 사본)' }, null, 2), 'utf-8')
  log(`  사용자 규칙 사본: ${userFile} — 규칙 관리에서 바로 보입니다`)

  const analysisDir = rulesAnalysisDir(repoRoot)
  if (fs.existsSync(analysisDir)) {
    const analysisFile = path.join(analysisDir, `${rule.id}.json`)
    fs.writeFileSync(analysisFile, JSON.stringify(rule, null, 2), 'utf-8')
    log(`  analysis 사본: ${analysisFile}`)
  }
  return srcFile
}

function isRetryableStatus(s) {
  return s === 429 || s === 500 || s === 503 || s === 504
}

function readRuleIfExists(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) } catch { return null }
}

// ADMIN.md 원클릭 플로우 전체 실행. 주문서/장바구니를 각각(또는 동시) 생성한다.
export async function runAdminFlow(payload, log) {
  const apiKey = String(payload.apiKey || '').trim()
  const model = String(payload.model || 'gemini-3.1-flash-lite').trim()
  const mallName = String(payload.mallName || '').trim()
  const { answerFile, doGit } = payload
  const orderFiles = (Array.isArray(payload.orderFiles) ? payload.orderFiles : payload.orderFile ? [payload.orderFile] : []).slice(0, MAX_FILES_PER_KIND)
  const cartFiles = (Array.isArray(payload.cartFiles) ? payload.cartFiles : payload.cartFile ? [payload.cartFile] : []).slice(0, MAX_FILES_PER_KIND)
  if (!apiKey) throw new Error('Gemini API Key를 입력해 주세요')
  if (!mallName) throw new Error('쇼핑몰 이름을 입력해 주세요')
  if (!answerFile) throw new Error('정답 엑셀 파일을 선택해 주세요')
  if (!orderFiles.length && !cartFiles.length) throw new Error('장바구니 또는 주문서 샘플 파일 중 최소 1개를 선택해 주세요')

  const repoRoot = resolveRepoRoot()
  if (!repoRoot) throw new Error('저장소 루트를 찾지 못했습니다 (rules.json + .git 보유 폴더 필요)')
  log(`저장소 루트: ${repoRoot}`)

  const baseId = deriveId(String(payload.baseId || payload.ruleId || '').trim() || mallName)
  const tasks = []
  if (orderFiles.length) tasks.push({ kind: 'order', id: baseId, files: orderFiles })
  if (cartFiles.length) tasks.push({ kind: 'cart', id: `${baseId}-cart`, files: cartFiles })

  const srcDir = rulesSourceDir(repoRoot)
  const userDir = userRulesDir()
  for (const t of tasks) {
    const srcPath = path.join(srcDir, `${t.id}.json`)
    const userPath = path.join(userDir, `${t.id}.json`)
    const existing = fs.existsSync(srcPath)
      ? readRuleIfExists(srcPath)
      : fs.existsSync(userPath) ? readRuleIfExists(userPath) : null
    if (existing) {
      // 이전 실행 실패 후 재시도 시 같은 id로 막히지 않게 — 관리자 도구가 만든 규칙은 덮어쓴다
      if (String(existing.notes || '').includes(ADMIN_GENERATED_MARKER)) {
        t.overwrite = true
      } else {
        const at = [fs.existsSync(srcPath) ? srcPath : null, fs.existsSync(userPath) ? userPath : null].filter(Boolean).join('\n  ')
        throw new Error(`규칙 id "${t.id}"가 이미 있습니다 — 다른 식별자를 입력하거나 다음 파일을 삭제해 주세요:\n  ${at}`)
      }
    }
  }

  // Step 1 — 샘플/정답 파싱
  log('[1/4] 샘플 파일 읽는 중...', 'step')
  for (const t of tasks) {
    t.samples = t.files.map(f => {
      const s = sampleHtmlText(f)
      log(`  ${t.kind === 'cart' ? '장바구니' : '주문서'} 샘플: ${path.basename(f)} (${s.html.length.toLocaleString()}자)`)
      return { label: t.kind === 'cart' ? '장바구니 화면' : '주문서 화면', html: s.html, location: s.location }
    })
  }
  const answer = answerSummary(answerFile)
  log(`  정답 엑셀: ${path.basename(answerFile)} — ${answer.mode === 'parsed' ? `품목 ${answer.items.length}건 파싱` : '헤더 미탐지, 원본 행 전달'}`)

  // Step 2 — 규칙별 Gemini 생성 + 자가 검증·수정 루프(v1.49.9)
  // 생성 직후 샘플로 추출을 검증하고, 실패하면 '이전 규칙 + 실제 추출 결과 + 문제'를
  // Gemini에 다시 보내 수정된 규칙을 받는다(REPAIR_MAX_ATTEMPTS회).
  const ruleFiles = []
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i]
    const kindLabel = t.kind === 'cart' ? '장바구니' : '주문서'
    log(`[2/4] Gemini(${model}) ${kindLabel} 규칙 생성 중... (${i + 1}/${tasks.length})`, 'step')
    if (t.overwrite) log(`  기존 자동생성 규칙 "${t.id}"을(를) 덮어써서 다시 생성합니다`)
    const prompt = buildPrompt({ mallName, kind: t.kind, ruleId: t.id, samples: t.samples, answer })
    const rule = extractRuleJson(await callGemini({ apiKey, model, prompt, log }))
    rule.id = t.id
    rule.name = t.kind === 'cart' ? `${mallName} 장바구니` : mallName
    rule.notes = `관리자 도구 자동 생성 (Gemini ${model}, ${new Date().toISOString().slice(0, 10)})`
    if (t.kind === 'cart' && !rule.checkedOnly) log(`  ⚠ ${t.id} 규칙에 checkedOnly가 없습니다 — V체크 없이 전체 추출될 수 있습니다`, 'err')

    // 자가 검증·수정 루프 — 주문서에서 0건 추출 같은 실패를 Gemini에 피드백해 스스로 고치게 한다
    const expectAnswer = tasks.length === 1
    let verification = verifyRuleSamples(rule, t.samples, answer, expectAnswer)
    let repaired = 0
    for (let attempt = 1; attempt <= REPAIR_MAX_ATTEMPTS && !verification.ok; attempt++) {
      log(`  ⚠ 검증 실패 — ${verification.summary}`, 'err')
      verification.problems.forEach(p => log(`  · ${p}`, 'err'))
      log(`  Gemini에 실패 결과를 피드백해 수정 요청합니다 (${attempt}/${REPAIR_MAX_ATTEMPTS})`, 'step')
      const repairPrompt = buildRepairPrompt({ mallName, kind: t.kind, ruleId: t.id, samples: t.samples, answer, rule, verification })
      rule = extractRuleJson(await callGemini({ apiKey, model, prompt: repairPrompt, log }))
      rule.id = t.id
      rule.name = t.kind === 'cart' ? `${mallName} 장바구니` : mallName
      rule.notes = `관리자 도구 자동 생성 (Gemini ${model}, ${new Date().toISOString().slice(0, 10)})`
      verification = verifyRuleSamples(rule, t.samples, answer, expectAnswer)
      repaired = attempt
    }
    log(verification.ok
      ? `  ${kindLabel} 규칙 생성 완료: ${rule.id} / match=${JSON.stringify(rule.match)}${repaired ? ` (자가 수정 ${repaired}회 성공)` : ''} — 검증: ${verification.summary}`
      : `  ⚠ ${kindLabel} 규칙: 자가 수정 ${REPAIR_MAX_ATTEMPTS}회 후에도 불일치 — 현재 규칙을 저장합니다 (${verification.summary}). 실제 캡처에서 재추출해 확인하세요`, verification.ok ? 'ok' : 'err')
    t.verification = verification
    ruleFiles.push(writeRuleCopies({ repoRoot, rule, log }))
  }

  // Step 3 — rules.json 재생성 (Git 배포 시 버전 patch 증가)
  log('[3/4] rules.json 재생성...', 'step')
  const built = rebuildRulesJson(repoRoot, { bump: !!doGit })
  log(`  rules.json 재생성: 규칙 ${built.count}건 · 버전 v${built.version}${built.extra.length ? ` (ORDER 외 추가: ${built.extra.join(',')})` : ''}`)

  // Step 4 — Git 커밋/푸시
  let pushed = false
  if (doGit) {
    log('[4/4] Git 커밋/푸시...', 'step')
    await gitDeploy({
      repoRoot,
      files: [...ruleFiles.map(f => path.relative(repoRoot, f)), 'rules.json'],
      message: `feat: ${mallName} 쇼핑몰 규칙 추가 및 rules.json 갱신`,
      log
    })
    pushed = true
  } else {
    log('[4/4] Git 자동 커밋/푸시 건너뜀 (사용자 해제)', 'step')
  }

  return {
    ruleIds: tasks.map(t => t.id),
    ruleFiles,
    rulesJson: built.out,
    pushed,
    verifications: tasks.map(t => ({ id: t.id, ok: t.verification && t.verification.ok, summary: t.verification && t.verification.summary }))
  }
}

// 구축된 쇼핑몰 목록 (소스 rules 기준 — builtin 순서, extra는 뒤에 가나순)
export function listMalls() {
  const repoRoot = resolveRepoRoot()
  if (!repoRoot) throw new Error('저장소 루트를 찾지 못했습니다')
  const dir = rulesSourceDir(repoRoot)
  const items = []
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json') || f === 'meta.json') continue
    try {
      const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'))
      if (!r.id) continue
      items.push({ id: r.id, name: r.name || r.id, inOrder: ORDER.includes(r.id) })
    } catch {}
  }
  items.sort((a, b) => {
    const ia = ORDER.indexOf(a.id); const ib = ORDER.indexOf(b.id)
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return a.id.localeCompare(b.id)
  })
  return items
}

// 몰 삭제 — 소스·analysis·사용자 사본을 지우고 rules.json을 다시 만든다 (삭제분 반영)
export async function deleteMall(payload, log) {
  const id = String(payload.id || '').trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error('잘못된 규칙 id입니다')
  const repoRoot = resolveRepoRoot()
  if (!repoRoot) throw new Error('저장소 루트를 찾지 못했습니다')
  const srcFile = path.join(rulesSourceDir(repoRoot), `${id}.json`)
  if (!fs.existsSync(srcFile)) throw new Error(`소스 규칙 파일이 없습니다: ${id}.json`)

  log(`규칙 삭제: ${id}`)
  const removedRel = []
  fs.unlinkSync(srcFile)
  removedRel.push(path.relative(repoRoot, srcFile))
  log(`  삭제: ${srcFile}`)
  const analysisFile = path.join(rulesAnalysisDir(repoRoot), `${id}.json`)
  if (fs.existsSync(analysisFile)) {
    fs.unlinkSync(analysisFile)
    removedRel.push(path.relative(repoRoot, analysisFile))
    log(`  삭제: ${analysisFile}`)
  }
  const userFile = path.join(userRulesDir(), `${id}.json`)
  if (fs.existsSync(userFile)) {
    fs.unlinkSync(userFile)
    log(`  삭제: ${userFile}`)
  }

  const built = rebuildRulesJson(repoRoot, { bump: !!payload.doGit })
  log(`  rules.json 재반영: 규칙 ${built.count}건 · 버전 v${built.version} (삭제된 몰 제외)`)

  if (payload.doGit) {
    await gitDeploy({
      repoRoot,
      files: [...removedRel, 'rules.json'],
      message: `chore: ${id} 쇼핑몰 규칙 삭제 및 rules.json 갱신`,
      log
    })
  } else {
    log('Git 자동 커밋/푸시 건너뜀 (사용자 해제)')
  }
  return { id, removed: removedRel, rulesJson: built.out }
}

// E2E 자가검증 — 저장소 탐지 + 규칙 목록 조립 + rules.json 동기화 여부
export function adminSelfTest() {
  const repoRoot = resolveRepoRoot()
  if (!repoRoot) return { ok: false, err: 'repo root not found' }
  const doc = buildRulesJsonDoc(repoRoot, { bump: false })
  const onDisk = fs.readFileSync(path.join(repoRoot, 'rules.json'), 'utf-8')
  const onDiskDoc = (() => { try { return JSON.parse(onDisk) } catch { return null } })()
  return {
    ok: true,
    repoRoot: path.basename(repoRoot),
    rules: doc.count,
    version: onDiskDoc && !Array.isArray(onDiskDoc) ? onDiskDoc.version : null,
    rulesJsonSynced: onDisk.replace(/\r\n/g, '\n') === JSON.stringify({ version: doc.version, generatedAt: doc.generatedAt, count: doc.count, rules: doc.rules }, null, 2)
  }
}

// AI 생성 규칙 중 rules.js builtin 배열에 없는 것을 자동 등록한다(관리자 모달 [builtin 등록] 버튼).
// import는 meta.json import 앞에, 배열 항목은 배열 끝에 추가하고 -cart 규칙이 베이스
// 규칙보다 먼저 오도록 긴 id 순으로 정렬한다(도메인 매칭 우선순위 유지).
export function registerBuiltinRules() {
  const repoRoot = resolveRepoRoot()
  if (!repoRoot) return { ok: false, error: '저장소 루트를 찾지 못했습니다 (rules.json + .git 보유 폴더 필요)' }
  const srcDir = rulesSourceDir(repoRoot)
  const rulesJsPath = path.join(repoRoot, 'app', 'src', 'main', 'lib', 'rules.js')
  if (!fs.existsSync(rulesJsPath)) return { ok: false, error: 'rules.js를 찾지 못했습니다: ' + rulesJsPath }
  const src = fs.readFileSync(rulesJsPath, 'utf-8')
  const importedFiles = new Set()
  for (const m of src.matchAll(/import\s+\w+\s+from\s+'\.\/rules\/([^']+)'/g)) importedFiles.add(m[1])
  const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.json') && f !== 'meta.json')
  const missing = files
    .filter(f => !importedFiles.has(f))
    .map(f => {
      let id = f.replace(/\.json$/, '')
      try { id = JSON.parse(fs.readFileSync(path.join(srcDir, f), 'utf-8')).id || id } catch {}
      return { file: f, id }
    })
  if (!missing.length) return { ok: true, added: [], message: '미등록 규칙이 없습니다 — 모든 규칙이 builtin에 등록되어 있습니다' }
  const toVar = (id) => {
    const v = String(id).replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase()).replace(/[^A-Za-z0-9]/g, '')
    return /^[A-Za-z]/.test(v) ? v : 'r' + v
  }
  missing.sort((a, b) => b.id.length - a.id.length)
  const varByFile = new Map()
  for (const m of missing) {
    const v = toVar(m.id)
    if (new RegExp('\\b' + v + '\\b').test(src)) return { ok: false, error: '변수 이름 충돌: ' + v + ' (' + m.id + ') — rules.js에서 수동 등록해 주세요' }
    varByFile.set(m.file, v)
  }
  const importLines = missing.map(m => 'import ' + varByFile.get(m.file) + ' from \'./rules/' + m.file + '\'').join('\n')
  const entries = missing.map(m => varByFile.get(m.file)).join(', ')
  let next = src
  const metaImport = "import meta from './rules/meta.json'"
  if (!next.includes(metaImport)) return { ok: false, error: 'rules.js에서 meta.json import를 찾지 못했습니다' }
  next = next.replace(metaImport, importLines + '\n' + metaImport)
  next = next.replace(/const builtin = \[([\s\S]*?)\n\]/, (m, inner) => 'const builtin = [' + inner.replace(/\s+$/, '') + ',\n  ' + entries + '\n]')
  fs.writeFileSync(rulesJsPath, next, 'utf-8')
  return { ok: true, added: missing.map(m => m.id) }
}
