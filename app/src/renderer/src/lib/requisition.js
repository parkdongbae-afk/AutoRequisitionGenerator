import { wonToKorean } from './koreanWon.js'
import { KEYWORD_GROUPS } from './keywordMatrix.js'

// 품의 개요 작성 프로그램 데이터·로직 (v1.41.0 — Proposal 폴더 양식 텍스트 기준)
// 유형 선택 시 해당 양식 파일(물품 구입.txt / 수당 지급.txt / 협의회 실시.txt)을 에디터에 보여주고
// 보유 데이터(제목·내역·총액·품목)만 자동 치환한다.

export const REQUISITION_TYPES = [
  { id: 'buy', label: '물품 구입', titlePh: '예: 청소 및 위생용품' },
  { id: 'allowance', label: '수당 지급', titlePh: '예: 방과후학교 지도강사' },
  { id: 'council', label: '협의회 실시', titlePh: '예: 교육과정 수립 워크숍' }
]

export function typeById(id) {
  return REQUISITION_TYPES.find(t => t.id === id) || REQUISITION_TYPES[0]
}

// Proposal 폴더 양식 텍스트 (패키지 exe는 이 폴더를 읽을 수 없으므로 내장)
const TEMPLATES = {
  buy: [
    '1. 관련: □□□(대호 없을시 생략가능)',
    '2. ○○○ 관련 물품을 아래와 같이 구입하고자 합니다.',
    '  가. 내역:',
    '  나. 용도:',
    '  다. 소요예산: 금○,○○○원',
    '  라. 산출내역: △△외 ○건(품의명세서 참조)',
    '',
    '붙임  지출(지급)품의서 1부.  끝.'
  ].join('\n'),
  allowance: [
    '1. 관련: □□□(대호 없을시 생략가능)',
    '2. ○○○ 관련 수당을 아래와 같이 지급하고자 합니다.',
    '  가. 지급대상:',
    '  나. 사업일시:',
    '  다. 소요예산: 금○,○○○원',
    '  라. 산출내역:',
    '※ 사업완료에 따른 지급조서 별첨 (행정용이며 교원은 삭제)',
    '',
    '붙임  지출(지급)품의서 1부.  끝.'
  ].join('\n'),
  council: [
    '1. 관련: □□□(대호 없을시 생략가능)',
    '2. ○○○ 관련 협의회를 아래와 같이 실시하고자 합니다.',
    '  가. 일시:',
    '  나. 장소:',
    '  다. 협의사항:',
    '  라. 참석자: ○○○, ○○○ 총 ○○명',
    '  마. 소요예산: 금○,○○○원',
    '  바. 산출내역: ○,○○○원 * ○○명',
    '붙임  지출(지급)품의서 1부.  끝.'
  ].join('\n')
}

// gibon.txt — 키워드 미매칭 시 기본 대체 문구 + 최종 공통 대체 문구
export const GIBON_FALLBACK = {
  buy: '원활한 교육활동 및 학교 업무 수행을 위한 필요 물품 구입',
  allowance: '해당 교육활동의 전문적이고 원활한 운영을 위한 수당 지급',
  council: '해당 사업의 효율적인 추진 및 내실 있는 운영 방안 협의'
}
export const GIBON_FINAL = '해당 업무의 원활한 추진 및 교육활동 지원'

// 제목 키워드 → 목적/용도 후보 검색 — 제목에 걸리는 키워드 그룹의 문구를 최대 limit개 반환.
// 매칭은 두 방향: ① 제목이 키워드를 포함(예: "체육용품 구입" → 키 "체육용품") ② 키워드가 제목을
// 포함(예: "체육" → 키 "체육용품", 2글자 이상일 때만 — 1글자는 오탐 과다).
// 순위는 ①이 우선이며, ①은 더 긴(구체적인) 키워드, ②는 더 짧은(제목에 가까운) 키워드가 앞선다.
export function findPurposeCandidates(typeId, title, limit = 10) {
  const t = String(title || '').trim()
  if (!t) return []
  const hits = []
  for (const g of KEYWORD_GROUPS) {
    if (g.type !== typeId) continue
    let forward = 0
    let reverse = 0
    for (const k of g.keys) {
      if (t.includes(k)) {
        if (k.length > forward) forward = k.length
      } else if (t.length >= 2 && k.includes(t)) {
        if (reverse === 0 || k.length < reverse) reverse = k.length
      }
    }
    if (forward > 0) hits.push({ purpose: g.purpose, rank: 0, tie: -forward })
    else if (reverse > 0) hits.push({ purpose: g.purpose, rank: 1, tie: reverse })
  }
  hits.sort((a, b) => a.rank - b.rank || a.tie - b.tie)
  const seen = new Set()
  const out = []
  for (const h of hits) {
    if (seen.has(h.purpose)) continue
    seen.add(h.purpose)
    out.push(h.purpose)
    if (out.length >= limit) break
  }
  return out
}

