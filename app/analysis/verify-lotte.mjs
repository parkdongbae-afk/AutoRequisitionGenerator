// 롯데마트 규칙 검증: 정답 xls와 대조 (치킨 3@8320 / 워터 1@2000 / 배송비 3000)
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { parseMhtml, decodeHtml } from '../src/main/lib/mhtml.js'
import { extractItems, roundUpToTen } from '../src/main/lib/extract.js'
import { deriveSpec } from '../src/main/lib/spec.js'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const here = path.dirname(fileURLToPath(import.meta.url))
const dir = path.join(here, '..', '..', 'test_OK', '롯데마트')
const rule = JSON.parse(fs.readFileSync(path.join(here, '..', 'src', 'main', 'lib', 'rules', 'lottemart.json'), 'utf-8'))
const parsed = parseMhtml(fs.readFileSync(path.join(dir, '장바구니ㅣ롯데마트 제타 온라인 신선 장보기 몰.mhtml')))
const html = decodeHtml(parsed.rootHtml)
const res = extractItems(html, rule)

const out = {
  location: parsed.rootHtml.location,
  items: res.items.map(i => ({ name: i.name, qty: i.qty, unit: i.unitPrice, rounded: roundUpToTen(i.unitPrice), spec: deriveSpec(i.name, i.option) })),
  shippingFee: res.shippingFee
}

const wb = XLSX.readFile(path.join(dir, '품목내역(통합).xls'))
const ws = wb.Sheets[wb.SheetNames[0]]
out.answer = XLSX.utils.sheet_to_json(ws, { header: 1 }).slice(1, 5).map(r => [r[0], r[1], r[3], r[4]])

const itemRows = out.items
out.check = {
  itemCount: itemRows.length === 2,
  chicken: itemRows.some(i => /쉐푸드|꽈사삭|크리스피/.test(i.name) && i.qty === 3 && i.rounded === 8320),
  water: itemRows.some(i => /미네랄워터/.test(i.name) && i.qty === 1 && i.rounded === 2000),
  shipping: res.shippingFee === 3000
}

fs.writeFileSync(path.join(here, 'verify-lotte.json'), JSON.stringify(out, null, 2), 'utf-8')
console.log(JSON.stringify(out.check))
