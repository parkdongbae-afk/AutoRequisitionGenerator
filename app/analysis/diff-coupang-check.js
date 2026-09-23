const fs = require('fs');
const cheerio = require('cheerio');
const $ = cheerio.load(fs.readFileSync('analysis/decoded-testok/coupang-testok.html', 'utf8'));

const selected = new Set(['아모스 딱풀', '기능성 아치 깔창', 'ESP32-S3 듀얼', '마이크로비트']);

$('div[id^=item_]').each((i, e) => {
  const name = $(e).find('div#name span.twc-break-all').first().text().trim();
  const isSel = [...selected].some(s => name.startsWith(s));
  const boxes = $(e).find('input[type=checkbox]');
  boxes.each((j, b) => {
    const attrs = $(b).attr();
    const cls = ($(b).attr('class') || '').split(/\s+/).filter(c => /checked|checkbox|bg-/.test(c));
    console.log(`item[${i}] sel=${isSel ? 'V' : 'X'} box[${j}] title=${(attrs.title || '').slice(0, 20)} checked=${'checked' in attrs} class~=[${cls.join(',')}]`);
  });
  // 부모 label/data-disabled 속성 확인
  $(e).find('div[data-disabled]').each((j, d) => {
    console.log(`   item[${i}] data-disabled=${$(d).attr('data-disabled')}`);
  });
});
