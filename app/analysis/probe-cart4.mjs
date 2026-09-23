// 네이버 장바구니: 규칙 설계용 최종 확인 — info_area(상품명), option_area, input value, 셀렉터 카운트
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

// 후보 셀렉터 정확 카운트
out.selectorCounts = {
  'div[class^=product--]': $('div[class^=product--]').length,
  'div[class*=product--]': $('div[class*=product--]').length,
  '[class^=link_product--]': $('[class^=link_product--]').length,
  '[class*=title--]': $('[class*=title--]').length,
  'input[class^=number--]': $('input[class^=number--]').length,
  '[class^=product_item--]': $('[class^=product_item--]').length,
  '[class^=option_area--]': $('[class^=option_area--]').length,
  '[class*=store_price--] .price_area--': $('[class*=store_price--] [class^=price_area--]').length,
  'em[class^=price--]': $('em[class^=price--]').length,
  'span[class^=price--]': $('span[class^=price--]').length
}

// 각 product 카드에서 규칙 필드 시뮬레이션
out.rows = []
$('div[class^=product--]').each((_, el) => {
  const row = $(el)
  const title = row.find('[class^=title--]').first()
  const link = row.find('[class^=link_product--]').first()
  const input = row.find('input[class^=number--]').first()
  const em = row.find('em[class^=price--]').first()
  const spanPrice = row.find('span[class^=price--]').first()
  const opt = row.find('[class^=option_area--]').first()
  out.rows.push({
    titleText: title.text().replace(/\s+/g, ' ').trim().slice(0, 80),
    linkText: link.text().replace(/\s+/g, ' ').trim().slice(0, 80),
    inputValue: input.attr('value'),
    emPrice: em.text().trim(),
    spanPrice: spanPrice.text().trim(),
    optionHtml: opt.length ? opt.html().replace(/\s+/g, ' ').slice(0, 500) : null
  })
})

// store_price .price_area-- 각각의 텍스트 (배송비 정규 검증)
out.shippingAreas = []
$('[class*=store_price--] [class^=price_area--]').each((_, el) => {
  out.shippingAreas.push($(el).text().replace(/\s+/g, ' ').trim().slice(0, 60))
})

// title-- 내부 html (상품명 마크업 확인용, 첫 product)
out.titleHtml = $('[class^=product--]').first().find('[class^=title--]').first().html().replace(/\s+/g, ' ').slice(0, 900)

fs.writeFileSync(path.join(here, 'probe-cart4.json'), JSON.stringify(out, null, 2), 'utf-8')
console.log('written')
