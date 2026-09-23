// inbox .html 캡처 파일들의 charset 라운드트립 버그 검증
// 의심: receiver decodeHtmlBuffer가 UTF-8로 재인코딩하지만 meta charset은 원본(예: euc-kr) 그대로 →
// loadDocument의 fixLazyImagesBuffer가 meta를 따라 euc-kr으로 디코딩 → 깨짐
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import iconv from 'iconv-lite'

const here = path.dirname(fileURLToPath(import.meta.url))
const inbox = path.join(process.env.APPDATA, '자동 품의 요구 생성기', 'inbox')

const out = []
for (const f of fs.readdirSync(inbox).filter(x => /\.html?$/i.test(x))) {
  const buf = fs.readFileSync(path.join(inbox, f))
  const head = buf.subarray(0, 4096).toString('latin1')
  const m = /charset\s*=\s*["']?([\w-]+)/i.exec(head)
  const sniffed = m ? m[1].toLowerCase() : null
  const hasBom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf
  const asUtf8 = iconv.decode(buf, 'utf-8')
  const utf8Hangul = (asUtf8.match(/[\uac00-\ud7a3]/g) || []).length
  const utf8Bad = (asUtf8.match(/\ufffd/g) || []).length
  // fixLazyImagesBuffer가 따르는 charset으로 디코딩한 결과 (BOM이면 utf-8)
  const eff = hasBom ? 'utf-8' : (sniffed || 'utf-8')
  let effHangul = 0
  let effMojibake = 0
  let effHead = ''
  if (iconv.encodingExists(eff)) {
    const d = iconv.decode(buf, eff)
    effHangul = (d.match(/[\uac00-\ud7a3]/g) || []).length
    effMojibake = (d.match(/([ÃÂ][\x80-\xBF]|ï¿½)/g) || []).length
    effHead = d.slice(0, 200).replace(/\s+/g, ' ')
  }
  out.push({
    fileName: f.slice(10), // 타임스탬프 제거
    size: buf.length,
    metaCharset: sniffed,
    hasBom,
    utf8Hangul,
    utf8Bad,
    effectiveCharset: eff,
    effHangul,
    effMojibake,
    effHeadSample: effHead.slice(0, 150)
  })
}

fs.writeFileSync(path.join(here, 'probe-inbox.json'), JSON.stringify(out, null, 2), 'utf-8')
console.log('written')
