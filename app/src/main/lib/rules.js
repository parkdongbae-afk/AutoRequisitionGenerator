import gmarket from './rules/gmarket.json'
import gmarketCart from './rules/gmarket-cart.json'
import kyobo from './rules/kyobo.json'
import kyoboCart from './rules/kyobo-cart.json'
import aladin from './rules/aladin.json'
import aladinOrder from './rules/aladin-order.json'
import naverCart from './rules/naver-cart.json'
import naver from './rules/naver.json'
import dreamdepot from './rules/dreamdepot.json'
import dreamdepotOrder from './rules/dreamdepot-order.json'
import icecreammall from './rules/icecreammall.json'
import icecreamCart from './rules/icecream-cart.json'
import alphamall from './rules/alphamall.json'
import alphamallCart from './rules/alphamall-cart.json'
import st11 from './rules/11st.json'
import st11Cart from './rules/st11-cart.json'
import yes24 from './rules/yes24.json'
import yes24Cart from './rules/yes24-cart.json'
import teachermallCart from './rules/teachermall-cart.json'
import teachermall from './rules/teachermall.json'
import auction from './rules/auction.json'
import auctionCart from './rules/auction-cart.json'
import coupang from './rules/coupang.json'
import eleparts from './rules/eleparts.json'
import ic114 from './rules/ic114.json'
import lottemart from './rules/lottemart.json'
import officedepot from './rules/officedepot.json'
import officedepotOrder from './rules/officedepot-order.json'
import daisomall from './rules/daisomall.json'
import daisomallOrder from './rules/daisomall-order.json'
import emartmallCart from './rules/emartmall-cart.json'
import emartmall from './rules/emartmall.json'
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

// 규칙 순서 = URL 매칭 우선순위. 카트 규칙은 같은 도메인의 주문서 규칙보다 반드시 앞에.
// naver가 naver-cart보다 앞: 주문서 URL의 backUrl 쿼리에 'shopping.naver.com/cart'가
// 원문 그대로 포함되는 경우가 있어 카트 규칙이 먼저면 주문서를 잘못 잡는다
const builtin = [
  gmarketCart, kyoboCart, aladinOrder, aladin,
  gmarket, kyobo, naver, naverCart,
  dreamdepotOrder, dreamdepot, icecreamCart, icecreammall,
  alphamallCart, alphamall, st11Cart, st11,
  yes24Cart, yes24, teachermallCart, teachermall,
  auctionCart, auction, coupang,
  emartmallCart, emartmall,
  eleparts, ic114, lottemart, officedepotOrder, officedepot,
  daisomallOrder, daisomall
]

function userRulesDir() {
  return path.join(app.getPath('userData'), 'rules')
}

export function listUserRules() {
  const dir = userRulesDir()
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'))
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

export function saveUserRule(rule) {
  const dir = userRulesDir()
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${rule.id}.json`)
  fs.writeFileSync(file, JSON.stringify(rule, null, 2), 'utf-8')
  return file
}

export function deleteUserRule(id) {
  const file = path.join(userRulesDir(), `${id}.json`)
  if (fs.existsSync(file)) fs.unlinkSync(file)
  return file
}

function ruleNameOverrides() {
  try {
    return JSON.parse(fs.readFileSync(path.join(userRulesDir(), 'overrides.json'), 'utf-8'))
  } catch {
    return {}
  }
}

export function renameRule(id, name) {
  const trimmed = String(name || '').trim()
  if (!id || !trimmed) throw new Error('규칙 이름을 입력해주세요')
  fs.mkdirSync(userRulesDir(), { recursive: true })
  const file = path.join(userRulesDir(), 'overrides.json')
  const overrides = ruleNameOverrides()
  overrides[id] = trimmed
  fs.writeFileSync(file, JSON.stringify(overrides, null, 2), 'utf-8')
  return file
}

export function allRules() {
  const overrides = ruleNameOverrides()
  return [...builtin, ...listUserRules()].map(r => (overrides[r.id] ? { ...r, name: overrides[r.id] } : r))
}

export function matchRule(url) {
  const rules = allRules()
  for (const r of rules) {
    for (const pat of r.match || []) {
      if (url && url.includes(pat)) return r
    }
  }
  return null
}

export function ruleById(id) {
  return allRules().find(r => r.id === id) || null
}

export { builtin }
