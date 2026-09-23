// usage: node test-rule.js <ruleFile> <decodedHtmlFile>
// 규칙을 실제 엔진으로 검증하는 하네스
const fs = require('fs');
const path = require('path');
const { parseMhtml, decodeHtml } = require('../src/main/lib/mhtml');
const { extractItems, roundUpToTen } = require('../src/main/lib/extract');
const { deriveSpec } = require('../src/main/lib/spec');

const rule = JSON.parse(fs.readFileSync(process.argv[2], 'utf-8'));
const target = process.argv[3];
const file = fs.readFileSync(target);
let html;
if (target.toLowerCase().endsWith('.mhtml')) {
  const { rootHtml } = parseMhtml(file);
  html = decodeHtml(rootHtml);
} else {
  html = file.toString('utf-8');
}
const { items, shippingFee, countMismatch } = extractItems(html, rule);
let sum = 0;
console.log(`규칙: ${rule.id} (${rule.name})`);
console.log(`추출 항목 ${items.length}개, 배송비: ${shippingFee}${countMismatch ? ` | !! 부분저장 의심: 페이지 카운터 ${countMismatch.expected} vs 추출 ${countMismatch.actual}` : ''}`);
for (const it of items) {
  const rounded = roundUpToTen(it.unitPrice);
  const total = rounded * it.qty;
  sum += total;
  console.log(` - [${it.qty}개] ${it.name.slice(0, 50)} | 원가 ${it.unitPrice} -> 올림 ${rounded} | 소계 ${total} | 규격: ${deriveSpec(it.name, it.option) || '(없음)'}`);
}
console.log(`총액(배송비 제외): ${sum}${shippingFee ? ` + 배송비 ${shippingFee} = ${sum + shippingFee}` : ''}`);
if (items.length === 0) {
  console.log('!! 추출 0건 - 규칙 점검 필요');
  process.exitCode = 1;
}
