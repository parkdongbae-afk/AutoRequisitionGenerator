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

async function fetchAsset(url) {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
    const res = await net.fetch(url, { signal: ctrl.signal, redirect: 'follow' })
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

export async function buildMhtmlFromHtml(html, sourceUrl) {
  const { outHtml, urls } = collectAndAbsolutize(html, sourceUrl)
  const fetched = (await Promise.all(urls.map(fetchAsset))).filter(Boolean)
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
