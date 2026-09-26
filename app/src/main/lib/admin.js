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
import { parseMhtml, decodeHtml, smartDecode } from './mhtml.js'
import { loadExcelFull } from './excel.js'

const execFileAsync = promisify(execFile)

const SAMPLE_CHAR_LIMIT = 160000
const MAX_FILES_PER_KIND = 2
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

// 503(과부하)·429(쿼터)·5xx·네트워크 오류에 대한 재시도 간격(지수 백오프)과 대체 모델 사슬
const RETRY_DELAYS_MS = [2000, 4000, 8000]
const MODEL_FALLBACKS = ['gemini-2.5-flash', 'gemini-2.0-flash']

const ADMIN_GENERATED_MARKER = '관리자 도구 자동 생성'

// make-rules-json.js의 builtin 우선순위 배열과 동일 — 신규 몰은 extra로 맨 뒤에 붙는다
const ORDER = [
  'gmarket-cart', 'kyobo-cart', 'aladin-order', 'aladin',
  'gmarket', 'kyobo', 'naver', 'naver-cart',
  'dreamdepot-order', 'dreamdepot', 'icecream-cart', 'icecreammall',
  'alphamall-cart', 'alphamall', 'st11-cart', '11st',
  'yes24-cart', 'yes24', 'teachermall-cart', 'teachermall',
  'auction-cart', 'auction', 'coupang',
  'emartmall-cart', 'emartmall',
  'eleparts', 'ic114', 'lottemart', 'officedepot-order', 'officedepot',
  'daisomall-order', 'daisomall'
]

// 프롬프트 few-shot 예시 — 화면 종류별로 성격이 맞는 규칙을 싣는다
const EXAMPLE_RULE_IDS = {
  order: ['gmarket', 'emartmall', 'dreamdepot-order'],
  cart: ['gmarket-cart', 'naver-cart', 'coupang']
}

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

function rulesSourceDir(repoRoot) {
  return path.join(repoRoot, 'app', 'src', 'main', 'lib', 'rules')
}

function rulesAnalysisDir(repoRoot) {
  return path.join(repoRoot, 'app', 'analysis', 'rules')
}

function userRulesDir() {
  return path.join(app.getPath('userData'), 'rules')
}

