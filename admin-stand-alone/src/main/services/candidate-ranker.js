// 후보 규칙 점수화 (JEV.MD §17) — 코드 기반 100점, Jev 점수와 합치지 않는다
export function scoreCandidate(deterministic) {
  const d = deterministic || {}
  const b = {
    schema: d.schemaValid ? 10 : 0,
    extraction: (d.itemCount || 0) > 0 ? 10 : 0,
    countMatch: d.countMatches ? 20 : 0,
    totalWithin: d.totalWithinTolerance ? 20 : 0,
    names: d.namesAllPresent ? 10 : 0,
    pricesPositive: d.pricesPositive ? 10 : 0,
    checkedOnly: d.checkedOnlyValid ? 10 : 0,
    optionRows: d.optionRowsValid ? 5 : 0,
    shipping: d.shippingValid ? 5 : 0
  }
  const score = Object.values(b).reduce((s, v) => s + v, 0)
  return { score, breakdown: b }
}

// 후보 배열 → 점수 내림차순 정렬(동점 시 이름 안정)
export function rankCandidates(scored) {
  return [...scored].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
}
