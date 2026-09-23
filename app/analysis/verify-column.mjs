// 열(column) 구분 쇼핑몰 추출 엔진 검증 — 상품이 가로(열)로 나열된 표
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractItems, roundUpToTen } from '../src/main/lib/extract.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<table class="cart" border="1">
<tr><td>구분</td><td>문구A</td><td>문구B</td><td>문구C</td></tr>
<tr><td>상품명</td><td>모조색종이 100매</td><td>물풀 500g</td><td>안전가위 (학생용)</td></tr>
<tr><td>수량</td><td>3</td><td>2</td><td>1</td></tr>
<tr><td>주문금액</td><td>9,000원</td><td>4,000원</td><td>2,500원</td></tr>
<tr><td>배송비</td><td colspan="3">2,500원</td></tr>
</table></body></html>`

const rule = {
  orientation: 'column',
  tableSelector: 'table.cart',
  firstProductCol: 1,
  nameRow: 1,
  qtyRow: 2,
  priceRow: 3,
  shippingRow: 4,
  priceIs: 'lineTotal'
}

const res = extractItems(html, rule)
const out = {
  items: res.items.map(i => ({ name: i.name, qty: i.qty, unit: i.unitPrice, rounded: roundUpToTen(i.unitPrice) })),
  shipping: res.shippingFee,
  check: {
    three: res.items.length === 3,
    paper: res.items[0] && res.items[0].name === '모조색종이 100매' && res.items[0].qty === 3 && res.items[0].unitPrice === 3000,
    glue: res.items[1] && res.items[1].name === '물풀 500g' && res.items[1].qty === 2 && res.items[1].unitPrice === 2000,
    scissors: res.items[2] && res.items[2].name === '안전가위 (학생용)' && res.items[2].qty === 1 && res.items[2].unitPrice === 2500,
    shipping: res.shippingFee === 2500
  }
}
fs.writeFileSync(path.join(here, 'verify-column.json'), JSON.stringify(out, null, 2), 'utf-8')
console.log(JSON.stringify(out.check))
