import * as cheerio from 'cheerio'
import { net } from 'electron'
import crypto from 'node:crypto'

const MAX_ASSETS = 120
const FETCH_TIMEOUT_MS = 8000
const MAX_ASSET_BYTES = 4 * 1024 * 1024

function absolutize(rawUrl, baseUrl) {
  if (!rawUrl) return null
  const u = rawUrl.trim()
  if (/^(data:|javascript:|about:|blob:|#)/i.test(u)) return null
  try {
    return new URL(u, baseUrl || 'https://capture.invalid/').href
  } catch {
    return null
  }
}

function collectAndAbsolutize(html, baseUrl) {
  const $ = cheerio.load(html)
  const urls = new Set()
  $('link[href]').each((_, el) => {
    const rel = ($(el).attr('rel') || '').toLowerCase()
    const as = ($(el).attr('as') || '').toLowerCase()
    if (rel.includes('stylesheet') || as === 'style' || as === 'font') {
      const abs = absolutize($(el).attr('href'), baseUrl)
      if (abs) { urls.add(abs); $(el).attr('href', abs) }
    }
  })
  $('img[src]').each((_, el) => {
    const abs = absolutize($(el).attr('src'), baseUrl)
    if (abs) { urls.add(abs); $(el).attr('src', abs) }
  })
  $('source[src]').each((_, el) => {
    const abs = absolutize($(el).attr('src'), baseUrl)
    if (abs) { urls.add(abs); $(el).attr('src', abs) }
  })
  const outHtml = $.html()
  const inlineCssUrls = new Set()
  for (const m of outHtml.matchAll(/url\((['"]?)(https?:\/\/[^'")]+)\1\)/gi)) {
    inlineCssUrls.add(m[2])
  }
  for (const u of inlineCssUrls) urls.add(u)
  return { outHtml, urls: [...urls].slice(0, MAX_ASSETS) }
}

// 쿠팡 assets.coupangcdn.com 등 CDN은 Referer 없는 CSS 요청을 403으로 거부한다
// (2026-09-25 실측: 무헤더 403 / Referer: 출처페이지 200) — 출처 페이지를 Referer로 보낸다.
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function assetHeaders(referer) {
  const h = { 'User-Agent': CHROME_UA }
  if (referer) h.Referer = referer
  return h
}

// net.fetch가 헤더를 전달하지 못하는 환경 대비 — net.request로 Referer를 강제로 실어 재시도한다
function fetchViaRequest(url, referer, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = net.request({ method: 'GET', url, redirect: 'follow', headers: assetHeaders(referer) })
    const chunks = []
    let settled = false
    const done = (fn, v) => { if (!settled) { settled = true; fn(v) } }
    const timer = setTimeout(() => { try { req.abort() } catch {} done(reject, new Error('timeout')) }, timeoutMs)
    req.on('response', res => {
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        clearTimeout(timer)
        const buf = Buffer.concat(chunks)
        const ct = (res.headers['content-type'] || 'application/octet-stream').split(';')[0].trim()
        done(resolve, { ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, buf, ct })
      })
    })
    req.on('error', e => { clearTimeout(timer); done(reject, e) })
    req.end()
  })
}

async function fetchAsset(url, referer) {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
    const res = await net.fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: assetHeaders(referer) })
    clearTimeout(timer)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length || buf.length > MAX_ASSET_BYTES) return null
    const ct = (res.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim()
    return { url: res.url && res.url !== url ? res.url : url, requestedUrl: url, contentType: ct, data: buf }
  } catch {
    return null
  }
}

async function fetchAssetWithReferer(url, referer) {
  const first = await fetchAsset(url, referer)
  if (first) return first
  if (!referer) return null
  try {
    const r = await fetchViaRequest(url, referer, FETCH_TIMEOUT_MS)
    if (!r.ok || !r.buf.length || r.buf.length > MAX_ASSET_BYTES) return null
    return { url, requestedUrl: url, contentType: r.ct, data: r.buf }
  } catch {
    return null
  }
}

export async function buildMhtmlFromHtml(html, sourceUrl) {
  const { outHtml, urls } = collectAndAbsolutize(html, sourceUrl)
  const referer = sourceUrl || undefined
  const fetched = (await Promise.all(urls.map(u => fetchAssetWithReferer(u, referer)))).filter(Boolean)
  const boundary = '----ArgeCaptureBoundary' + crypto.randomBytes(8).toString('hex')
  const rootLocation = sourceUrl || 'https://capture.invalid/capture.html'
  const chunks = []
  chunks.push(
    'From: <saved-by-auto-requisition-generator>\r\n' +
    'MIME-Version: 1.0\r\n' +
    `Content-Type: multipart/related; boundary="${boundary}"; type="text/html"\r\n\r\n`
  )
  chunks.push(
    `--${boundary}\r\n` +
    'Content-Type: text/html; charset="utf-8"\r\n' +
    'Content-Transfer-Encoding: binary\r\n' +
    `Content-Location: ${rootLocation}\r\n\r\n`
  )
  chunks.push(Buffer.from(outHtml, 'utf-8'))
  chunks.push(Buffer.from('\r\n'))
  const locationByRequest = new Map()
  for (const a of fetched) locationByRequest.set(a.requestedUrl, a.url)
  for (const a of fetched) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\n` +
        `Content-Type: ${a.contentType}\r\n` +
        'Content-Transfer-Encoding: binary\r\n' +
        `Content-Location: ${a.url}\r\n\r\n`
      )
    )
    chunks.push(a.data)
    chunks.push(Buffer.from('\r\n'))
  }
  const finalHtml = rewriteLocations(outHtml, locationByRequest)
  if (finalHtml !== outHtml) {
    chunks[2] = Buffer.from(finalHtml, 'utf-8')
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`))
  return Buffer.concat(chunks.filter(Boolean).map(c => (Buffer.isBuffer(c) ? c : Buffer.from(c))))
}

function rewriteLocations(html, locationByRequest) {
  let out = html
  for (const [from, to] of locationByRequest) {
    if (from !== to) out = out.split(from).join(to)
  }
  return out
}
