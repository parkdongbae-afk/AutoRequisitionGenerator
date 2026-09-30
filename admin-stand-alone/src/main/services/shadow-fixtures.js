/*
 * Shadow 픽스처 수집 (JEV.MD §19.2 — "실제 또는 fixture 결과" 수집 허용)
 * selector 안정성×상품명 품질×추출 정합성×화면 종류 축으로 72개 상태를 만들고,
 * 축 의미에서 도출되는 관리자 정답(adminDecision)과 Jev 판정을 비교 기록한다.
 * 순수 모듈 — callJev 주입으로 node 테스트 가능하다.
 */

const SELECTORS = {
  stable: { row: 'div.cart-item', price: '.sale-price', suspicious: [] },
  random: { row: 'div.css-1x92j3:nth-child(4) > span:nth-child(2)', price: 'span.css-8f3k21', suspicious: ['css-1x92j3', 'css-8f3k21'] },
  attr: { row: '[data-product-row]', price: '[data-price]', suspicious: [] }
}
const NAMES = {
  good: ['코카콜라 제로 355ml 24캔', '게토리 500ml 20개입', '새우깡 90g 5봉'],
  garbage: ['삭제 관심상품 바로구매 19,900원', '장바구니 담기 쿠폰받기', '무료배송 상품보기'],
  mixed: ['코카콜라 제로 355ml 24캔', '장바구니 담기', '게토리 500ml 20개입']
}
const EXTRACTIONS = ['match', 'countMismatch', 'totalMismatch', 'empty']
const KINDS = ['cart', 'order']

export function buildFixtureCases() {
  const cases = []
  for (const selKey of Object.keys(SELECTORS)) {
    for (const nameKey of Object.keys(NAMES)) {
      for (const exKey of EXTRACTIONS) {
        for (const kind of KINDS) {
          cases.push(buildCase(`${selKey}-${nameKey}-${exKey}-${kind}`, selKey, nameKey, exKey, kind))
        }
      }
    }
  }
  return cases
}

function buildCase(key, selKey, nameKey, exKey, kind) {
  const sel = SELECTORS[selKey]
  const names = NAMES[nameKey]
  const isCart = kind === 'cart'
  const rule = {
    id: `fixture-${key}`,
    name: `픽스처 ${key}`,
    rowSelector: sel.row,
    priceIs: 'lineTotal',
    ...(isCart ? { checkedOnly: { sel: 'input[type=checkbox]' } } : {}),
    fields: {
      name: { sel: '.product-name' },
      qty: { sel: '.qty', attr: 'value', regex: '(\\d+)' },
      price: { sel: sel.price, regex: '([\\d,]+)' }
    }
  }
  const expectedItems = names.map((n, i) => ({ name: n, qty: 1, unitPrice: 1000 * (i + 1) }))
  let items = names.map((n, i) => ({ name: n, qty: 1, unitPrice: 1000 * (i + 1) }))
  if (exKey === 'countMismatch') items = items.slice(0, Math.max(1, items.length - 1))
  if (exKey === 'totalMismatch') items = items.map((it, i) => ({ ...it, unitPrice: it.unitPrice * 3 }))
  if (exKey === 'empty') items = []
  const extraction = {
    items,
    emptyNameCount: exKey === 'empty' ? names.length : items.filter(it => !it.name || /바로구매|담기/.test(it.name)).length
  }
  const counts = selKey === 'random' ? { rowSelector: 1, name: 1, qty: 1, price: 1 } : { rowSelector: 3, name: 3, qty: 3, price: 3 }
  const diagnostics = { selectorMatchCounts: counts, suspiciousClassNames: sel.suspicious }

  // 축 의미에서 도출되는 관리자 정답(그라운드 트루스) — §15.6·§19 판정 기준
  let adminDecision
  let adminReason
  if (exKey === 'empty') {
    adminDecision = 'reject'
    adminReason = '추출 0건 — 폐기'
  } else if (exKey === 'countMismatch' || exKey === 'totalMismatch') {
    adminDecision = 'repair'
    adminReason = '정답 건수/총액 불일치 — 수정 필요'
  } else if (selKey === 'random') {
    adminDecision = 'human_review'
    adminReason = '난수 class selector — 배포 보류'
  } else if (nameKey === 'garbage') {
    adminDecision = 'repair'
    adminReason = '상품명이 UI 문구 — name selector 수정'
  } else {
    adminDecision = 'approve'
    adminReason = '안정적 selector + 정상 상품명'
  }

  return { key, kind, rule, extraction, expected: { items: expectedItems }, diagnostics, adminDecision, adminReason }
}

/*
 * 픽스처 실행 — 각 케이스를 Jev로 판정해 Shadow 레코드를 만든다(§19.1 형식).
 * persist(record)는 appendShadowRecord를 주입받는다. Jev 오류 케이스는 비교 대상에서 제외된다.
 */
export async function runShadowFixtures({ callJev, persist, onProgress = () => {} } = {}) {
  if (typeof callJev !== 'function') throw new Error('callJev 주입이 필요합니다')
  if (typeof persist !== 'function') throw new Error('persist 주입이 필요합니다')
  const cases = buildFixtureCases()
  let recorded = 0
  let errors = 0
  let i = 0
  for (const c of cases) {
    i++
    try {
      const jev = await callJev({
        rule: c.rule,
        extraction: c.extraction,
        expected: c.expected,
        diagnostics: c.diagnostics
      })
      const answers = (jev && jev.answers) || {}
      persist({
        ruleId: c.rule.id,
        localDecision: c.extraction === 'empty' ? 'fail' : 'pass',
        jevDecision: answers.deployment_ready && answers.deployment_ready.value,
        jevConfidence: answers.deployment_ready && answers.deployment_ready.confidence,
        adminDecision: c.adminDecision,
        notes: `fixture §19.2 — ${c.adminReason}`
      })
      recorded++
    } catch (e) {
      errors++
      if (errors <= 2) onProgress({ message: `케이스 ${i}/${cases.length} 실패: ${String(e.message || e).slice(0, 80)}` })
    }
    if (i % 12 === 0) onProgress({ message: `진행 ${i}/${cases.length}` })
  }
  return { total: cases.length, recorded, errors }
}
