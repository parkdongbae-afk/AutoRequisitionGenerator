// usage: node snippet.js <htmlFile> <regexPattern> [before=300] [after=500] [max=5]
const fs = require('fs');
const [, , file, pattern, beforeArg, afterArg, maxArg] = process.argv;
const html = fs.readFileSync(file, 'utf-8');
const re = new RegExp(pattern, 'gi');
const before = Number(beforeArg) || 300;
const after = Number(afterArg) || 500;
const max = Number(maxArg) || 5;
let m, n = 0;
while ((m = re.exec(html)) && n < max) {
  const s = Math.max(0, m.index - before);
  console.log(`--- match #${++n} @${m.index} ---`);
  console.log(html.slice(s, m.index + m[0].length + after));
  console.log('');
  if (m[0].length === 0) re.lastIndex++;
}
if (n === 0) console.log('(no match)');
