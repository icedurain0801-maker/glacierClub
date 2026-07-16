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

function decodeXmlAttr(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function relTarget(relsXml, rId) {
  const re = new RegExp(`Id="${rId}"[^>]*Target="([^"]+)"`);
  let m = relsXml.match(re);
  if (m) return decodeXmlAttr(m[1]);
  const re2 = new RegExp(`Target="([^"]+)"[^>]*Id="${rId}"`);
  m = relsXml.match(re2);
  return m ? decodeXmlAttr(m[1]) : null;
}

function extFromPath(p) {
  const m = p.match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : 'png';
}

function parseAnchors(drawingXml) {
  const anchors = [];
  const anchorBlocks = allMatches(
    drawingXml,
    /<(?:xdr:)?(?:one|two)CellAnchor(?:\s[^>]*)?>([\s\S]*?)<\/(?:xdr:)?(?:one|two)CellAnchor>/
  );

  for (const block of anchorBlocks) {
    const body = block[1];
    const rowStr = firstMatch(body, /<(?:xdr:)?from>[\s\S]*?<(?:xdr:)?row>(\d+)<\/(?:xdr:)?row>/);
    const colStr = firstMatch(body, /<(?:xdr:)?from>[\s\S]*?<(?:xdr:)?col>(\d+)<\/(?:xdr:)?col>/);
    const embedRId = firstMatch(body, /\b(?:r:)?embed="(rId\d+)"/);
    if (rowStr != null && embedRId) {
      anchors.push({
        row: parseInt(rowStr, 10),
        col: colStr != null ? parseInt(colStr, 10) : null,
        embedRId,
      });
    }
  }

  return anchors;
}

async function extract(filePath, options = {}) {
  const keyed = options.keyed === true;
  const result = new Map();
  const buf = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buf);
  const sheets = await resolveSheets(zip);
  const targetSheets = keyed ? sheets : sheets.slice(0, 1);

  for (const sheet of targetSheets) {
    await extractSheetImages(zip, sheet, result, keyed);
  }

  return result;
}

async function extractSheetImages(zip, sheet, result, keyed) {
  const sheetXml = await readIfExists(zip, sheet.path);
  if (!sheetXml) return;

  const drawingRIds = allMatches(sheetXml, /<drawing\b[^>]*\br:id="([^"]+)"/).map(m => m[1]);
  if (drawingRIds.length === 0) return;

  const sheetRelsPath = relsPathFor(sheet.path);
  const sheetRelsXml = await readIfExists(zip, sheetRelsPath);
  if (!sheetRelsXml) return;

  for (const drawingRId of drawingRIds) {
    const drawingTarget = relTarget(sheetRelsXml, drawingRId);
    if (!drawingTarget) continue;
    const drawingPath = normalizeZipPath(parentDir(sheet.path), drawingTarget);
    const drawingXml = await readIfExists(zip, drawingPath);
    if (!drawingXml) continue;

    const drawingRelsXml = await readIfExists(zip, relsPathFor(drawingPath));
    if (!drawingRelsXml) continue;

    for (const { row, col, embedRId } of parseAnchors(drawingXml)) {
      const mediaTarget = relTarget(drawingRelsXml, embedRId);
      if (!mediaTarget) continue;
      const mediaPath = normalizeZipPath(parentDir(drawingPath), mediaTarget);
      const file = zip.file(mediaPath);
      if (!file) continue;

      const imgBuf = await file.async('nodebuffer');
      const ext = extFromPath(mediaPath);
      const key = keyed
        ? (col == null ? `${sheet.index}:${row}` : `${sheet.index}:${row}:${col}`)
        : row;
      if (!result.has(key)) result.set(key, []);
      result.get(key).push({
        buffer: imgBuf,
        ext,
        sheetIndex: sheet.index,
        sheetName: sheet.name,
        anchorRow: row,
        anchorCol: col,
      });
    }
  }
}

async function readIfExists(zip, path) {
  const f = zip.file(path);
  if (!f) return null;
  return f.async('string');
}

function normalizeZipPath(fromDir, relTarget) {
  if (!relTarget) return '';
  if (relTarget.startsWith('/')) return relTarget.replace(/^\/+/, '');
  const parts = fromDir.split('/').concat(relTarget.split('/'));
  const stack = [];
  for (const p of parts) {
    if (p === '' || p === '.') continue;
    if (p === '..') stack.pop();
    else stack.push(p);
  }
  return stack.join('/');
}

function parentDir(xmlPath) {
  const idx = xmlPath.lastIndexOf('/');
  return idx >= 0 ? xmlPath.slice(0, idx) : '';
}

function relsPathFor(xmlPath) {
  const dir = parentDir(xmlPath);
  const file = xmlPath.slice(xmlPath.lastIndexOf('/') + 1);
  return `${dir}/_rels/${file}.rels`;
}

async function resolveSheets(zip) {
  const workbookXml = await readIfExists(zip, 'xl/workbook.xml');
  if (!workbookXml) return [];
  const workbookRelsXml = await readIfExists(zip, 'xl/_rels/workbook.xml.rels');
  if (!workbookRelsXml) return [];

  const sheetsBlock = firstMatch(workbookXml, /<sheets>([\s\S]*?)<\/sheets>/);
  if (!sheetsBlock) return [];

  const sheetTags = allMatches(sheetsBlock, /<sheet\b[^>]*\/?>/);
  const sheets = [];
  for (let index = 0; index < sheetTags.length; index++) {
    const tag = sheetTags[index][0];
    const rId = firstMatch(tag, /r:id="(rId\d+)"/);
    if (!rId) continue;
    const target = relTarget(workbookRelsXml, rId);
    if (!target) continue;
    sheets.push({
      index,
      name: decodeXmlAttr(firstMatch(tag, /name="([^"]*)"/) || `Sheet${index + 1}`),
      path: normalizeZipPath('xl', target),
    });
  }
  return sheets;
}

module.exports = { extract, _parseAnchors: parseAnchors, _resolveSheets: resolveSheets };
