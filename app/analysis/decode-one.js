// usage: node decode-one.js <mhtmlPath> <outHtmlPath>
const fs = require('fs');
const { parseMhtml, decodeHtml } = require('../src/main/lib/mhtml');

const [, , src, out] = process.argv;
const { parts, rootHtml } = parseMhtml(fs.readFileSync(src));
const html = decodeHtml(rootHtml);
fs.writeFileSync(out, html, 'utf-8');
const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
console.log(`parts=${parts.length} size=${(html.length / 1024).toFixed(0)}KB title=${title ? title[1].trim().slice(0, 60) : '??'} loc=${(rootHtml.location || '').slice(0, 80)}`);
