// Check\아인몰 재검증 — 수정 정답(통과) vs 원본 정답(가격 진단 실측) 비교
import fs from 'node:fs'
import { sampleHtmlText, answerSummary } from '../../app/src/main/lib/admin-text.js'
import { extractItems } from '../../app/src/main/lib/extract.js'
import { diagnosePrices } from '../src/main/services/rule-verifier.js'

const DIR = 'C:/Users/Park/Desktop/Automatic_generation_of_approval_requests_html/Check/아인몰'
const RULES = [
  { file: 'C:/Users/Park/Downloads/ainmall-order-lineTotal.json', kind: 'order' },
  { file: 'C:/Users/Park/Downloads/ainmall-cart-lineTotal.json', kind: 'cart' }
]
const CAPS = {
  'order-free': DIR + '/배송비무료/주문서_No.1 교육쇼핑몰 아인몰 2.0.mhtml',
  'order-paid': DIR + '/배송비발생/주문서2_No.1 교육쇼핑몰 아인몰 2.0.mhtml',
  'cart-free': DIR + '/배송비무료/장바구니_No.1 교육쇼핑몰 아인몰 2.0.mhtml',
  'cart-paid': DIR + '/배송비발생/장바구니2_No.1 교육쇼핑몰 아인몰 2.0.mhtml'
}
const ANSWERS = {
  fixed: answerSummary(DIR + '/배송비무료/정답_배송비무료_아인몰_수정.xlsx'),
  original: answerSummary(DIR + '/배송비발생/정답2_배송비발생_아인몰.xlsx')
}

let pass = 0
let cases = 0
for (const { file, kind } of RULES) {
  const rule = JSON.parse(fs.readFileSync(file, 'utf-8'))
  console.log('== ' + rule.id + ' (priceIs: ' + rule.priceIs + ') ==')
  for (const [key, file2] of Object.entries(CAPS)) {
    if (!key.startsWith(kind + '-')) continue
    cases++
    const { html } = sampleHtmlText(file2)
    const res = extractItems(html, rule)
    const ship = key.endsWith('free') ? 'free' : 'paid'
    const ans = ANSWERS[ship === 'free' ? 'fixed' : 'original']
    const ansItems = (ans.items || []).filter(i => !i.isShipping)
    const gotTotal = res.items.reduce((s, i) => s + (Number(i.qty) || 1) * (Number(i.unitPrice) || 0), 0)
    const ansTotal = ansItems.reduce((s, i) => s + (Number(i.qty) || 1) * (Number(i.unitPrice) || 0), 0)
    const cntOk = res.items.length === ansItems.length
    const totOk = Math.abs(gotTotal - ansTotal) <= Math.max(10, ansTotal * 0.02)
    if (cntOk && totOk) pass++
    console.log('  [' + key + '] ' + res.items.length + '건/' + ansItems.length + '건 · ' + gotTotal.toLocaleString('ko-KR') + '원/' + ansTotal.toLocaleString('ko-KR') + '원 ' + (cntOk && totOk ? '✓ PASS' : '✗ 불일치'))
    if (cntOk && !totOk) {
      const d = diagnosePrices(res.items, ansItems)
      console.log('      진단: ' + (d ? d.message : '단가 비율 불규칙 — 선택자 문제 가능성'))
    }
  }
}
console.log('\n통과: ' + pass + '/' + cases)

// 원본(부가세 포함) 무료 정답으로 대조 시 진단 메시지 실측 — 관리자 알림 기능 확인
console.log('\n=== 원본(부가세 포함) 정답 대조 시 진단 실측 ===')
const vatAnswer = answerSummary(DIR + '/배송비무료/정답_배송비무료_아인몰.xlsx')
console.log('  원본 정답: ' + vatAnswer.items.length + '건 · 총액 ' + vatAnswer.items.reduce((s, i) => s + (Number(i.qty) || 1) * (Number(i.unitPrice) || 0), 0).toLocaleString('ko-KR') + '원')
for (const { file, kind } of RULES) {
  const rule = JSON.parse(fs.readFileSync(file, 'utf-8'))
  const key = kind + '-free'
  const { html } = sampleHtmlText(CAPS[key])
  const res = extractItems(html, rule)
  if (res.items.length !== vatAnswer.items.length) { console.log('  [' + key + '] 건수 불일치 — 진단 대상 아님'); continue }
  const d = diagnosePrices(res.items, vatAnswer.items)
  console.log('  [' + key + '] ' + (d ? '진단 발생: ' + d.message : '진단 없음'))
}
