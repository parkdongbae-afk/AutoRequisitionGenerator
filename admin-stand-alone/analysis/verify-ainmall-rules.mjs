// 아인몰 수제 규칙 2종 검증 — 캡처 무료/발생 × 정답(무료/발생) 전 조합 대조
import fs from 'node:fs'
import { sampleHtmlText, answerSummary } from '../../app/src/main/lib/admin-text.js'
import { extractItems } from '../../app/src/main/lib/extract.js'
import { verifyRule } from '../src/main/services/rule-verifier.js'

const DIR = 'C:/Users/Park/Desktop/Automatic_generation_of_approval_requests_html/Check/아인몰'
const FILES = {
  'cart-free': join(DIR, '배송비무료', '장바구니_No.1 교육쇼핑몰 아인몰 2.0.mhtml'),
  'cart-paid': join(DIR, '배송비발생', '장바구니2_No.1 교육쇼핑몰 아인몰 2.0.mhtml'),
  'order-free': join(DIR, '배송비무료', '주문서_No.1 교육쇼핑몰 아인몰 2.0.mhtml'),
  'order-paid': join(DIR, '배송비발생', '주문서2_No.1 교육쇼핑몰 아인몰 2.0.mhtml')
}
const ANSWERS = {
  free: answerSummary(join(DIR, '배송비무료', '정답_배송비무료_아인몰.xlsx')),
  paid: answerSummary(join(DIR, '배송비발생', '정답2_배송비발생_아인몰.xlsx'))
}

function showAnswer(tag, ans) {
  const items = (ans.items || []).map(i => `${i.name} x${i.qty || 1} @${i.unitPrice}${i.isShipping ? ' [배송비]' : ''}`)
  console.log(`  정답(${tag}, ${ans.mode}): ${items.length}건`)
  for (const it of items) console.log('    -', it)
}
console.log('=== 정답 Excel 내용 ===')
showAnswer('무료', ANSWERS.free)
showAnswer('발생', ANSWERS.paid)

function join(...p) { return p.join('/') }

for (const ruleFile of ['C:/Users/Park/Downloads/ainmall-order.json', 'C:/Users/Park/Downloads/ainmall-cart.json']) {
  const rule = JSON.parse(fs.readFileSync(ruleFile, 'utf-8'))
  console.log('\n=======================================================')
  console.log('규칙:', rule.id, '|', rule.name)
  console.log('  rowSelector:', rule.rowSelector)
  console.log('  checkedOnly:', JSON.stringify(rule.checkedOnly || null))
  console.log('  optionRows:', rule.optionRows ? JSON.stringify(rule.optionRows) : '없음')
  console.log('  priceIs:', rule.priceIs || '(기본)', '| shipping:', JSON.stringify(rule.shipping || null))
  console.log('  match:', JSON.stringify(rule.match || null))

  const expectKind = /-cart$/.test(rule.id) ? 'cart' : 'order'
  for (const ship of ['free', 'paid']) {
    const key = `${expectKind}-${ship}`
    const file = FILES[key]
    const { html } = sampleHtmlText(file)
    let res
    try { res = extractItems(html, rule) } catch (e) {
      console.log(`  [${key}] 추출 예외: ${String(e.message || e)}`)
      continue
    }
    const ans = ANSWERS[ship]
    const ansItems = (ans.items || []).filter(i => !i.isShipping)
    const gotTotal = res.items.reduce((s, i) => s + (Number(i.qty) || 1) * (Number(i.unitPrice) || 0), 0)
    const ansTotal = ansItems.reduce((s, i) => s + (Number(i.qty) || 1) * (Number(i.unitPrice) || 0), 0)
    const cntOk = res.items.length === ansItems.length
    const totOk = Math.abs(gotTotal - ansTotal) <= Math.max(10, ansTotal * 0.02)
    console.log(`  [${key}] 추출 ${res.items.length}건 / 정답 ${ansItems.length}건 ${cntOk ? '✓' : '✗'} | 합계 ${gotTotal.toLocaleString('ko-KR')} / 정답 ${ansTotal.toLocaleString('ko-KR')}원 ${totOk ? '✓' : '✗'}`)
    for (const it of res.items) console.log(`    · ${it.name} x${it.qty} @${it.unitPrice}`)
    if (!cntOk || !totOk) {
      console.log('    (정답 목록)')
      for (const it of ansItems) console.log(`      - ${it.name} x${it.qty || 1} @${it.unitPrice}`)
    }
  }
}
