const fs = require('fs');
const path = require('path');
const { parseMhtml, decodeHtml } = require('../src/main/lib/mhtml');

const src = 'C:\\Users\\dongbae\\Desktop\\Automatic_generation_of_approval_requests_html\\shoping_cart';
const outDir = path.join(__dirname, 'decoded');
fs.mkdirSync(outDir, { recursive: true });

const files = fs.readdirSync(src).filter(f => f.toLowerCase().endsWith('.mhtml'));
for (const f of files) {
  try {
    const { parts, rootHtml } = parseMhtml(fs.readFileSync(path.join(src, f)));
    const html = decodeHtml(rootHtml);
    const safe = f.replace(/[^\w가-힣-]+/g, '_').slice(0, 30) + '.html';
    fs.writeFileSync(path.join(outDir, safe), html, 'utf-8');
    const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
    console.log(`${f} | charset=${rootHtml.charset} | parts=${parts.length} | size=${(html.length / 1024).toFixed(0)}KB | title=${title ? title[1].trim().slice(0, 40) : '??'} | loc=${rootHtml.location.slice(0, 60)}`);
  } catch (e) {
    console.log(`${f} | ERROR: ${e.message}`);
  }
}
