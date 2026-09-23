

import iconv from 'iconv-lite'

function parseHeaders(headerBlock) {
  const headers = {};
  const lines = headerBlock.split(/\r?\n/);
  let lastKey = null;
  for (const line of lines) {
    if (/^[ \t]/.test(line) && lastKey) {
      headers[lastKey] += ' ' + line.trim();
      continue;
    }
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim().toLowerCase();
      headers[key] = line.slice(idx + 1).trim();
      lastKey = key;
    }
  }
  return headers;
}

function getBoundary(contentType) {
  const m = /boundary\s*=\s*"?([^";]+)"?/i.exec(contentType || '');
  return m ? m[1] : null;
}

function getCharset(contentType) {
  const m = /charset\s*=\s*"?([^";\s]+)"?/i.exec(contentType || '');
  return m ? m[1].toLowerCase() : null;
}

function decodeQuotedPrintable(buf) {
  const out = [];
  for (let i = 0; i < buf.length; i++) {
    // soft line break: '=' at end of line
    if (buf[i] === 0x3d) {
      if (i + 1 < buf.length && (buf[i + 1] === 0x0d || buf[i + 1] === 0x0a)) {
        i += buf[i + 1] === 0x0d && buf[i + 2] === 0x0a ? 2 : 1;
        continue;
      }
      const hex = String.fromCharCode(buf[i + 1], buf[i + 2]);
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        out.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    out.push(buf[i]);
  }
  return Buffer.from(out);
}

function decodeBase64(buf) {
  const txt = buf.toString('latin1').replace(/[^A-Za-z0-9+/=]/g, '');
  return Buffer.from(txt, 'base64');
}

// 점수 = 한글×2 − U+FFFD×50 − 라틴보충 연속(mojibake 흔적)×4 : 어느 후보가 실제 인코딩인지 판별
function scoreDecoded(s) {
  if (!s) return -1e9;
  let hangul = 0;
  let bad = 0;
  let moji = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xac00 && c <= 0xd7a3) hangul++;
    else if (c === 0xfffd) bad++;
    else if (c >= 0xc0 && c <= 0xff) {
      let run = 1;
      while (i + 1 < s.length) {
        const n = s.charCodeAt(i + 1);
        if (n >= 0x80 && n <= 0xff) { run++; i++; } else break;
      }
      if (run >= 2) moji += run;
    }
  }
  return hangul * 2 - bad * 50 - moji * 4;
}

function sniffMetaCharset(htmlBuf) {
  const head = htmlBuf.subarray(0, 65536).toString('latin1');
  const m = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head)
    || /charset\s*=\s*["']?([\w-]+)/i.exec(head);
  return m ? m[1].toLowerCase() : null;
}

/**
 * 캐릭터셋 선언(헤더/meta)과 실제 바이트가 어긋나는 파일까지 안전하게 디코딩한다.
 * 후보(BOM, 선언값, 메타 스니프, utf-8, euc-kr)를 점수 비교해 가장 깨끗한 한글 텍스트를 반환.
 */
function smartDecode(buf, hintCharset) {
  const candidates = [];
  const push = (cs) => {
    if (cs && iconv.encodingExists(cs) && !candidates.includes(cs)) candidates.push(cs);
  };
  if (buf.length >= 2 && ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff))) {
    push(buf[0] === 0xff ? 'utf-16le' : 'utf-16be');
  }
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) push('utf-8');
  push(hintCharset);
  push(sniffMetaCharset(buf));
  push('utf-8');
  push('euc-kr');

  let best = null;
  let bestScore = -Infinity;
  for (const cs of candidates) {
    let decoded;
    try {
      decoded = iconv.decode(buf, cs);
    } catch {
      continue;
    }
    const text = decoded.replace(/^\ufeff/, '');
    const score = scoreDecoded(text);
    if (score > bestScore) {
      bestScore = score;
      best = text;
    }
    if (text && !text.includes('\ufffd') && score > 0) break;
  }
  if (best != null) return best;
  return iconv.decode(buf, 'utf-8');
}

