// 生成一个"物理文件名与逻辑顺序不一致"的样本:workbook.xml 的 <sheets> 顺序里,
// 第一个 tab 对应的物理文件是 sheet2.xml(不是 sheet1.xml)。
// 用于验证 imageExtractor 正确按逻辑顺序解析第一个 sheet,而不是硬编码 sheet1.xml。
// 运行: node test/fixtures/generateReorderedSheet.js
const JSZip = require('jszip');
const path = require('path');
const fs = require('fs');

const PNG_RED = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');

async function main() {
  const zip = new JSZip();

  zip.file('[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="png" ContentType="image/png"/>' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' +
    '</Types>');

  zip.file('_rels/.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>');

  // 关键:<sheets> 里第一个 tab("英雄表") 的 r:id 指向 rId2,
  // 而 rId2 在 workbook.xml.rels 里映射到物理文件 sheet2.xml(不是 sheet1.xml)。
  // 第二个 tab("备注表") 反而映射到 sheet1.xml。这就是"物理文件名与逻辑顺序不一致"。
  zip.file('xl/workbook.xml',
    '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets>' +
    '<sheet name="英雄表" sheetId="1" r:id="rId2"/>' +
    '<sheet name="备注表" sheetId="2" r:id="rId1"/>' +
    '</sheets></workbook>');

  zip.file('xl/_rels/workbook.xml.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '</Relationships>');

  // sheet1.xml 是"备注表"(第二个 tab,逻辑上不是第一个)——它没有 drawing
  zip.file('xl/worksheets/sheet1.xml',
    '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>备注</t></is></c></row></sheetData></worksheet>');

  // sheet2.xml 是"英雄表"(第一个 tab,逻辑上是第一个)——它有 drawing,图锚定在数据行1(0-based row=1)
  zip.file('xl/worksheets/sheet2.xml',
    '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>英雄</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>亚瑟</t></is></c></row></sheetData>' +
    '<drawing r:id="rId1"/></worksheet>');

  zip.file('xl/worksheets/_rels/sheet2.xml.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>' +
    '</Relationships>');

  zip.file('xl/drawings/drawing1.xml',
    '<?xml version="1.0"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
    '<xdr:oneCellAnchor><xdr:from><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="200000" cy="200000"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="p1"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId1"/></xdr:blipFill><xdr:spPr/></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>' +
    '</xdr:wsDr>');

  zip.file('xl/drawings/_rels/drawing1.xml.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>' +
    '</Relationships>');

  zip.file('xl/media/image1.png', PNG_RED);

  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  const out = path.join(__dirname, 'sample_reordered_sheet.xlsx');
  fs.writeFileSync(out, buf);
  console.log('generated', out);
}

// 导出 promise:main() 内部用了 zip.generateAsync,调用方(测试文件)懒加载时必须
// await require(...) 才能保证文件写完再读,否则会有竞态(见 2026-07-14 回归修复)。
module.exports = main();
