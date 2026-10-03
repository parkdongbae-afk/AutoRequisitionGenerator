/*
 * 엑셀 정답 만들기 순수 로직 — 렌더러·테스트 공용
 * inferUnit: 품목명·규격에서 단위(개/식/권/상자…) 유추
 * mergeShippingRows: 배송비 행 합산 — 단가가 같은 것끼리만 수량을 합산한다
 */
const UNIT_RULES = [
  ['권', ['권', '책', '교과서', '문제집', '국어', '영어', '수학', '사회', '과학', '역사', '도덕', '음악', '미술', '체육', '한문', '일본어', '중국어', '기술', '가정']],
  ['식', ['급식', '점심', '도시락', '식권', '식사', '캠핑용품']],
  ['상자', ['상자', '박스', 'box']],
  ['세트', ['세트', 'set']],
  ['통', ['통']],
  ['봉', ['봉지', '봉투', '봉']],
  ['팩', ['팩']],
  ['자루', ['자루']],
  ['병', ['병']],
  ['켤레', ['켤레', '신발', '양말', '운동화']]
]

export function inferUnit(name, spec) {
  const text = `${name || ''} ${spec || ''}`
  for (const [unit, keywords] of UNIT_RULES) {
    if (keywords.some(k => text.includes(k))) return unit
  }
  return '개'
}

export function mergeShippingRows(shippingRows) {
  const groups = new Map()
  for (const r of shippingRows || []) {
    const price = Number(r.unitPrice) || 0
    const qty = Number(r.qty) || 1
    groups.set(price, (groups.get(price) || 0) + qty)
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([unitPrice, qty]) => ({ qty, unitPrice }))
}
