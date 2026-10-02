// 가격 의미 변형 대조 — as-is vs priceIs:lineTotal
import fs from 'node:fs'
import { sampleHtmlText, answerSummary } from '../../app/src/main/lib/admin-text.js'
import { extractItems } from '../../app/src/main/lib/extract.js'

const DIR = 'C:/Users/Park/Desktop/Automatic_generation_of_approval_requests_html/Check/아인몰'
const FILES = {
  'order-free': join(DIR, '배송비무료', '주문서_No.1 교육쇼핑몰 아인몰 2.0.mhtml'),
  'order-paid': join(DIR, '배송비발생', '주문서2_No.1 교육쇼핑몰 아인몰 2.0.mhtml'),
  'cart-free': join(DIR, '배송비무료', '장바구니_No.1 교육쇼핑몰 아인몰 2.0.mhtml'),
  'cart-paid': join(DIR, '배송비발생', '장바구니2_No.1 교육쇼핑몰 아인몰 2.0.mhtml')
}
const ANSWERS = {
  free: answerSummary(join(DIR, '배송비무료', '정답_배송비무료_아인몰.xlsx')),
  paid: answerSummary(join(DIR, '배송비발생', '정답2_배송비발생_아인몰.xlsx'))
}
const RULES = {
  order: JSON.parse(fs.readFileSync('C:/Users/Park/Downloads/ainmall-order.json', 'utf-8')),
  cart: JSON.parse(fs.readFileSync('C:/Users/Park/Downloads/ainmall-cart.json', 'utf-8'))
}
function join(...p) { return p.join('/') }

const out = []
for (const kind of ['order', 'cart']) {
  for (const variant of ['as-is', 'lineTotal']) {
    const rule = { ...RULES[kind], priceIs: variant === 'lineTotal' ? 'lineTotal' : RULES[kind].priceIs }
    for (const ship of ['free', 'paid']) {
      const { html } = sampleHtmlText(FILES[`${kind}-${ship}`])
      const res = extractItems(html, rule)
      const got = res.items.map(i => ({ name: i.name, qty: i.qty, unit: i.unitPrice, sum: i.qty * i.unitPrice }))
      const ansItems = (ANSWERS[ship].items || []).filter(i => !i.isShipping)
      const ansSum = ansItems.reduce((s, i) => s + (i.qty || 1) * i.unitPrice, 0)
      const gotSum = got.reduce((s, i) => s + i.sum, 0)
      out.push({
        case: `${kind}-${ship} [${variant}]`,
        count: `${got.length}건 / 정답 ${ansItems.length}건`,
        total: `${gotSum.toLocaleString('ko-KR')} / 정답 ${ansSum.toLocaleString('ko-KR')}`,
        items: got.map(i => `${i.name} x${i.qty} → 단가 ${i.unit.toLocaleString('ko-KR')}`)
      })
    }
  }
}
console.log(JSON.stringify(out, null, 1))
