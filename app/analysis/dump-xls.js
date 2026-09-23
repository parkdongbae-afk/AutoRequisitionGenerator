// usage: node dump-xls.js <xlsPath>
const XLSX = require('xlsx');
const path = process.argv[2];
const wb = XLSX.readFile(path);
console.log('Sheets:', wb.SheetNames);
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  console.log(`\n=== Sheet: ${name} range=${ws['!ref']} ===`);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  rows.slice(0, 30).forEach((r, i) => console.log(i, JSON.stringify(r)));
  if (rows.length > 30) console.log(`... (${rows.length} rows total)`);
}