// 기존 호환 — 첫 매칭 문구 1개(없으면 gibon 기본)
export function inferPurpose(typeId, title) {
  const t = String(title || '').trim()
  if (t) {
    for (const g of KEYWORD_GROUPS) {
      if (g.type !== typeId) continue
      if (g.keys.some(k => t.includes(k))) return g.purpose
    }
  }
  return GIBON_FALLBACK[typeId] || GIBON_FINAL
}

// 산출내역 표시값 (원가통계비목 - 산출내역)
export function accountDisplay(a) {
  if (!a) return ''
  return a.detail ? `${a.name} - ${a.detail}` : a.name
}

// 양식 텍스트에 보유 데이터를 자동 치환 (없는 값은 양식의 placeholder 그대로 유지)
export function fillTemplate(typeId, { title, detail, purpose, total, firstItem, count }) {
  const name = String(title || '').trim() || '○○○'
  const amt = Math.max(0, Math.round(Number(total) || 0))
  const hasAmt = amt > 0
  const item = String(firstItem || '').trim()
  const n = Math.max(0, Math.round(Number(count) || 0))
  const amountText = `${amt.toLocaleString()}원(금${wonToKorean(amt)}원)`
  const d = String(detail || '').trim()

  return TEMPLATES[typeId].split('\n').map(line => {
    if (line.startsWith('2. ')) return line.replace('○○○', name)
    if (typeId === 'buy') {
      if (line.startsWith('  가. 내역:') && d) return `  가. 내역: ${d}`
      if (line.startsWith('  나. 용도:') && purpose) return `  나. 용도: ${purpose}`
      if (line.startsWith('  다. 소요예산:') && hasAmt) return `  다. 소요예산: 금${amountText}`
      if (line.startsWith('  라. 산출내역:') && item) return `  라. 산출내역: ${item}외 ${n}건(품의명세서 참조)`
    } else if (typeId === 'allowance') {
      if (line.startsWith('  다. 소요예산:') && hasAmt) return `  다. 소요예산: 금${amountText}`
      if (line.startsWith('  라. 산출내역:') && item) return `  라. 산출내역: ${item}외 ${n}명(수당지급명세서 참조)`
    } else if (typeId === 'council') {
      if (line.startsWith('  마. 소요예산:') && hasAmt) return `  마. 소요예산: 금${amountText}`
      if (line.startsWith('  바. 산출내역:') && hasAmt) return `  바. 산출내역: ${amt.toLocaleString()}원 * ${n}명`
    }
    return line
  }).join('\n')
}

// 대호 삭제 후 공문서 방식에 따라 글머리 기호(가. 나. 다. …)를 숫자(1. 2. 3. …)로 바꾸고
// 들여쓰기를 제거한다 (1. 2. 항목은 좌측 여백 없이 배치)
const ORDINALS = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하']
function relabelOrdinals(text) {
  const map = {}
  let n = 0
  return String(text).split('\n').map(line => {
    const m = line.match(/^(\s*)([가-힣])\./)
    if (!m || !ORDINALS.includes(m[2])) return line
    if (!(m[2] in map)) map[m[2]] = ++n
    return `${map[m[2]]}.` + line.slice(m[0].length)
  }).join('\n')
}

