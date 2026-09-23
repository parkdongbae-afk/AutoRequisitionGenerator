// 네이버 장바구니 DOM 심층 분석 2차 — 행 컨테이너/상품명/수량 구조 찾기
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

// 1) price-- 클래스를 가진 요소의 조상 체인 덤프 (반복 구조 찾기)
const chains = []
$('[class*="price--"]').each((_, el) => {
  if (chains.length >= 6) return
  const t = $(el)
  if (!/^\d[\d,]*원?$/.test(t.text().trim())) return
  const chain = []
  let n = el
  for (let i = 0; i < 9 && n && n.tagName && !/html/i.test(n.tagName || ''); i++) {
    const cls = (n.attribs && n.attribs.class) || ''
    chain.push(`${n.tagName}${cls ? '.' + cls.split(/\s+/).slice(0, 2).join('.') : ''}`)
    n = n.parent
  }
  chains.push({ price: t.text().trim(), chain: chain.join(' < ') })
})
out.priceChains = chains

// 2) 클래스에 '--' 해시 패턴이 있는 모든 클래스 prefix 히스토그램
const prefixHist = {}
$('[class]').each((_, el) => {
  for (const c of (el.attribs.class || '').split(/\s+/)) {
    const m = /^([a-z_]+)--[0-9a-f]{6,}/.exec(c)
    if (m) prefixHist[m[1]] = (prefixHist[m[1]] || 0) + 1
  }
})
out.cssModulePrefixes = Object.fromEntries(Object.entries(prefixHist).sort((a, b) => b[1] - a[1]).slice(0, 40))

// 3) 상품명 후보: 긴 한국어 텍스트 리프
const names = []
$('*').each((_, el) => {
  if (el.children && el.children.length) return // 리프만
  const txt = ($(el).text() || '').trim()
  if (txt.length >= 10 && txt.length <= 60 && /[\uac00-\ud7a3]/.test(txt) && !/원$|개$/.test(txt)) {
    const cls = (el.attribs && el.attribs.class) || ''
    names.push({ tag: el.tagName, cls: cls.slice(0, 80), txt: txt.slice(0, 60) })
  }
})
out.koreanLeaves = names.slice(0, 30)

fs.writeFileSync(path.join(here, 'probe-cart2.json'), JSON.stringify(out, null, 2), 'utf-8')
console.log('written')
