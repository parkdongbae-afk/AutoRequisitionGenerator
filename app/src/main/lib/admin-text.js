// 관리자 텍스트·파싱 유틸 — Electron 의존 없는 순수 모듈(ADMIN_SATAD_ALONE.MD §4.1 권장안 B).
// admin.js가 같은 함수를 re-export하므로 기존 호출부 API는 변하지 않는다.
// repoRoot가 필요한 프롬프트 빌더는 인자로 받는다(관리자 앱이 선택한 저장소를 쓸 수 있게).
import fs from 'node:fs'
import path from 'node:path'
import { parseMhtml, decodeHtml, smartDecode } from './mhtml.js'
import { loadExcelFull } from './excel.js'

export const SAMPLE_CHAR_LIMIT = 160000
export const MAX_FILES_PER_KIND = 2
export const ADMIN_GENERATED_MARKER = '관리자 도구 자동 생성'

// make-rules-json.js의 builtin 우선순위 배열과 동일 — 신규 몰은 extra로 맨 뒤에 붙는다
export const ORDER = [
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
export const EXAMPLE_RULE_IDS = {
  order: ['gmarket', 'emartmall', 'dreamdepot-order'],
  cart: ['gmarket-cart', 'naver-cart', 'coupang']
}

export function rulesSourceDir(repoRoot) {
  return path.join(repoRoot, 'app', 'src', 'main', 'lib', 'rules')
}

export function rulesAnalysisDir(repoRoot) {
  return path.join(repoRoot, 'app', 'analysis', 'rules')
}

// 파일명에서 쇼핑몰 id 파생 (영문 소문자+숫자+하이픈). 끝의 -cart는 베이스 id로 보고 벗긴다 —
// 주문서 id = 입력값, 장바구니 id = 주문서 id + '-cart' 규칙을 항상 성립시키기 위함
export function deriveId(name) {
  const s = String(name || '').toLowerCase().replace(/-cart$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return s || `mall-${Date.now()}`
}

export function compressHtml(html) {
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

export function hostnameOf(location) {
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
    '  "match": ["URL에 포함되는 도메인/경로 substring (예: example-mall.com)"],',
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

export function buildPromptText({ mallName, kind, ruleId, samples, answer, repoRoot }) {
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

// 자가 수정용 프롬프트 — 기존 프롬프트 구성에 '이전 규칙 + 실제 추출 결과 + 문제'를 추가하고
// 수정된 규칙 JSON만 다시 받는다. (판정은 admin-verify.js의 verifyRuleSamples가 담당)
export function buildRepairPromptText({ mallName, kind, ruleId, samples, answer, rule, verification, repoRoot }) {
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
    `당신은 쇼핑몰 캡처 화면에서 품목을 CSS 선택자로 추출하는 파싱 규칙 전문가입니다.`,
    `아래 규칙으로 "${mallName}" 캡처를 추출했는데 정답과 일치하지 않습니다. 원인을 분석해 **수정된 규칙 JSON**을 만들어 주세요.`,
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
    '## 이전 규칙 (문제가 있는 버전)',
    '```json',
    JSON.stringify(rule, null, 1),
    '```',
    '',
    '## 실제 추출 결과',
    JSON.stringify(verification.details || [], null, 1),
    '',
    '## 발견된 문제',
    ...(verification.problems || []).map(p => '- ' + p),
    '',
    '## 지시사항',
    `- 규칙 id는 "${ruleId}"로 고정합니다.`,
    `- 흔한 원인: ① rowSelector가 품목 행과 일치하지 않음(헤더/빈 행 포함 또는 옵션 행 누락 — 체크 시 행이 새로 생기는 구조면 optionRows { sel } 사용) ② fields 선택자가 행 안 요소와 불일치 ③ 금액이 합계 표시인데 priceIs:"lineTotal" 누락 ④ match 도메인 오류.`,
    `- 모든 샘플에서 공통으로 동작해야 하고, 정답 엑셀의 품목 수·이름·수량·금액과 정확히 일치해야 합니다.`,
    `- 응답에는 설명 없이 수정된 규칙 JSON 객체만 담습니다.`
  ].filter(Boolean).join('\n')
}
