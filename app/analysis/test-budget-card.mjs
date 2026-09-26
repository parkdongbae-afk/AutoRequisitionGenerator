// 사업관리카드(예산).xls 파싱 + 한글 금액 변환 + 품의 개요 양식 치환 검증 (v1.40.0~v1.41.0)
import { parseBudgetCard } from '../src/main/lib/budgetcard.js'
import { wonToKorean } from '../src/renderer/src/lib/koreanWon.js'
import { fillTemplate, removeHeadingLine, inferPurpose, findPurposeCandidates, GIBON_FALLBACK, applyLineShift } from '../src/renderer/src/lib/requisition.js'

const file = process.argv[2] || '..\\Proposal\\사업관리카드(예산).xls'
let fails = 0
const check = (label, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`)
  if (!cond) fails++
}

// ── 한글 금액 변환 ──
check('wonToKorean(1234560) === 백이십삼만사천오백육십', wonToKorean(1234560) === '백이십삼만사천오백육십')
check('wonToKorean(2400000) === 이백사십만', wonToKorean(2400000) === '이백사십만')
check('wonToKorean(350000) === 삼십오만', wonToKorean(350000) === '삼십오만')
check('wonToKorean(0) === 영', wonToKorean(0) === '영')
check('wonToKorean(10) === 십', wonToKorean(10) === '십')
check('wonToKorean(100000000) === 일억', wonToKorean(100000000) === '일억')
check('wonToKorean(135368000) === 일억삼천오백삼십육만팔천', wonToKorean(135368000) === '일억삼천오백삼십육만팔천')

// ── 사업관리카드 파싱 ──
const res = parseBudgetCard(file)
const bs = res.businesses || []
console.log(`\n시트: ${res.sheetName} · 세부사업 ${bs.length}건`)
for (const b of bs) {
  console.log(`- ${b.name} (세부항목 ${b.items.length})`)
  for (const it of b.items) {
    for (const a of it.accounts) {
      console.log(`    · ${a.name} - ${a.detail}`)
    }
  }
}

const names = bs.map(b => b.name)
check('세부사업 7건 (교직원복지·교과활동지원·과학 교과활동·선택 교과활동·동아리활동·교무학사운영·부서기본운영)',
  ['교직원복지', '교과활동지원', '과학 교과활동', '선택 교과활동', '동아리활동', '교무학사운영', '부서기본운영'].every(n => names.includes(n)))

const welfare = bs.find(b => b.name === '교직원복지')
check('교직원복지 > (통합)교원업무용전화번호운영 > 일반수용비 - 안심번호서비스',
  !!welfare && welfare.items.some(it =>
    it.name === '(통합)교원업무용전화번호운영' &&
    it.accounts.some(a => a.name === '일반수용비' && a.detail === '안심번호서비스')))

const gwamoo = bs.find(b => b.name === '교무학사운영')
check('교무학사운영 > 동명 세부항목(교무학사운영) 계층 유지',
  !!gwamoo && gwamoo.items.some(it => it.name === '교무학사운영' && it.accounts.length >= 6))

const buseo = bs.find(b => b.name === '부서기본운영')
const bukgwa = buseo && buseo.items.find(it => it.name === '부서공통운영')
check('부서기본운영 > 부서공통운영 > 복사용지구입 산출내역',
  !!bukgwa && bukgwa.accounts.some(a => a.name === '일반수용비' && a.detail === '복사용지구입'))

const totalAccounts = bs.reduce((n, b) => n + b.items.reduce((m, it) => m + it.accounts.length, 0), 0)
check(`산출내역 총 ${totalAccounts}건 > 60건`, totalAccounts > 60)
check('모든 세부사업이 세부항목 보유', bs.every(b => b.items.length > 0))
check('모든 세부항목이 산출내역 보유', bs.every(b => b.items.every(it => it.accounts.length > 0)))

// ── 품의 개요 양식 치환 (v1.41.0) ──
const FILL = { title: '청소 및 위생용품', detail: '일반수용비 - 위생방역용품구입', total: 396000, firstItem: '마미손 고무장갑', count: 9 }

const buyText = fillTemplate('buy', { ...FILL, purpose: inferPurpose('buy', FILL.title) })
check('물품: 2번째 줄 제목 치환', buyText.includes('2. 청소 및 위생용품 관련 물품을 아래와 같이 구입하고자 합니다.'))
check('물품: 가. 내역 치환', buyText.includes('  가. 내역: 일반수용비 - 위생방역용품구입'))
check('물품: 다. 소요예산 금액+한글', buyText.includes('  다. 소요예산: 금396,000원(금삼십구만육천원)'))
check('물품: 라. 산출내역 품목+건수', buyText.includes('  라. 산출내역: 마미손 고무장갑외 9건(품의명세서 참조)'))
check('물품: 붙임 줄 유지', buyText.includes('붙임  지출(지급)품의서 1부.  끝.'))

const dataNone = fillTemplate('buy', { title: '', detail: '', total: 0, firstItem: '', count: 0 })
check('데이터 부재 시 placeholder 유지(금○,○○○원)', dataNone.includes('  다. 소요예산: 금○,○○○원'))
check('데이터 부재 시 placeholder 유지(△△외 ○건)', dataNone.includes('  라. 산출내역: △△외 ○건(품의명세서 참조)'))
check('데이터 부재 시 제목 ○○○ 유지', dataNone.includes('2. ○○○ 관련 물품을'))

const allowText = fillTemplate('allowance', { title: '방과후학교 지도강사', detail: '', total: 360000, firstItem: '홍길동', count: 3 })
check('수당: 2번째 줄 제목 치환', allowText.includes('2. 방과후학교 지도강사 관련 수당을 아래와 같이 지급하고자 합니다.'))
check('수당: 다. 소요예산 금360,000원(금삼십육만원)', allowText.includes('  다. 소요예산: 금360,000원(금삼십육만원)'))
check('수당: 라. 산출내역 명수', allowText.includes('  라. 산출내역: 홍길동외 3명(수당지급명세서 참조)'))
check('수당: 지급조서 별첨 갱신 문구', allowText.includes('※ 사업완료에 따른 지급조서 별첨 (행정용이며 교원은 삭제)'))
check('수당: 붙임 앞 빈 줄 유지', allowText.includes('\n\n붙임  지출(지급)품의서 1부.  끝.'))

const councilText = fillTemplate('council', { title: '교육과정 수립 워크숍', detail: '', total: 200000, firstItem: '', count: 10 })
check('협의회: 마. 소요예산 금200,000원(금이십만원)', councilText.includes('  마. 소요예산: 금200,000원(금이십만원)'))
check('협의회: 바. 산출내역 금액*인원', councilText.includes('  바. 산출내역: 200,000원 * 10명'))
check('협의회: 참석자 줄 무영향(제목 치환이 2번째 줄 한정)', councilText.includes('  라. 참석자: ○○○, ○○○ 총 ○○명'))

// ── 대호 삭제 ──
const shifted = removeHeadingLine(buyText)
check('대호 삭제: 1행 제거', !shifted.includes('1. 관련:'))
check('대호 삭제: 기존 2번째 줄 번호 제거', shifted.startsWith('청소 및 위생용품 관련 물품을'))
check('대호 삭제: 글머리 가→1 숫자화', shifted.includes('\n1. 내역: 일반수용비 - 위생방역용품구입'))
check('대호 삭제: 숫자 항목 들여쓰기 제거', shifted.includes('\n2. 용도:') && shifted.includes('\n3. 소요예산:') && shifted.includes('\n4. 산출내역:'))
check('대호 삭제: 붙임 줄 이동', shifted.includes('붙임'))

const councilShifted = removeHeadingLine(councilText)
check('협의회 대호 삭제: 가~바 → 1~6 숫자화', councilShifted.includes('\n1. 일시:') && councilShifted.includes('\n6. 산출내역:'))
const subItemShifted = removeHeadingLine('1. 관련: X\n2. 제목입니다.\n  가. 일시:\n  다. 협의사항:\n    1) 학년별 교육과정 및 수업 운영 계획')
check('대호 삭제: 하위 1)2) 항목 유지', subItemShifted.includes('    1) 학년별 교육과정 및 수업 운영 계획') && subItemShifted.includes('\n2. 협의사항:'))

const autoShift1 = applyLineShift('\n2. ○○○ 관련 물품을...\n  가. 내역:')
check('라인 시프팅: 1행 내용만 삭제(빈 줄 남음)', autoShift1 === '○○○ 관련 물품을...\n1. 내역:')
const autoShift2 = applyLineShift('2. ○○○ 관련 물품을...\n  가. 내역:')
check('라인 시프팅: 1행 통째로 삭제(번호만 남음)', autoShift2 === '○○○ 관련 물품을...\n1. 내역:')

// ── 나. 용도 후보 검색 (최대 10건, 사용자 선택용) ──
const cands = findPurposeCandidates('buy', '복사용지 구입', 10)
check('후보 검색: 복사용지 → 최소 1건', cands.length >= 1)
check('후보 검색: 구체적 키워드 문구가 첫 후보', cands[0] === '교수·학습자료 제작 및 학교 행정문서 출력을 위한 소모품 확보')
check('후보 검색: 중복 문구 없음', new Set(cands).size === cands.length)
check('후보 검색: limit 준수', findPurposeCandidates('buy', '구입 물품', 2).length <= 2)
check('후보 검색: 빈 제목 → 0건', findPurposeCandidates('buy', '').length === 0)

// 역방향 매칭 — 제목이 키워드의 일부여도 후보 반환 (예: "체육"→체육용품, "기술"→기술실)
const peCands = findPurposeCandidates('buy', '체육', 10)
check('역방향: "체육" → 후보 1건 이상', peCands.length >= 1)
check('역방향: "체육" → 체육수업 문구 포함', peCands.includes('체육수업 및 학생 체육활동의 안전하고 원활한 운영 지원'))
check('역방향: "기술" → 후보 1건 이상', findPurposeCandidates('buy', '기술', 10).length >= 1)
check('역방향: "방송실" → 후보 1건 이상', findPurposeCandidates('buy', '방송실', 10).length >= 1)
check('역방향: 순위 — 정방향("복사용지 구입")이 역방향보다 우선', findPurposeCandidates('buy', '복사용지 구입', 10)[0] === cands[0])
check('역방향: 1글자 제목은 역매칭 금지(오탐 방지)', findPurposeCandidates('buy', '체', 10).length === 0)

// ── 키워드 자동 유추 (CSV 생성 매트릭스) ──
check('키워드 유추: 복사용지 → 출력 소모품 문구', inferPurpose('buy', '복사용지 구입') === '교수·학습자료 제작 및 학교 행정문서 출력을 위한 소모품 확보')
check('키워드 유추: A4 복사용지도 동일 그룹 매칭', inferPurpose('buy', 'A4 복사용지 구입') === '교수·학습자료 제작 및 학교 행정문서 출력을 위한 소모품 확보')
check('키워드 미매칭 → gibon 기본 문구', inferPurpose('buy', '전혀없는키워드123') === GIBON_FALLBACK.buy)
check('빈 제목 → gibon 기본 문구', inferPurpose('buy', '') === GIBON_FALLBACK.buy)

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAIL`)
process.exit(fails === 0 ? 0 : 1)
