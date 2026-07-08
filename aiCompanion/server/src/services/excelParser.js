// Excel 解析：读取 xlsx/xls/csv，返回表头 + 逐行迭代器。
// 每行 → { rowIndex, obj:{列名:值}, content:'列名: 值\n列名: 值...' }
const XLSX = require('xlsx');

// 打开文件，返回 {sheetName, headers, rowCount, iterate()} 其中 iterate 是生成器
function open(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (rows.length === 0) return { sheetName, headers: [], rowCount: 0, iterate: function* () {} };

  const headers = rows[0].map(h => String(h == null ? '' : h).trim());
  const dataRows = rows.slice(1);
  const rowCount = dataRows.length;

  function* iterate() {
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const obj = {};
      for (let c = 0; c < headers.length; c++) {
        const key = headers[c] || `col${c}`;
        obj[key] = row[c] == null ? '' : row[c];
      }
      // 「列名: 值」逐行拼成自然语言文本
      const content = headers
        .map((h, c) => `${h || 'col' + c}: ${row[c] == null ? '' : row[c]}`)
        .join('\n');
      yield { rowIndex: i + 1, obj, content };
    }
  }

  return { sheetName, headers, rowCount, iterate };
}

module.exports = { open };
