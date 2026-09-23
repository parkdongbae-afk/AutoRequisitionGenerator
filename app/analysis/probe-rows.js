// 행 구조 탐색: node probe-rows.js <fileIndex> <rowSelector> [fieldHints...]
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const dir = path.join(__dirname, 'decoded');
const files = fs.readdirSync(dir).sort();
const html = fs.readFileSync(path.join(dir, files[+process.argv[2]]), 'utf-8');
const $ = cheerio.load(html);
const sel = process.argv[3];
console.log(`FILE: ${files[+process.argv[2]]} | rows(${sel}):`, $(sel).length);
$(sel).slice(0, 8).each((i, el) => {
  const row = $(el);
  const txt = row.text().replace(/\s+/g, ' ').trim();
  console.log(`\n#${i} tag=${el.tagName} class=${(el.attribs.class || '').slice(0, 60)}`);
  console.log(`   text(200): ${txt.slice(0, 200)}`);
  for (const hint of process.argv.slice(4)) {
    const f = row.find(hint);
    if (f.length) console.log(`   ${hint} x${f.length}: [${f.first().text().replace(/\s+/g, ' ').trim().slice(0, 80)}]`);
  }
});
