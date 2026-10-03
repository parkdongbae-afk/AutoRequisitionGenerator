// 수정 정답으로 재검증 — lineTotal 규칙 2종
import fs from 'node:fs'
import { sampleHtmlText, answerSummary } from '../../app/src/main/lib/admin-text.js'
import { extractItems } from '../../app/src/main/lib/extract.js'

const DIR = 'C:/Users/Park/Desktop/Automatic_generation_of_approval_requests_html/Check/아인몰'
const FILES = {
  'order-free': DIR + '/배송비무료/주문서_No.1 교육쇼핑몰 아인몰 2.0.mhtml',
  'order-paid': DIR + '/배송비발생/주문서2_No.1 교육쇼핑몰 아인몰 2.0.mhtml',
  'cart-free': DIR + '/배송비무료/장바구니_No.1 교육쇼핑몰 아인몰 2.0.mhtml',
  'cart-paid': DIR + '/배송비발생/장바구니2_No.1 교육쇼핑몰 아인몰 2.0.mhtml'
}
const ANSWERS = {
  free: answerSummary(DIR + '/배송비무료/정답_배송비무료_아인몰_수정.xlsx'),
  paid: answerSummary(DIR + '/배송비발생/정답2_배송비발생_아인몰.xlsx')
}

let pass = 0
for (const ruleFile of ['C:/Users/Park/Downloads/ainmall-order-lineTotal.json', 'C:/Users/Park/Downloads/ainmall-cart-lineTotal.json']) {
  const rule = JSON.parse(fs.readFileSync(ruleFile, 'utf-8'))
  const kind = /cart/.test(rule.id) ? 'cart' : 'order'
  console.log('== ' + rule.id + ' (priceIs: ' + rule.priceIs + ') ==')
  for (const ship of ['free', 'paid']) {
    const { html } = sampleHtmlText(FILES[kind + '-' + ship])
    const res = extractItems(html, rule)
    const ansItems = (ANSWERS[ship].items || []).filter(i => !i.isShipping)
    const gotTotal = res.items.reduce((s, i) => s + (Number(i.qty) || 1) * (Number(i.unitPrice) || 0), 0)
    const ansTotal = ansItems.reduce((s, i) => s + (Number(i.qty) || 1) * (Number(i.unitPrice) || 0), 0)
    const ok = res.items.length === ansItems.length && Math.abs(gotTotal - ansTotal) <= Math.max(10, ansTotal * 0.02)
    if (ok) pass++
    console.log('  [' + kind + '-' + ship + '] ' + res.items.length + '건/정답 ' + ansItems.length + '건 · ' + gotTotal.toLocaleString('ko-KR') + '원/정답 ' + ansTotal.toLocaleString('ko-KR') + '원 ' + (ok ? '✓ PASS' : '✗ FAIL'))
    for (const it of res.items) console.log('    · ' + it.name.slice(0, 34) + ' x' + it.qty + ' @' + it.unitPrice.toLocaleString('ko-KR') + '원')
  }
}
console.log('PASS: ' + pass + '/4')
