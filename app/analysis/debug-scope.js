// scopeOk 디버그: 합성 G마켓 문서에서 판정 추적
const cheerio = require('cheerio');

const g = (checked, fee, stamp) => `
  <div class="cart--basket">
    <div class="item"><input type="checkbox" class="input__checkbox" ${stamp ? `data-arge-checked="${stamp}"` : (checked ? 'checked' : '')}>
      <span class="item_name">상품${fee}</span><div class="item_price"><strong class="text__value">10,000</strong></div></div>
    <div class="cart--basket_footer"><div class="cart--basket--total"><div class="sub_sec delivery">
      <span class="label">배송비</span><strong class="price${fee === 0 ? ' free' : ''}">${fee === 0 ? '무료배송' : fee.toLocaleString() + '원'}</strong>
    </div></div></div>
  </div>`;
const html = `<html><body>${g(true, 3000, 'true')}${g(false, 4000, 'false')}</body></html>`;
const $ = cheerio.load(html);

const shipSel = 'div.sub_sec.delivery strong.price';
const boxSel = 'input.input__checkbox';

$('body').find(shipSel).each((i, el) => {
  console.log(`--- shipping el #${i} ---`);
  let anc = $(el).parent();
  let depth = 0;
  while (anc.length) {
    const boxes = anc.find(boxSel);
    const ships = anc.find(shipSel).toArray();
    console.log(`  depth=${depth} tag=${anc.get(0).tagName} class=${anc.attr('class')} boxes=${boxes.length} ships=${ships.length} selfInShips=${ships.includes(el)}`);
    if (boxes.length) break;
    anc = anc.parent();
    depth++;
  }
});