function normalizeCharset(cs, htmlBuf) {
  let charset = cs;
  if (!charset || charset === 'utf-8' || charset === 'utf8') {
    if (htmlBuf.length >= 3 && htmlBuf[0] === 0xef && htmlBuf[1] === 0xbb && htmlBuf[2] === 0xbf) return 'utf-8';
    const meta = sniffMetaCharset(htmlBuf);
    if (meta) charset = meta;
    else charset = charset || 'utf-8';
  }
  return charset;
}

/**
 * MHTML 버퍼를 파싱하여 파트 목록과 메인 HTML을 반환
 * @returns {{ parts: Array<{contentType, contentLocation, transferEncoding, data: Buffer, cid}>, rootHtml: {buf: Buffer, charset: string, location: string} }}
 */
function parseMhtml(buf) {
  const text = buf.toString('latin1');
  const sepIdx = text.search(/\r?\n\r?\n/);
  const nlLen = text[sepIdx] === '\r' ? 4 : 2;
  const topHeaders = parseHeaders(text.slice(0, sepIdx));
  const body = buf.subarray(sepIdx + nlLen);

  const boundary = getBoundary(topHeaders['content-type']);
  if (!boundary) throw new Error('MHTML boundary not found');

  const delim = Buffer.from('--' + boundary);
  const parts = [];

  let pos = body.indexOf(delim);
  while (pos !== -1) {
    const after = pos + delim.length;
    // 종료 구분자 "--boundary--"
    if (body[after] === 0x2d && body[after + 1] === 0x2d) break;
    // 구분자 직후 CRLF 건너뛰기
    let p = after;
    while (p < body.length && (body[p] === 0x0d || body[p] === 0x0a)) p++;
    const nextPos = body.indexOf(delim, p);
    const partEnd = nextPos === -1 ? body.length : nextPos;
    const rawPart = body.subarray(p, partEnd);

    // 파트 헤더/본문 분리
    const partText = rawPart.toString('latin1');
    const hEnd = partText.search(/\r?\n\r?\n/);
    if (hEnd !== -1) {
      const partHeaders = parseHeaders(partText.slice(0, hEnd));
      const bodyStart = hEnd + (partText[hEnd] === '\r' ? 4 : 2);
      let data = rawPart.subarray(bodyStart);
      // 마지막 파트 개행 제거
      while (data.length && (data[data.length - 1] === 0x0a || data[data.length - 1] === 0x0d)) {
        data = data.subarray(0, data.length - 1);
      }
      const cte = (partHeaders['content-transfer-encoding'] || '').toLowerCase();
      if (cte.includes('quoted-printable')) data = decodeQuotedPrintable(data);
      else if (cte.includes('base64')) data = decodeBase64(data);

      parts.push({
        contentType: (partHeaders['content-type'] || '').split(';')[0].trim().toLowerCase(),
        rawContentType: partHeaders['content-type'] || '',
        contentLocation: partHeaders['content-location'] || '',
        cid: (partHeaders['content-id'] || '').replace(/[<>]/g, ''),
        data
      });
    }
    pos = nextPos;
  }

  // 루트 HTML: 첫 번째 text/html
  let htmlPart = parts.find(p => p.contentType === 'text/html');
  if (!htmlPart) {
    for (const p of parts) {
      if (p.contentType.startsWith('text/html')) { htmlPart = p; break; }
    }
  }
  if (!htmlPart) throw new Error('text/html part not found in MHTML');

  const charset = normalizeCharset(getCharset(htmlPart.rawContentType), htmlPart.data);
  return { parts, rootHtml: { buf: htmlPart.data, charset, location: htmlPart.contentLocation } };
}

function decodeHtml(htmlPart) {
  const cs = htmlPart.charset && iconv.encodingExists(htmlPart.charset) ? htmlPart.charset : null;
  return smartDecode(htmlPart.buf, cs);
}

export { parseMhtml, decodeHtml, parseHeaders, smartDecode };
