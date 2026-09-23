import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import iconv from 'iconv-lite'
import { buildBookmarklet } from './bookmarklet.js'
import { buildMhtmlFromHtml } from './mhtmlsave.js'
import { smartDecode } from './mhtml.js'

const HOST = '127.0.0.1'
const PORT_CANDIDATES = [57330, 57331, 57332, 57333, 57334, 57335]
// 북마크 정체성은 항상 57330 캐노니컬 URL로 통일 — 실제 바인드 포트를 내보내면
// 확장 self-heal이 포트별로 다른 URL의 북마크를 계속 새로 만들어 중복이 늘어남
const BOOKMARKLET_PORT = 57330

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (e) => {
      server.removeListener('error', onError)
      reject(e)
    }
    server.once('error', onError)
    server.listen(port, HOST, () => {
      server.removeListener('error', onError)
      resolve(port)
    })
  })
}

function decodeHtmlBuffer(buf) {
  // 북마크릿 fetch 본문은 항상 UTF-8 — 원본 페이지의 euc-kr meta 라벨을 그대로 믿으면
  // UTF-8 바이트를 euc-kr로 읽어 저장 시점부터 글자가 깨진다. smartDecode로 판별 후
  // meta 선언도 utf-8로 재기록해 이후 파일 열 때 다시 잘못 읽지 않게 한다.
  const html = smartDecode(buf, null)
  const normalized = html
    .replace(/<meta([^>]+)charset\s*=\s*["']?[\w-]+["']?/i, '<meta$1charset="utf-8"')
    .replace(/(<meta[^>]+content=["'][^"']*charset=)[\w-]+/i, '$1utf-8')
  return iconv.encode(normalized, 'utf-8')
}

function installPage(port) {
  const bm = buildBookmarklet(port)
  const safeBm = bm.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  const manual = safeBm.replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><title>품의 생성기 - 원클릭 캡처 설치</title>
<style>
body{font-family:'Malgun Gothic',sans-serif;max-width:720px;margin:40px auto;padding:0 20px;color:#1e293b}
.bm{display:inline-block;background:#2563eb;color:#fff;padding:14px 28px;border-radius:10px;font-size:16px;font-weight:bold;text-decoration:none;cursor:grab;border:3px dashed #93c5fd}
.step{background:#f1f5f9;border-radius:10px;padding:16px 20px;margin:14px 0}
h1{font-size:22px} h2{font-size:16px;margin-top:28px}
code{background:#e2e8f0;padding:2px 6px;border-radius:4px}
.warn{background:#fefce8;border:1px solid #fde047;padding:10px 14px;border-radius:8px;font-size:13px}
</style></head><body>
<h1>🛒 품의 생성기 - 원클릭 캡처 설치</h1>
<p>아래 파란 버튼을 <b>북마크바(즐겨찾기 모음)로 드래그</b>하세요. 이후 쇼핑몰 주문/장바구니 화면에서 버튼 <b>한 번 클릭</b>하면 품의 생성기로 자동 전송됩니다.</p>
<div class="step">
  1. 아래 버튼을 브라우저 상단 북마크바로 드래그<br>
  2. 쇼핑몰 주문서 페이지에서 북마크바의 <b>🛒품의캡처</b> 클릭<br>
  3. 품의 생성기 앱에 자동으로 추가됩니다 (앱 실행 중이어야 함)
</div>
<p style="text-align:center;margin:30px 0"><a class="bm" href="${safeBm}" draggable="true" onclick="alert('드래그하여 북마크바에 놓으세요 (클릭 X)');return false">🛒품의캡처</a></p>
<p class="warn">앱의 <b>[북마크바 추가]</b> 버튼을 누르면 드래그 없이 자동으로 북마크바 제일 앞에 등록됩니다.</p>
<h2>드래그가 안 될 때 (수동 등록)</h2>
<div class="step">북마크 관리자(Ctrl+Shift+O) → 새 북마크 추가 → 이름 <code>🛒품의캡처</code>, URL에 아래 전체 붙여넣기:<br>
<textarea readonly style="width:100%;height:110px;margin-top:8px;font-size:11px" onclick="this.select()">${manual}</textarea>
</div>
<h2>확장프로그램 방식(Edge·웨일·구버전 Chrome)</h2>
<div class="step">품의 생성기 앱의 <b>[🧩 익스텐션 추가]</b> 버튼을 누르면 안내에 따라 자동 로드할 수 있습니다.</div>
</body></html>`
}

export async function startReceiver({ onCapture }) {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Filename, X-Source-Url')
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      return res.end()
    }
    if (req.method === 'GET' && req.url === '/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ ok: true, app: 'auto-requisition-generator' }))
    }
    if (req.method === 'GET' && req.url === '/bookmark-info') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ ok: true, name: '🛒품의캡처', url: buildBookmarklet(BOOKMARKLET_PORT) }))
    }
    if (req.method === 'GET' && (req.url === '/install' || req.url.startsWith('/install?'))) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      return res.end(installPage(BOOKMARKLET_PORT))
    }
    if (req.method === 'POST' && (req.url === '/mhtml' || req.url === '/html')) {
      const chunks = []
      req.on('data', c => chunks.push(c))
      req.on('end', () => {
        (async () => {
          try {
            let buf = Buffer.concat(chunks)
            if (!buf.length) throw new Error('empty body')
            const isHtml = req.url === '/html'
            if (isHtml) buf = decodeHtmlBuffer(buf)
            const rawName = req.headers['x-filename'] || (isHtml ? 'capture.html' : 'capture.mhtml')
            const safe = decodeURIComponent(String(rawName)).replace(/[\\/:*?"<>|\r\n]/g, '_').slice(0, 80)
            const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(11, 19)
            const dir = globalThis.__inboxDir
            fs.mkdirSync(dir, { recursive: true })
            const base = `${stamp}_${safe.replace(/\.(mhtml|html|htm)$/i, '')}`
            let sourceUrl = ''
            if (req.headers['x-source-url']) {
              try { sourceUrl = decodeURIComponent(String(req.headers['x-source-url'])) } catch { sourceUrl = String(req.headers['x-source-url']) }
            }
            let file
            if (isHtml) {
              let converted = null
              try { converted = await buildMhtmlFromHtml(buf.toString('utf-8'), sourceUrl) } catch {}
              if (converted && converted.length > 100) {
                file = path.join(dir, `${base}.mhtml`)
                fs.writeFileSync(file, converted)
              } else {
                file = path.join(dir, `${base}.html`)
                fs.writeFileSync(file, buf)
              }
            } else {
              file = path.join(dir, `${base}.mhtml`)
              fs.writeFileSync(file, buf)
            }
            if (sourceUrl) fs.writeFileSync(path.join(dir, `${base}.url.txt`), sourceUrl, 'utf-8')
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true, file }))
            onCapture && onCapture(file, sourceUrl)
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: String(e.message || e) }))
          }
        })()
      })
      return
    }
    res.writeHead(404)
    res.end()
  })
  for (const port of PORT_CANDIDATES) {
    try {
      const bound = await listen(server, port)
      return { server, port: bound }
    } catch (e) {
      if (e.code !== 'EADDRINUSE') throw e
    }
  }
  server.close()
  return { server: null, port: null }
}
