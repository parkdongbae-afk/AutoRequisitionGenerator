// 사업관리카드(예산).xls 구조 덤프
const XLSX = require('xlsx');
const path = require('path');

const file = 'C:\\Users\\Park\\Desktop\\Automatic_generation_of_approval_requests_html (1)\\Automatic_generation_of_approval_requests_html\\Proposal\\사업관리카드(예산).xls';
const wb = XLSX.readFile(file);
console.log('=== Sheets:', wb.SheetNames);
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  console.log(`\n=== Sheet: ${name}  range=${ws['!ref']}  merges=${(ws['!merges']||[]).length}`);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  rows.forEach((r, i) => {
    const cells = r.map(c => String(c).replace(/\r?\n/g, '\\n'));
    // 비어있지 않은 행만 출력하되 행번호 유지
    if (cells.some(c => c.trim() !== '')) {
      console.log(`R${String(i).padStart(3)}: ${JSON.stringify(cells)}`);
    } else {
      console.log(`R${String(i).padStart(3)}: (empty)`);
    }
  });
}
