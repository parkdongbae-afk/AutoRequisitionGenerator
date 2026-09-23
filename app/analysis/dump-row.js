const fs = require('fs');
const cheerio = require('cheerio');
const [, , file, sel, idx, mode] = process.argv;
const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
const html = $(sel).eq(Number(idx || 0)).html() || '';
const clean = html.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ');
console.log(mode === 'full' ? clean.slice(0, 8000) : clean.slice(0, 3000));
