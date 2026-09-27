// 확장 프로그램 아이콘 생성 — 품의캡처(노랑/검정 '품'), 물품 자동 선택(노랑/검정 'V')
// 외부 의존 없이 PNG를 직접 인코딩한다(RGBA + filter 0 + zlib deflate)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const BLACK = [10, 10, 10, 255];
const inBox = (fx, fy, x1, y1, x2, y2) => fx >= x1 && fx <= x2 && fy >= y1 && fy <= y2;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const dist = (x, y, cx, cy) => Math.hypot(x - cx, y - cy);
function distToSeg(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}
function inRoundedRect(x, y, x1, y1, x2, y2, r) {
  if (x < x1 || x > x2 || y < y1 || y > y2) return false;
  const cx = Math.max(x1 + r, Math.min(x2 - r, x));
  const cy = Math.max(y1 + r, Math.min(y2 - r, y));
  return dist(x, y, cx, cy) <= r;
}
function draw(size, bg, symbol) {
  const s = size / 128; // 128 기준 좌표 스케일
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x + 0.5) / s, fy = (y + 0.5) / s;
      let col = [0, 0, 0, 0];
      if (inRoundedRect(fx, fy, 4, 4, 124, 124, 24)) col = hex(bg);
      const out = symbol(fx, fy, col);
      const o = (y * size + x) * 4;
      px[o] = out[0]; px[o + 1] = out[1]; px[o + 2] = out[2]; px[o + 3] = out[3];
    }
  }
  return px;
}

// 물품 자동 선택 — 노랑 배경 + 검정 'V'
const YELLOW = '#FFCC00';
const vee = (fx, fy, col) => {
  const d = Math.min(distToSeg(fx, fy, 30, 28, 64, 100), distToSeg(fx, fy, 64, 100, 98, 28));
  if (d <= 15) return BLACK;
  return col;
};

// 품의캡처 — 노랑 배경 + 검정 '품'(사각형 조합: 두 칸 창 + 가로 막대 + 박스)
const pum = (fx, fy, col) => {
  const b = 7.5;
  // 품 윗부분: 외곽 사각 + 중앙 세로막대 = 두 칸 창
  if (inBox(fx, fy, 34, 22, 94, 55)) {
    const inner = fx > 34 + b && fx < 94 - b && fy > 22 + b && fy < 55 - b;
    const divider = fx >= 60.25 && fx <= 67.75;
    if (!inner || divider) return BLACK;
  }
  // 중앙 가로 막대
  if (inBox(fx, fy, 30, 60, 98, 69)) return BLACK;
  // 품 아랫부분: 박스 + 안쪽 선반
  if (inBox(fx, fy, 34, 73, 94, 106)) {
    const inner = fx > 34 + b && fx < 94 - b && fy > 73 + b && fy < 106 - b;
    const shelf = inBox(fx, fy, 34 + b, 85, 94 - b, 92);
    if (!inner || shelf) return BLACK;
  }
  return col;
};

function writeSet(dir, symbol, bg) {
  fs.mkdirSync(dir, { recursive: true });
  const big = draw(128, bg, symbol);
  fs.writeFileSync(path.join(dir, 'icon128.png'), encodePng(128, big));
  for (const size of [48, 16]) {
    const s = size / 128;
    const px = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const x0 = Math.floor(x / s), y0 = Math.floor(y / s);
        const o = (y * size + x) * 4, i = (y0 * 128 + x0) * 4;
        px[o] = big[i]; px[o + 1] = big[i + 1]; px[o + 2] = big[i + 2]; px[o + 3] = big[i + 3];
      }
    }
    fs.writeFileSync(path.join(dir, `icon${size}.png`), encodePng(size, px));
  }
  console.log('icons written:', dir);
}

writeSet(path.join(__dirname, '..', 'extension-autoselect', 'icons'), vee, YELLOW);
writeSet(path.join(__dirname, '..', 'extension', 'icons'), pum, YELLOW);
