const fs = require('fs');
const path = require('path');
const { parseMhtml, decodeHtml } = require('../src/main/lib/mhtml');
const { extractItems } = require('../src/main/lib/extract');

const rulesDir = path.join(__dirname, '..', 'src', 'main', 'lib', 'rules');
const rules = fs.readdirSync(rulesDir).map(f => JSON.parse(fs.readFileSync(path.join(rulesDir, f), 'utf8')));
const newDir = 'C:\\Users\\dongbae\\Desktop\\Automatic_generation_of_approval_requests_html\\shoping_cart\\new';

for (const f of fs.readdirSync(newDir).filter(f => /\.mhtml$/i.test(f))) {
  const { rootHtml } = parseMhtml(fs.readFileSync(path.join(newDir, f)));
  const html = decodeHtml(rootHtml);
  console.log('='.repeat(80));
  console.log(f);
  for (const r of rules) {
    try {
      const { items, shippingFee } = extractItems(html, r);
      if (items.length > 0) {
        console.log(`  [${r.id}] items=${items.length} shipping=${shippingFee}`);
        for (const it of items.slice(0, 3)) console.log(`    - ${it.qty}개 ${String(it.name).slice(0, 40)} @${it.unitPrice}`);
      }
    } catch (e) { /* skip */ }
  }
}
