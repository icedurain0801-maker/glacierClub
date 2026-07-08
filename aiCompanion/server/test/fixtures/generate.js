// 生成小样本 Excel 用于集成测试。运行：node test/fixtures/generate.js
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const rows = [
  ['英雄', '定位', '克制', '推荐出装'],
  ['亚瑟',  '战士',  '妲己',   '不祥征兆'],
  ['妲己',  '法师',  '亚瑟',   '回响法杖'],
  ['后羿',  '射手',  '妲己',   '破晓'],
  ['庄周',  '辅助',  '',       '极寒风暴'],
];

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(rows);
XLSX.utils.book_append_sheet(wb, ws, 'heroes');
const out = path.join(__dirname, 'sample.xlsx');
fs.mkdirSync(path.dirname(out), { recursive: true });
XLSX.writeFile(wb, out);
console.log('generated', out);
