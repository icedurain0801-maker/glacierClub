// 从 xlsx 内嵌图片(drawing 锚点)提取图片二进制,按数据行号分组。
// xlsx 本质是 zip;SheetJS 社区版无图片 API,用 jszip 直接读 zip 内部结构:
//   worksheet -> <drawing r:id> -> drawing rels -> drawingN.xml(锚点 row 坐标 + r:embed)
//   -> drawing rels -> media/imageN.png
// 行号换算:anchor <xdr:row> 是 0-based 且表头占 row=0,故与 excelParser 的 rowIndex(数据行,从1开始)刚好相等。
const fs = require('fs');
const JSZip = require('jszip');

function firstMatch(xml, re) {
  const m = xml.match(re);
  return m ? m[1] : null;
}

function allMatches(xml, re) {
  const out = [];
  let m;
  const r = new RegExp(re, 'g');
  while ((m = r.exec(xml))) out.push(m);
  return out;
}

// 从 <Relationship Id="rIdX" ... Target="..."/> 里按 Id 找 Target
function relTarget(relsXml, rId) {
  const re = new RegExp(`Id="${rId}"[^>]*Target="([^"]+)"`);
  let m = relsXml.match(re);
  if (m) return m[1];
  // 属性顺序可能反过来(Target 在前)
  const re2 = new RegExp(`Target="([^"]+)"[^>]*Id="${rId}"`);
  m = relsXml.match(re2);
  return m ? m[1] : null;
}

function extFromPath(p) {
  const m = p.match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : 'png';
}

// 解析单个 drawing.xml,返回 [{row, embedRId}]
function parseAnchors(drawingXml) {
  const anchors = [];
  // 同时匹配 oneCellAnchor 和 twoCellAnchor,取 <xdr:from> 内的 row + 该锚点内的 r:embed
  const anchorBlocks = allMatches(drawingXml, /<xdr:(?:one|two)CellAnchor(?:\s[^>]*)?>([\s\S]*?)<\/xdr:(?:one|two)CellAnchor>/);
  for (const block of anchorBlocks) {
    const body = block[1];
    const rowStr = firstMatch(body, /<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/);
    const embedRId = firstMatch(body, /r:embed="(rId\d+)"/);
    if (rowStr != null && embedRId) {
      anchors.push({ row: parseInt(rowStr, 10), embedRId });
    }
  }
  return anchors;
}

// 主入口:输入 xlsx 文件路径,返回 Map<rowIndex, [{buffer, ext}]>。无图返回空 Map(不抛错)。
async function extract(filePath) {
  const result = new Map();
  const buf = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buf);

  // 找第一个逻辑 sheet 的真实物理路径(不能假设是 sheet1.xml,与 excelParser 的
  // wb.SheetNames[0] 解析依据保持一致——按 workbook.xml 的 <sheets> 顺序解析)
  const sheetPath = await resolveFirstSheetPath(zip);
  if (!sheetPath) return result;

  const sheetXml = await readIfExists(zip, sheetPath);
  if (!sheetXml) return result;
  const drawingRId = firstMatch(sheetXml, /<drawing r:id="(rId\d+)"\s*\/>/);
  if (!drawingRId) return result;  // 该 sheet 没有 drawing,正常情况(无图 xlsx)

  const sheetRelsPath = relsPathFor(sheetPath);  // 如 xl/worksheets/_rels/sheet2.xml.rels
  const sheetRelsXml = await readIfExists(zip, sheetRelsPath);
  if (!sheetRelsXml) return result;
  const drawingTarget = relTarget(sheetRelsXml, drawingRId);  // 如 ../drawings/drawing1.xml
  if (!drawingTarget) return result;
  const drawingPath = normalizeZipPath('xl/worksheets', drawingTarget);  // -> xl/drawings/drawing1.xml

  const drawingXml = await readIfExists(zip, drawingPath);
  if (!drawingXml) return result;
  const anchors = parseAnchors(drawingXml);
  if (anchors.length === 0) return result;

  const drawingRelsPath = relsPathFor(drawingPath);  // xl/drawings/_rels/drawing1.xml.rels
  const drawingRelsXml = await readIfExists(zip, drawingRelsPath);
  if (!drawingRelsXml) return result;

  for (const { row, embedRId } of anchors) {
    const mediaTarget = relTarget(drawingRelsXml, embedRId);  // 如 ../media/image1.png
    if (!mediaTarget) continue;
    const mediaPath = normalizeZipPath('xl/drawings', mediaTarget);  // -> xl/media/image1.png
    const file = zip.file(mediaPath);
    if (!file) continue;
    const imgBuf = await file.async('nodebuffer');
    const ext = extFromPath(mediaPath);
    const rowIndex = row;  // 见文件头注释:anchor row 与 excelParser rowIndex 换算后相等
    if (!result.has(rowIndex)) result.set(rowIndex, []);
    result.get(rowIndex).push({ buffer: imgBuf, ext });
  }

  return result;
}

async function readIfExists(zip, path) {
  const f = zip.file(path);
  if (!f) return null;
  return f.async('string');
}

// 把 drawing/media 的相对路径(如 "../media/image1.png")相对 fromDir 解析成 zip 内的绝对路径
function normalizeZipPath(fromDir, relTarget) {
  const parts = fromDir.split('/').concat(relTarget.split('/'));
  const stack = [];
  for (const p of parts) {
    if (p === '' || p === '.') continue;
    if (p === '..') stack.pop();
    else stack.push(p);
  }
  return stack.join('/');
}

function relsPathFor(xmlPath) {
  const idx = xmlPath.lastIndexOf('/');
  const dir = xmlPath.slice(0, idx);
  const file = xmlPath.slice(idx + 1);
  return `${dir}/_rels/${file}.rels`;
}

// 解析 workbook.xml 找到第一个逻辑 sheet 对应的物理文件路径。
// 不能假设 sheet1.xml 就是第一个 tab——用户在 Excel 里重排/增删 sheet 后,
// 物理文件名与逻辑顺序可能对不上,必须按 <sheets> 元素顺序 + workbook.xml.rels 解析真实路径。
// 与 excelParser.js 用 SheetJS wb.SheetNames[0] 拿到的第一个 sheet 保持一致的解析依据。
async function resolveFirstSheetPath(zip) {
  const workbookXml = await readIfExists(zip, 'xl/workbook.xml');
  if (!workbookXml) return null;
  // <sheets> 内第一个 <sheet .../> 的 r:id(顺序即 tab 顺序)
  const sheetsBlock = firstMatch(workbookXml, /<sheets>([\s\S]*?)<\/sheets>/);
  if (!sheetsBlock) return null;
  const firstSheetTag = firstMatch(sheetsBlock, /(<sheet\b[^>]*>)/);
  if (!firstSheetTag) return null;
  const rId = firstMatch(firstSheetTag, /r:id="(rId\d+)"/);
  if (!rId) return null;

  const workbookRelsXml = await readIfExists(zip, 'xl/_rels/workbook.xml.rels');
  if (!workbookRelsXml) return null;
  const target = relTarget(workbookRelsXml, rId);  // 如 worksheets/sheet2.xml
  if (!target) return null;

  return normalizeZipPath('xl', target);  // -> xl/worksheets/sheet2.xml
}

module.exports = { extract };
