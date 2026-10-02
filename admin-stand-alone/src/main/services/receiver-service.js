/*
 * 확장 프로그램 수신 서버 (관리자 앱 §7.6 확장 연동)
 * "장바구니/주문서 저장" MV3 확장이 캡처 MHTML을 POST하면 inbox 폴더에 저장한다.
 * - 포트: 57340~57345 중 사용 가능한 것(사용자용 앱의 57330~35와 분리 — §4.2)
 * - 127.0.0.1 바인딩만 허용(외부 노출 없음), CORS는 확장 fetch용으로 최소 허용
 * - 저장 파일: <kind>_<ship>_<시각>.mhtml + <동일stem>.meta.json(화면 총액·건수 — 정답 사전 대조용)
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const PORT_CANDIDATES = [57340, 57341, 57342, 57343, 57344, 57345]
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

export function startReceiver(inboxDir, { ports = PORT_CANDIDATES, log = () => {} } = {}) {
  fs.mkdirSync(inboxDir, { recursive: true })
  const server = http.createServer((req, res) => {
    for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v)
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }

    if (req.method === 'GET' && req.url.startsWith('/ping')) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ ok: true, app: 'shopping-mall-rule-manager' }))
    }

    if (req.method === 'POST' && req.url.startsWith('/save')) {
      let body = ''
      req.on('data', d => { body += d; if (body.length > 80 * 1024 * 1024) req.destroy() })
      req.on('end', () => {
        try {
          const saved = saveCapture(inboxDir, body)
          log(`확장 캡처 수신: ${saved.filename}`)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, filename: saved.filename }))
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: String(e.message || e).slice(0, 200) }))
        }
      })
      return
    }

    res.writeHead(404)
    res.end()
  })

  return new Promise((resolve, reject) => {
    let lastErr = null
    const tryListen = i => {
      if (i >= ports.length) return reject(lastErr || new Error('사용 가능한 포트가 없습니다'))
      const port = ports[i]
      server.once('error', e => { lastErr = e; tryListen(i + 1) })
      server.listen(port, '127.0.0.1', () => {
        server.removeAllListeners('error')
        log(`확장 수신 서버 대기 중: http://127.0.0.1:${port} → ${inboxDir}`)
        resolve({ port, server, inboxDir })
      })
    }
    tryListen(0)
  })
}

export function saveCapture(inboxDir, bodyJson) {
  const body = JSON.parse(bodyJson)
  const kind = body.kind === 'order' ? '주문서' : '장바구니'
  const ship = body.ship === 'free' ? '배송비무료' : body.ship === 'paid' ? '배송비발생' : '배송비미확인'
  const ts = new Date().toISOString().replace(/[-:T]/g, '').replace(/\..+$/, '')
  const stem = `${kind}_${ship}_${ts}`
  const mhtmlPath = path.join(inboxDir, `${stem}.mhtml`)
  const buf = Buffer.from(String(body.mhtml || ''), 'base64')
  if (buf.length < 100) throw new Error('MHTML 본문이 비어 있습니다')
  fs.writeFileSync(mhtmlPath, buf)
  const meta = { ...(body.meta || {}), kind: body.kind, ship: body.ship, capturedAt: new Date().toISOString() }
  fs.writeFileSync(path.join(inboxDir, `${stem}.meta.json`), JSON.stringify(meta, null, 2) + '\n', 'utf-8')
  return { filename: path.basename(mhtmlPath), mhtmlPath, metaPath: path.join(inboxDir, `${stem}.meta.json`) }
}

export function stopReceiver(server) {
  if (server) try { server.close() } catch {}
}
