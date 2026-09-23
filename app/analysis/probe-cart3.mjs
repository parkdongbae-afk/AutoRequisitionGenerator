// 네이버 장바구니: product 카드 1개의 실제 HTML 덤프 + store_card/수량 컨트롤 구조
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseMhtml, decodeHtml } from '../src/main/lib/mhtml.js'
import * as cheerio from 'cheerio'

const here = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(here, '..', '..', 'shoping_cart', '장바구니.mhtml')
const parsed = parseMhtml(fs.readFileSync(file))
const html = decodeHtml(parsed.rootHtml)
const $ = cheerio.load(html)
const out = {}

// 1) 첫 product 카드 내부 (상품명/단가 위치 확인)
out.productCount = $('[class*=product--]').length
out.firstProductHtml = $('[class*=product--]').first().html().replace(/\s+/g, ' ').slice(0, 3000)

// 2) 수량 컨트롤러
out.numberControllers = []
$('[class*=number_controller--]').each((i, el) => {
  if (i >= 2) return
  out.numberControllers.push($(el).html().replace(/\s+/g, ' ').slice(0, 800))
})

// 3) store_price (배송비) 영역
out.storePrices = []
$('[class*=store_price--]').each((i, el) => {
  if (i >= 2) return
  out.storePrices.push($(el).html().replace(/\s+/g, ' ').slice(0, 600))
})

// 4) 상점 카드 개수 (배송비 단위)
out.storeCardCount = $('[class*=store_card--]').length

fs.writeFileSync(path.join(here, 'probe-cart3.json'), JSON.stringify(out, null, 2), 'utf-8')
console.log('written')
