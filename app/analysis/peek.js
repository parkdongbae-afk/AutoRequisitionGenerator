// usage: node peek.js <fileIndex> <keyword> [contextChars]
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'decoded');
const files = fs.readdirSync(dir).sort();
const idx = parseInt(process.argv[2], 10);
const keyword = process.argv[3];
const ctx = parseInt(process.argv[4] || '1500', 10);
const file = files[idx];
const html = fs.readFileSync(path.join(dir, file), 'utf-8');
console.log(`FILE[${idx}]: ${file} (${(html.length / 1024).toFixed(0)}KB)`);
let i = -1, count = 0;
while ((i = html.indexOf(keyword, i + 1)) !== -1 && count < 5) {
  const start = Math.max(0, i - ctx / 3);
  console.log(`\n--- match ${++count} @${i} ---`);
  console.log(html.slice(start, i + ctx).replace(/\s+/g, ' '));
}
if (count === 0) console.log('NO MATCH:', keyword);
console.log('\nALL FILES:', files.map((f, n) => `${n}=${f}`).join(' | '));
