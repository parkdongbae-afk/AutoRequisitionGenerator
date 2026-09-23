const fs = require('fs');
const cheerio = require('cheerio');
const [, , file] = process.argv;
const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
const seen = new Set();
$('*').filter((_, e) => $(e).children().length === 0).each((_, e) => {
  const t = $(e).text().trim().replace(/\s+/g, ' ');
  if (/배송비|무료배송/.test(t) && t.length < 50 && !seen.has(t)) {
    seen.add(t);
    const p = [];
    let c = $(e);
    for (let i = 0; i < 5 && c.length; i++) {
      p.unshift(c.get(0).tagName + (c.attr('class') ? '.' + c.attr('class').split(/\s+/).slice(0, 2).join('.') : '') + (c.attr('id') ? '#' + c.attr('id') : ''));
      c = c.parent();
    }
    console.log('[' + t.slice(0, 40) + '] ' + p.join(' > ').slice(0, 160));
  }
});
