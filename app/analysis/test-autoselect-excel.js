// 물품 자동 선택 — 행정실용 시트 생성·판독 검증 (AUTO_SELECT.MD §5)
// usage: node analysis/test-autoselect-excel.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const XLSX = require('xlsx');
const { createNewWorkbook, appendRows, writeAdminSheet } = require('../src/main/lib/excel');
const { extractProductKey } = require('../src/main/lib/extract');

const results = [];
function check(name, ok, detail) { results.push({ name, ok, detail }); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoselect-'));
const xlsPath = path.join(tmp, '홍길동-품목내역(통합).xls');

const ROWS = [
  { name: '복사용지 A4', spec: '80g', unit: '개', qty: 2, price: 25000, isShipping: false,
    productUrl: 'https://item.gmarket.co.kr/Item?goodscode=1234567', option: '80g, 1박스',
    productKey: '1234567', mallName: 'G마켓', rowId: 'r1' },
  { name: '모니터 받침대', spec: '', unit: '개', qty: 1, price: 19800, isShipping: false,
    productUrl: 'https://product.11st.co.kr/products/7654321', option: '',
    productKey: '7654321', mallName: '11번가', rowId: 'r2' },
  { name: '배송비', spec: '', unit: '식', qty: 1, price: 3000, isShipping: true, rowId: 'r3' }
];

createNewWorkbook(xlsPath);
appendRows(xlsPath, ROWS, { backup: false });
const admin = writeAdminSheet(xlsPath, { rows: ROWS, teacherName: '홍길동', appVersion: '1.47.0' });
check('행정실용 rowCount=2(배송비 제외)', admin.rowCount === 2, admin);

let wb = XLSX.readFile(xlsPath);
check('행정실용 시트 존재', wb.SheetNames.includes('행정실용'), wb.SheetNames);
check('품목내역 시트 유지', wb.SheetNames.includes('품목내역'), wb.SheetNames);
const ws = wb.Sheets['행정실용'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
check('헤더 10열', JSON.stringify(rows[0]) === JSON.stringify(['상품 URL', '수량', '옵션', '기준 단가', '상품명', '쇼핑몰', '상품 키', '판매자', '원본 행 ID', '스키마 버전']), rows[0]);
check('데이터 2행', rows.length === 3, rows.length);
check('A열 상품 URL', rows[1][0] === 'https://item.gmarket.co.kr/Item?goodscode=1234567' && rows[2][0] === 'https://product.11st.co.kr/products/7654321', [rows[1][0], rows[2][0]]);
check('B열 수량', rows[1][1] === 2 && rows[2][1] === 1, [rows[1][1], rows[2][1]]);
check('C열 옵션(빈 옵션은 빈칸)', rows[1][2] === '80g, 1박스' && rows[2][2] === '', [rows[1][2], rows[2][2]]);
check('D열 기준 단가', rows[1][3] === 25000 && rows[2][3] === 19800, [rows[1][3], rows[2][3]]);
check('E~G열 메타(상품명·쇼핑몰·키)', rows[1][4] === '복사용지 A4' && rows[1][5] === 'G마켓' && rows[1][6] === '1234567', [rows[1][4], rows[1][5], rows[1][6]]);
check('J열 스키마 버전', rows[1][9] === 'AUTO_SELECT_V1' && rows[2][9] === 'AUTO_SELECT_V1', [rows[1][9], rows[2][9]]);
check('배송비 행 미포함', !JSON.stringify(rows).includes('배송비'), null);

check('_AUTO_SELECT_META 시트 존재', wb.SheetNames.includes('_AUTO_SELECT_META'), wb.SheetNames);
const metaRows = XLSX.utils.sheet_to_json(wb.Sheets['_AUTO_SELECT_META'], { header: 1, defval: null });
const meta = Object.fromEntries(metaRows.slice(1).filter(r => r && r[0]).map(r => [r[0], r[1]]));
check('메타 schema', meta.schema === 'AUTO_SELECT_V1', meta);
check('메타 teacherName', meta.teacherName === '홍길동', meta);
check('메타 rowCount', String(meta.rowCount) === '2', meta);

const ROWS2 = ROWS.slice(0, 1);
const admin2 = writeAdminSheet(xlsPath, { rows: ROWS2, teacherName: '홍길동', appVersion: '1.47.0' });
wb = XLSX.readFile(xlsPath);
check('재갱신 시 시트 중복 없음', wb.SheetNames.filter(n => n === '행정실용').length === 1 && wb.SheetNames.filter(n => n === '_AUTO_SELECT_META').length === 1, wb.SheetNames);
const rows2 = XLSX.utils.sheet_to_json(wb.Sheets['행정실용'], { header: 1, defval: null });
check('재갱신 rowCount=1', admin2.rowCount === 1 && rows2.length === 2, [admin2.rowCount, rows2.length]);

const wsBack = XLSX.readFile(xlsPath).Sheets['행정실용'];
const cols = wsBack['!cols'] || [];
const hiddenFlags = cols.map(c => !!(c && c.hidden));
check('숨김 열 플래그 D~J(파일 형식이 지원하는 경우)', cols.length === 0 || hiddenFlags.slice(3, 10).every(Boolean), hiddenFlags);

check('쿼리형 상품키(goodscode)', extractProductKey('https://item.gmarket.co.kr/Item?goodscode=1234567&ver=1') === '1234567', null);
check('쿼리형 상품키(product_no)', extractProductKey('https://buy.example.com/cart?product_no=99&utm_source=x') === '99', null);
check('경로형 상품키(쿠팡)', extractProductKey('https://www.coupang.com/vp/products/78411233?q=x') === '78411233', null);
check('상품키 없음', extractProductKey('https://www.example.com/list?page=2') === null, null);

let pass = 0, fail = 0;
for (const r of results) { if (r.ok) pass++; else { fail++; console.log('FAIL:', r.name, JSON.stringify(r.detail)); } }
console.log(`test-autoselect-excel: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exitCode = 1;
