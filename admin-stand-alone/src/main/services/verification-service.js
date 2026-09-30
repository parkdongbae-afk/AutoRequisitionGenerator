/*
 * 검증 센터 (ADMIN_SATAD_ALONE.MD §7.7)
 * 규칙 전체에 대해 JSON·스키마·ID 중복·파일명 불일치·장바구니 checkedOnly·match 중복·
 * bundle 동기화·ORDER 우선순위를 검사하고 심각도(ERROR/WARNING/INFO/PASS)별로 반환한다.
 * 파일 읽기만 하는 순수 모듈이라 node 단위 테스트 가능하다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { checkSchema } from './rule-verifier.js'

export const SEVERITIES = ['ERROR', 'WARNING', 'INFO', 'PASS']

const isCartRule = r => /-cart$/.test(String(r.id || ''))

export function verifyProject(repoRoot, { checkedOnlyExcuses = [] } = {}) {
  const results = []
  const add = (severity, code, message, ruleId = null) => results.push({ severity, code, message, ruleId })

  const rulesDir = path.join(repoRoot, 'app', 'src', 'main', 'lib', 'rules')
  if (!fs.existsSync(rulesDir)) {
    add('ERROR', 'PROJECT_STRUCTURE_INVALID', `소스 규칙 폴더가 없습니다: ${rulesDir}`)
    return { results, summary: summarize(results) }
  }

  // §7.7 규칙별 검사 — JSON 문법·스키마·ID·파일명·checkedOnly
  const byId = new Map()
  const matchOwners = new Map()
  for (const f of fs.readdirSync(rulesDir).sort()) {
    if (!f.endsWith('.json') || f === 'meta.json') continue
    const file = path.join(rulesDir, f)
    let raw
    try {
      raw = fs.readFileSync(file, 'utf-8')
    } catch (e) {
      add('ERROR', 'RULE_UNREADABLE', `${f} 읽기 실패 — ${String(e.message || e)}`)
      continue
    }
    let rule
    try {
      rule = JSON.parse(raw)
    } catch (e) {
      add('ERROR', 'RULE_JSON_INVALID', `${f}: JSON 문법 오류 — ${String(e.message || e).slice(0, 100)}`)
      continue
    }
    const id = rule.id
    if (!id) {
      add('ERROR', 'RULE_ID_MISSING', `${f}: id 없음`)
      continue
    }
    if (byId.has(id)) add('ERROR', 'RULE_ID_DUPLICATE', `ID 중복: ${id} (${byId.get(id)}과 ${f})`, id)
    byId.set(id, f)

    if (f !== 'meta.json' && `${id}.json` !== f) {
      add('WARNING', 'RULE_FILENAME_MISMATCH', `파일명과 id 불일치: ${f} (id=${id})`, id)
    }
    const { schemaValid, errors } = checkSchema(rule)
    // never_match 셀렉터는 의도된 no-op 스텁(예: URL 선점 차단용) — 스키마 오류가 아니라 INFO로 보고한다
    const isNoopStub = /never_match/.test(String(rule.rowSelector || ''))
    if (isNoopStub) {
      add('INFO', 'RULE_NOOP_STUB', `${f}: no-op 스텁 규칙(never_match) — 추출 규칙 아님`, id)
    } else if (!schemaValid) {
      for (const err of errors) add('ERROR', 'RULE_SCHEMA_INVALID', `${f}: ${err}`, id)
    } else {
      add('PASS', 'RULE_SCHEMA_OK', `${f}: 스키마 정상`, id)
    }
    if (isCartRule(rule) && !rule.checkedOnly && !isNoopStub) {
      const excused = checkedOnlyExcuses.includes(id)
      add(excused ? 'WARNING' : 'ERROR', 'CART_CHECKEDONLY_MISSING',
        `${f}: 장바구니 규칙 checkedOnly 없음${excused ? ' — §9.6 예외 등록됨(사유 문서화)' : '(§9.6)'}`, id)
    }
    if (!isCartRule(rule) && rule.checkedOnly) {
      add('INFO', 'ORDER_CHECKEDONLY_PRESENT', `${f}: 주문서 규칙에 checkedOnly 지정됨 — 의도 확인`, id)
    }
    for (const m of Array.isArray(rule.match) ? rule.match : []) {
      if (matchOwners.has(m)) {
        add('WARNING', 'RULE_MATCH_DUPLICATE', `match 중복: "${m}" — ${matchOwners.get(m)}과 ${id}`, id)
      } else {
        matchOwners.set(m, id)
      }
    }
  }

  // §15.4 bundle 동기화
  let bundle = null
  try {
    bundle = JSON.parse(fs.readFileSync(path.join(repoRoot, 'rules.json'), 'utf-8'))
  } catch (e) {
    add('ERROR', 'BUNDLE_UNREADABLE', `rules.json 읽기 실패 — ${String(e.message || e)}`)
  }
  if (bundle) {
    const bundleIds = (bundle.rules || []).map(r => r.id)
    const sourceIds = [...byId.keys()]
    if (bundle.count !== bundleIds.length) {
      add('ERROR', 'BUNDLE_COUNT_INVALID', `rules.json count(${bundle.count}) != rules 배열(${bundleIds.length})`)
    } else {
      add('PASS', 'BUNDLE_COUNT_OK', `rules.json count 일치 (${bundle.count}건)`)
    }
    const onlySource = sourceIds.filter(id => !bundleIds.includes(id))
    const onlyBundle = bundleIds.filter(id => !sourceIds.includes(id))
    if (onlySource.length) add('ERROR', 'BUNDLE_MISSING_RULES', `bundle에 없는 소스 규칙: ${onlySource.join(', ')}`)
    if (onlyBundle.length) add('ERROR', 'BUNDLE_EXTRA_RULES', `소스에 없는 bundle 규칙: ${onlyBundle.join(', ')}`)
    if (!onlySource.length && !onlyBundle.length && bundleIds.length) {
      add('PASS', 'BUNDLE_IDS_OK', `bundle 규칙 목록 일치 (${bundleIds.length}건)`)
    }
    if (bundle.version && !/^\d+\.\d+\.\d+$/.test(bundle.version)) {
      add('ERROR', 'BUNDLE_VERSION_INVALID', `버전 형식 오류: ${bundle.version}`)
    }
    // §15.2 -cart 우선순위 — bundle 배열에서 cart가 base보다 뒤면 경고
    const pos = new Map(bundleIds.map((id, i) => [id, i]))
    for (const id of bundleIds) {
      if (isCartRule({ id })) {
        const base = id.replace(/-cart$/, '')
        if (pos.has(base) && pos.get(id) > pos.get(base)) {
          add('WARNING', 'CART_ORDER_AFTER_BASE', `${id}이(가) ${base}보다 뒤에 있음 — 특화 규칙 우선 필요(§15.2)`, id)
        }
      }
    }
  }

  return { results, summary: summarize(results) }
}

function summarize(results) {
  const s = { ERROR: 0, WARNING: 0, INFO: 0, PASS: 0 }
  for (const r of results) s[r.severity] = (s[r.severity] || 0) + 1
  s.ok = s.ERROR === 0
  return s
}
