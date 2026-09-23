const XLSX = require('xlsx');
const path = 'C:\\Users\\dongbae\\Desktop\\Automatic_generation_of_approval_requests_html\\품목내역(통합).xls';
const wb = XLSX.readFile(path);
console.log('Sheets:', wb.SheetNames);
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  console.log(`\n=== Sheet: ${name} range=${ws['!ref']} ===`);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  rows.slice(0, 12).forEach((r, i) => console.log(i, JSON.stringify(r)));
  if (rows.length > 12) console.log(`... (${rows.length} rows total)`);
  // merges
  if (ws['!merges']) console.log('merges:', JSON.stringify(ws['!merges'].slice(0, 10)));
  if (ws['!cols']) console.log('cols:', JSON.stringify(ws['!cols']));
}