// 대호(첫 행) 삭제 — 1행을 지우고 나머지 줄을 위로 이동, 기존 2번째 줄의 "2. " 번호 제거,
// 글머리 기호(가. 나. …)를 공문서 방식대로 숫자(1. 2. …)로 바꾼다
export function removeHeadingLine(text) {
  const lines = String(text).split('\n')
  if (lines.length <= 1) return ''
  const rest = lines.slice(1)
  if (rest[0].startsWith('2. ')) rest[0] = rest[0].slice(3)
  return relabelOrdinals(rest.join('\n'))
}

// 에디터 직접 편집 중 1번째 줄이 비면(삭제) 같은 규칙을 자동 적용
export function applyLineShift(text) {
  const lines = String(text).split('\n')
  const first = lines[0] || ''
  if (first.trim() === '') {
    let i = 0
    while (i < lines.length && lines[i].trim() === '') i++
    const rest = lines.slice(i)
    if (rest.length && rest[0].startsWith('2. ')) rest[0] = rest[0].slice(3)
    return relabelOrdinals(rest.join('\n'))
  }
  if (first.startsWith('2. ')) return relabelOrdinals([first.slice(3), ...lines.slice(1)].join('\n'))
  return text
}

// 예시 자료 참조 모달 — Proposal 폴더 예시 텍스트 (내장)
export const EXAMPLES = {
  buy: [
    '제목 : 교무부 입학식 행사 물품 구입',
    '',
    '1. 관련 : 교무기획부-56(2026. 3. 10.)',
    '2. 입학식 운영과 관련하여 아래와 같이 ○○○ 관련 물품을 구입하고자 합니다.',
    '  가. 내역: 교육운영비 - 행사용품구입',
    '  나. 용도: 입학식 행사 운영을 위한 물품 구매',
    '  다. 소요예산: 금396,000원(금삼십구만육천원)',
    '  라. 산출내역: △△외 ○건(품의명세서 참조)',
    '',
    '붙임 지출(지급)품의서 1부. 끝.'
  ].join('\n'),
  allowance: [
    '제목 : 방과후 학교 운영에 따른 수당 지급',
    '',
    '1. 관련 : ○○○학교 방과후 교육부-57(2026. 7. 10.)',
    '',
    '2. 2026학년도 ○○프로그램 운영 관련 수당을 아래와 같이 지급하고자 합니다.',
    '  가. 지급대상: 방과후학교 프로그램(기초학력 보정) 운영 담당 교사 3명',
    '  나. 사업일시: 2026. 4. 7.~2026. 4. 30. 매주 월·수·금 16:00~18:00',
    '  다. 소요예산: 금360,000원(금삼십육만원)',
    '  라. 산출내역: 강사료 30,000원×12회=360,000원',
    '',
    '※ 사업완료에 따른 지급조서 별첨 (행정용이며 교원은 삭제)',
    '붙임 지출(지급)품의서 1부. 끝.'
  ].join('\n'),
  council: [
    '제목 : 2026학년도 학교교육과정 운영 협의회 실시',
    '',
    '1. 관련: 교육과정 편성·운영 계획',
    '2. 2026학년도 학교교육과정 운영 관련 협의회를 아래와 같이 실시하고자 합니다.',
    '  가. 일시: 2026. 3. 10. 16:00~18:00',
    '  나. 장소: 교장실 및 인근 식당',
    '  다. 협의사항:',
    '    1) 학년별 교육과정 및 수업 운영 계획',
    '    2) 부서별 주요 업무 추진 계획',
    '    3) 학생 생활지도 및 안전관리 계획',
    '  라. 참석자: 교장, 교감, 행정실장, 부장교사 7명 총 10명',
    '  마. 소요예산: 금200,000원(금이십만원)',
    '  바. 산출내역: 중식 10식×20,000원=200,000원',
    '',
    '붙임 지출(지급)품의서 1부. 끝.'
  ].join('\n')
}

// 참고 자료 출처 (Proposal/참고 자료 폴더 — 부산광역시 교육청 학교회계자료실)
export const REFERENCE_SOURCE = {
  label: '부산광역시 교육청 [정보공개] > [재정정보] > [학교회계 예결산서공개] > [학교회계자료실]',
  url: 'https://www.pen.go.kr/main/na/ntt/selectNttList.do?mi=30608&bbsId=2461'
}