// 파일명에서 쇼핑몰 id 파생 (영문 소문자+숫자+하이픈). 끝의 -cart는 베이스 id로 보고 벗긴다 —
// 주문서 id = 입력값, 장바구니 id = 주문서 id + '-cart' 규칙을 항상 성립시키기 위함
export function deriveId(name) {
  const s = String(name || '').toLowerCase().replace(/-cart$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return s || `mall-${Date.now()}`
}

function compressHtml(html) {
  let s = String(html || '')
  s = s
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
  s = s.replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ')
  return s.slice(0, SAMPLE_CHAR_LIMIT)
}

// 캡처 파일 → HTML 텍스트 (MHTML이면 루트 text/html 파트를 디코딩)
export function sampleHtmlText(filePath) {
  const buf = fs.readFileSync(filePath)
  const head = buf.subarray(0, 400).toString('latin1')
  let html
  let location = ''
  if (/\.mhtml?$/i.test(filePath) || head.includes('MIME-Version')) {
    const parsed = parseMhtml(buf)
    html = decodeHtml(parsed.rootHtml)
    location = parsed.rootHtml.location || ''
  } else {
    html = smartDecode(buf, null)
  }
  return { html: compressHtml(html), location }
}

function hostnameOf(location) {
  try { return new URL(location).hostname.replace(/^www\./, '') } catch { return '' }
}

// 정답 엑셀 → 품목 JSON (헤더 자동 탐지 실패 시 첫 시트 raw 행)
export function answerSummary(filePath) {
  const res = loadExcelFull(filePath)
  if (res.picked && res.picked.items && res.picked.items.length) {
    return {
      mode: 'parsed',
      sheet: res.picked.sheetName,
      headerRow: res.picked.headerRow + 1,
      items: res.picked.items
    }
  }
  const first = res.sheets && res.sheets[0]
  return { mode: 'raw', sheet: first ? first.name : '', rows: first ? first.rows.slice(0, 60) : [] }
}

function ruleSchemaDoc() {
  return [
    '규칙 JSON 스키마 (필수 키: id, name, match, rowSelector 또는 orientation, fields):',
    '{',
    '  "id": "영문소문자-하이픈 식별자",',
    '  "name": "쇼핑몰 한글 이름",',
    '  "match": ["URL에 포함되는 도메인/경로 substring (예: musinsa.com)"],',
    '  "rowSelector": "품목 1개(반복 행)를 가리키는 CSS 선택자. 여러 상품에 공통 적용되도록 :nth-of-type/:nth-child 서수를 쓰지 말 것.',
    '      장바구니에서 V체크(체크박스)된 상품만 추출하려면 :has(input[체크박스선택자]) 로 행을 좁히고 checkedOnly를 지정",',
    '  "priceIs": "lineTotal",   // 화면 표시 금액이 단가가 아니라 (단가×수량) 합계일 때만 지정 → 단가=금액÷수량 환산',
    '  "fields": {',
    '    "name":  { "sel": "상품명 선택자", "attr": "기본 text", "regex": "정규식(옵션)", "group": 1, "match": "last|first" },',
    '    "qty":   { "sel": "수량 선택자", "attr": "input이면 value", "regex": "(\\\\d+)" },',
    '    "price": { "sel": "금액 선택자", "regex": "([\\\\d,]+)", "match": "last" },',
    '    "option":{ "sel": "옵션 선택자" }   // 선택 — 규격(spec) 자동 생성에 사용',
    '  },',
    '  "shipping": {  // 배송비 — 상황별 모드',
    '    "mode": "selector",  "sel": "배송비 요소 선택자", "regex": "([\\\\d,]+)", "first": true,',
    '    // 또는 { "mode": "row", "sel": "행선택자", "rowMatch": "배송비" }',
    '    // 또는 { "mode": "conditional", "sel": "...", "regex": "...", "freeOver": 50000 }',
    '    // 또는 { "mode": "perItem", "sel": "각 행 안 배송비 선택자" }',
    '    // 또는 { "mode": "none" }',
    '  },',
    '  "checkedOnly": { "sel": "행 안 체크박스 선택자", "legacySel": "Vue 등 체크 클래스(예: label.is-checked)" },',
    '  "verifyCount": { "sel": "페이지가 알려주는 총 상품수 선택자", "regex": "(\\\\d+)" },   // 선택 — 부분저장 감지',
    '  "specFromOption": true,   // 선택 — 옵션 원문 전체를 규격으로 사용',
    '  "units": { "sel": "행 안 복수 옵션 라인 선택자" }   // 선택 — 한 카드에 옵션 라인이 여러 개일 때',
    '}',
    '',
    '규칙 작성 원칙:',
    '- 화면에 합계만 보이면 priceIs:"lineTotal"로 단가를 환산한다. 금액 요소에 원가/할인가가 섞여 있으면 match:"last"로 실제 금액을 고른다.',
    '- 수량이 input value 속성이면 attr:"value"를 쓴다.',
    '- 규칙 id는 다음 내장 규칙 id들과 중복되지 않게 한다: ' + ORDER.join(', ')
  ].join('\n')
}

const KIND_GUIDE = {
  order: [
    '## 생성 대상: 주문서(주문/결제) 규칙',
    '- 주문서는 모든 상품이 화면에 표시되므로 checkedOnly는 지정하지 않습니다.',
    '- 배송비는 결제 요약 패널에서 찾아 shipping.mode:"selector"로 지정합니다(정말 없으면 "none").',
    '- 캡처의 모든 주문 상품이 빠짐없이 추출되어야 합니다.'
  ],
  cart: [
    '## 생성 대상: 장바구니 규칙',
    '- 사용자가 V체크(체크박스)한 상품만 추출해야 합니다: rowSelector를 체크박스가 포함된 상품 행(:has(...))으로 좁히고 checkedOnly {sel, legacySel}을 반드시 지정하세요. 캡처에는 체크 상태가 data-arge-checked 속성으로 박제되어 있습니다.',
    '- 판매자/배송유형 그룹마다 배송비가 표시되면 shipping.mode:"perFee"(그룹별 별도 행), 하단에 총 배송비만 있으면 "selector"를 쓰세요.',
    '- 페이지가 총 상품수를 알려주는 요소가 있으면 verifyCount를 추가하세요.'
  ]
}

function buildPrompt({ mallName, kind, ruleId, samples, answer }) {
  const repoRoot = resolveRepoRoot()
  const examples = []
  if (repoRoot) {
    for (const id of EXAMPLE_RULE_IDS[kind]) {
      const p = path.join(rulesSourceDir(repoRoot), `${id}.json`)
      try { examples.push(`// 예시 규칙: ${id}\n` + fs.readFileSync(p, 'utf-8')) } catch {}
    }
  }
  const sampleBlocks = samples.map((s, i) => {
    const host = hostnameOf(s.location) || ''
    return [
      `### 입력 샘플 ${i + 1}: ${s.label}${host ? ` (URL 힌트: ${s.location || host})` : ''}`,
      '```html',
      s.html,
      '```'
    ].join('\n')
  })
  const answerBlock = answer.mode === 'parsed'
    ? `정답 엑셀(시트 "${answer.sheet}", 헤더 ${answer.headerRow}행)에서 파싱한 품목:\n${JSON.stringify(answer.items, null, 1)}`
    : `정답 엑셀(시트 "${answer.sheet}") 원본 행(앞 60행):\n${JSON.stringify(answer.rows, null, 1)}`
  return [
    `당신은 쇼핑몰 캡처 화면에서 품목(상품명·규격·수량·단가·배송비)을 CSS 선택자로 추출하는 파싱 규칙 전문가입니다.`,
    `"${mallName}" 쇼핑몰의 캡처 HTML(같은 화면의 HTML·MHTML 최대 ${MAX_FILES_PER_KIND}개)과 정답 데이터를 분석해, 아래 스키마에 맞는 규칙 JSON 한 개를 만들어 주세요.`,
    '',
    ruleSchemaDoc(),
    '',
    KIND_GUIDE[kind],
    '',
    examples.length ? '## 기존 규칙 예시 (같은 형식으로 작성)\n' + examples.join('\n\n') : '',
    '',
    '## 입력 데이터',
    sampleBlocks.join('\n\n'),
    '',
    answerBlock,
    '',
    '## 지시사항',
    `- 규칙 id는 "${ruleId}", name은 "${mallName}"으로 고정합니다.`,
    `- 여러 샘플이 주어지면 모든 샘플에서 공통으로 동작하는 선택자를 고르세요(샘플마다 DOM이 조금 달라도 같은 행을 잡아야 합니다).`,
    `- 샘플 HTML의 DOM 구조를 실제로 추적해 선택자를 고르세요. 정답 엑셀의 품목 수·이름·수량·금액·배송비와 정확히 일치해야 합니다.`,
    `- 정답의 단가와 화면 금액이 다르면(합계 표시) priceIs:"lineTotal" 여부를 판단하세요.`,
    `- match 배열에는 샘플 URL 힌트의 도메인을 넣으세요. 힌트가 없으면 HTML 안의 canonical/og:url/링크에서 도메인을 추론하세요.`,
    `- 응답에는 설명 없이 규칙 JSON 객체만 담습니다.`
  ].filter(Boolean).join('\n')
}

export async function callGemini({ apiKey, model, prompt, log }) {
  const chain = [model, ...MODEL_FALLBACKS.filter(m => m !== model && !model.startsWith(m))]
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

  // Step 2 — 규칙별 Gemini 생성
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
    log(`  ${kindLabel} 규칙 생성 완료: ${rule.id} / match=${JSON.stringify(rule.match)}`)
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

  return { ruleIds: tasks.map(t => t.id), ruleFiles, rulesJson: built.out, pushed }
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
    rulesJsonSynced: onDisk === JSON.stringify({ version: doc.version, generatedAt: doc.generatedAt, count: doc.count, rules: doc.rules }, null, 2)
  }
}
