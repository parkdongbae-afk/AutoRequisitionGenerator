const fs = require('fs');
const path = require('path');
const { parseMhtml, decodeHtml } = require('../src/main/lib/mhtml');

const src = 'C:\\Users\\dongbae\\Desktop\\Automatic_generation_of_approval_requests_html\\shoping_cart\\new';
const outDir = path.join(__dirname, 'decoded-new');
fs.mkdirSync(outDir, { recursive: true });

const files = fs.readdirSync(src).filter(f => f.toLowerCase().endsWith('.mhtml'));
for (const f of files) {
  try {
    const { parts, rootHtml } = parseMhtml(fs.readFileSync(path.join(src, f)));
    const html = decodeHtml(rootHtml);
    const safe = Buffer.from(f, 'utf8').toString('hex').slice(0, 20) + '.html';
    const mapFile = path.join(outDir, 'map.json');
    const map = fs.existsSync(mapFile) ? JSON.parse(fs.readFileSync(mapFile, 'utf8')) : {};
    map[f] = safe;
    fs.writeFileSync(mapFile, JSON.stringify(map, null, 2), 'utf8');
    fs.writeFileSync(path.join(outDir, safe), html, 'utf8');
    const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
    console.log(`${f} | charset=${rootHtml.charset} | parts=${parts.length} | size=${(html.length / 1024).toFixed(0)}KB | title=${title ? title[1].trim().slice(0, 50) : '??'} | loc=${rootHtml.location.slice(0, 80)}`);
  } catch (e) {
    console.log(`${f} | ERROR: ${e.message}`);
  }
}
