/*
 * 엑셀 정답 만들기 순수 로직 — 렌더러·테스트 공용
 * 규격·단위는 사용자 앱(app/)에서 검증된 방식을 그대로 따른다:
 *  - 규격: app/src/main/lib/spec.js deriveSpec — 옵션·품목명에서 규격 토큰(355ml, 20개입, 1상자…) 추출
 *  - 단위: app/src/main/lib/docstore.js — 배송비 '식', 품목 '개'
 */
export { deriveSpec } from '../../../app/src/main/lib/spec.js'

export function answerUnit(isShipping) {
  return isShipping ? '식' : '개'
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
