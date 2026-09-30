// 규칙 ID 파생(§7.6) — main(generation-service)과 renderer가 함께 쓰는 순수 로직
export function suggestBaseId(mallName) {
  const s = String(mallName || '').toLowerCase().replace(/-cart$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return s || `mall-${Date.now()}`
}

export function ruleIdFor(baseId, kind) {
  const base = String(baseId || '').toLowerCase().replace(/-cart$/, '')
  return kind === 'cart' ? `${base}-cart` : base
}
