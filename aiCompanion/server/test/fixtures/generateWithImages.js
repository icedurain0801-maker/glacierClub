// 生成含内嵌图片的小样本 Excel,用于图片提取集成测试。
// xlsx(SheetJS 社区版)不支持写图片,手工拼 OOXML zip 结构。
// 运行: node test/fixtures/generateWithImages.js
const JSZip = require('jszip');
const path = require('path');
const fs = require('fs');

// 1x1 像素 PNG,红/绿/蓝三张用于区分
const PNG_RED = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
const PNG_GREEN = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const PNG_BLUE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfz0AEYBxVSF+FAAhKDveWkH6oAAAAAElFTkSuQmCC', 'base64');

// attrs: 可选,附加到开始标签上的属性字符串(如 ' editAs="oneCell"')。
// Excel 插入图片("随单元格移动但不随单元格调整大小")时默认会生成带 editAs="oneCell" 的锚点,
// 而不是无属性的裸标签,故测试夹具需要同时覆盖这两种真实形态。
function oneCellAnchor(row, col, rId, attrs = '') {
  return `<xdr:oneCellAnchor${attrs}><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="200000" cy="200000"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${row * 10 + col}" name="p${row}_${col}"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rId}"/></xdr:blipFill><xdr:spPr/></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
}

async function main() {
  const zip = new JSZip();

  zip.file('[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="png" ContentType="image/png"/>' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' +
    '</Types>');

  zip.file('_rels/.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>');

  zip.file('xl/workbook.xml',
    '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="heroes" sheetId="1" r:id="rId1"/></sheets></workbook>');

  zip.file('xl/_rels/workbook.xml.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '</Relationships>');

  // 表头 + 4 行数据: 亚瑟(无图) 妲己(1图) 后羿(2图) 庄周(无图)
  const rowsXml = [
    '<row r="1"><c r="A1" t="inlineStr"><is><t>英雄</t></is></c><c r="B1" t="inlineStr"><is><t>定位</t></is></c></row>',
    '<row r="2"><c r="A2" t="inlineStr"><is><t>亚瑟</t></is></c><c r="B2" t="inlineStr"><is><t>战士</t></is></c></row>',
    '<row r="3"><c r="A3" t="inlineStr"><is><t>妲己</t></is></c><c r="B3" t="inlineStr"><is><t>法师</t></is></c></row>',
    '<row r="4"><c r="A4" t="inlineStr"><is><t>后羿</t></is></c><c r="B4" t="inlineStr"><is><t>射手</t></is></c></row>',
    '<row r="5"><c r="A5" t="inlineStr"><is><t>庄周</t></is></c><c r="B5" t="inlineStr"><is><t>辅助</t></is></c></row>',
  ].join('');

  zip.file('xl/worksheets/sheet1.xml',
    '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheetData>${rowsXml}</sheetData><drawing r:id="rId1"/></worksheet>`);

  zip.file('xl/worksheets/_rels/sheet1.xml.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>' +
    '</Relationships>');

  // 锚点: row 是 0-based。数据行2(妲己,0-based row=2) 1张图; 数据行3(后羿,0-based row=3) 2张图
  // 妲己行的锚点特意带上 editAs="oneCell" 属性,模拟 Excel 插图后的真实默认输出形态
  // (回归测试:parseAnchors 的正则必须能匹配带属性的开始标签,否则该图会被静默丢失)
  const anchors = [
    oneCellAnchor(2, 1, 'rId1', ' editAs="oneCell"'),  // 妲己行 -> image1(带 editAs 属性)
    oneCellAnchor(3, 1, 'rId2'),  // 后羿行 -> image2
    oneCellAnchor(3, 2, 'rId3'),  // 后羿行 -> image3(第2张)
  ].join('');

  zip.file('xl/drawings/drawing1.xml',
    '<?xml version="1.0"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
    anchors + '</xdr:wsDr>');

  zip.file('xl/drawings/_rels/drawing1.xml.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image2.png"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image3.png"/>' +
    '</Relationships>');

  zip.file('xl/media/image1.png', PNG_RED);
  zip.file('xl/media/image2.png', PNG_GREEN);
  zip.file('xl/media/image3.png', PNG_BLUE);

  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  const out = path.join(__dirname, 'sample_with_images.xlsx');
  fs.writeFileSync(out, buf);
  console.log('generated', out);
}

// 导出 promise:main() 内部用了 zip.generateAsync,调用方(测试文件)懒加载时必须
// await require(...) 才能保证文件写完再读,否则会有竞态(见 2026-07-14 回归修复)。
module.exports = main();
