const XLSX = require('xlsx');

function cellText(cell) {
  if (!cell) return '';
  if (cell.w != null) return String(cell.w);
  if (cell.v instanceof Date) return cell.v.toISOString();
  if (cell.v != null) return String(cell.v);
  return '';
}

function isBlank(value) {
  return String(value == null ? '' : value).trim() === '';
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getMergedCell(ws, merges, r, c) {
  for (const merge of merges) {
    if (r >= merge.s.r && r <= merge.e.r && c >= merge.s.c && c <= merge.e.c) {
      return ws[XLSX.utils.encode_cell(merge.s)];
    }
  }
  return null;
}

function getCellText(ws, merges, r, c) {
  const direct = ws[XLSX.utils.encode_cell({ r, c })];
  const text = cellText(direct);
  if (!isBlank(text)) return text;
  return cellText(getMergedCell(ws, merges, r, c));
}

function rowValues(ws, merges, range, r) {
  const values = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    values.push(getCellText(ws, merges, r, c));
  }
  return values;
}

function columnValues(ws, merges, range, c) {
  const values = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    values.push(getCellText(ws, merges, r, c));
  }
  return values;
}

function nonBlankCount(values) {
  return values.reduce((count, value) => count + (isBlank(value) ? 0 : 1), 0);
}

function uniqueRowTexts(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const text = String(value == null ? '' : value).trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function makeRowMeta(ws, merges, range, r) {
  const values = rowValues(ws, merges, range, r);
  const uniqueTexts = uniqueRowTexts(values);
  return {
    r,
    values,
    uniqueTexts,
    nonBlank: nonBlankCount(values),
  };
}

function makeColMeta(ws, merges, range, c) {
  const values = columnValues(ws, merges, range, c);
  const texts = values
    .map(value => String(value == null ? '' : value).trim())
    .filter(Boolean);
  return {
    c,
    values,
    nonBlank: texts.length,
    avgLen: average(texts.map(text => text.length)),
    shortRatio: texts.length ? texts.filter(text => text.length <= 24).length / texts.length : 0,
    longRatio: texts.length ? texts.filter(text => text.length >= 40).length / texts.length : 0,
  };
}

function normalizeSignal(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()（）【】[\]<>:：/_-]/g, '');
}

const TRANSPOSE_NAME_LABEL_SET = new Set([
  '名称',
  '名字',
  'title',
  'name',
  'skillname',
  'hero技能名称',
  '英雄技能名称',
  '技能名称',
  '技能名字',
]);

function buildTransposeLabel(values) {
  const texts = uniqueRowTexts(values);
  return texts.join(' / ');
}

function isFieldLikeLabel(text) {
  const value = String(text || '').trim();
  if (!looksLikeLabel(value)) return false;
  const normalized = normalizeSignal(value);
  if (!normalized) return false;
  if (TRANSPOSE_NAME_LABEL_SET.has(normalized)) return true;
  if (/(icon|image|img|picture|name|title|effect|desc|description|type|rarity|skill|star|level|tag|note|remark|cost|cooldown|cd|url|link|path)/.test(normalized)) return true;
  if (/(名称|名字|效果|描述|说明|属性|类型|图标|图片|头像|品质|职业|阵营|标签|技能|等级|星|稀有|花费|消耗|冷却|链接|地址|备注|条件|范围|目标|数值|伤害|治疗|护盾|增益|减益)/.test(value)) return true;
  return false;
}

function isTransposeNameLabel(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  const normalized = normalizeSignal(value);
  if (TRANSPOSE_NAME_LABEL_SET.has(normalized)) return true;
  if (/(skillname|hero技能名称|英雄技能名称|技能名称|名称|名字)/.test(normalized)) return true;
  if (/^(name|title)$/.test(normalized)) return true;
  return false;
}

function isViableRecordName(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (text.length > 80) return false;
  if (/^https?:\/\//i.test(text)) return false;
  if (/^\\\\/.test(text)) return false;
  if (!/[A-Za-z\u00C0-\u024F\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(text)) return false;
  return true;
}

function detectTransposeMode(ws, merges, range, rowMetas, colMetas) {
  const columnCount = range.e.c - range.s.c + 1;
  if (columnCount < 3) return null;

  const maxLabelCols = Math.min(3, columnCount - 1);
  const maxScanRow = Math.min(range.e.r, range.s.r + 15);

  for (let labelCols = 1; labelCols <= maxLabelCols; labelCols++) {
    const labelColMeta = colMetas[labelCols - 1];
    if (!labelColMeta || labelColMeta.nonBlank < 3 || labelColMeta.shortRatio < 0.6) continue;

    for (let r = range.s.r; r <= maxScanRow; r++) {
      const rowMeta = rowMetas[r - range.s.r];
      const label = buildTransposeLabel(rowMeta.values.slice(0, labelCols));
      if (!isTransposeNameLabel(label)) continue;

      const dataCols = [];
      for (let c = range.s.c + labelCols; c <= range.e.c; c++) {
        const name = getCellText(ws, merges, r, c);
        if (isViableRecordName(name)) dataCols.push(c);
      }
      if (dataCols.length < 2) continue;

      const labelRows = [];
      for (let rr = range.s.r; rr <= range.e.r; rr++) {
        const candidate = rowMetas[rr - range.s.r];
        const rowLabel = buildTransposeLabel(candidate.values.slice(0, labelCols));
        const populatedDataCells = dataCols.reduce(
          (count, c) => count + (isBlank(getCellText(ws, merges, rr, c)) ? 0 : 1),
          0
        );
        if (!rowLabel) continue;
        if (rr !== r && populatedDataCells === 0) continue;
        labelRows.push({ r: rr, label: rowLabel, populatedDataCells });
      }

      if (labelRows.length < 3) continue;
      const fieldLikeRows = labelRows.filter(item => isFieldLikeLabel(item.label));
      if (fieldLikeRows.length < 3 || fieldLikeRows.length / labelRows.length < 0.6) continue;

      return {
        labelCols,
        labelStartCol: range.s.c,
        labelEndCol: range.s.c + labelCols - 1,
        nameRow: r,
        nameLabel: label,
        dataCols,
        startRow: labelRows[0].r,
        endRow: labelRows[labelRows.length - 1].r,
        rowLabels: new Map(labelRows.map(item => [item.r, item.label])),
        headers: labelRows.map(item => item.label),
      };
    }
  }

  return null;
}

function detectHeaderRow(ws, merges, range) {
  let firstNonBlank = -1;
  const end = Math.min(range.e.r, range.s.r + 20);

  for (let r = range.s.r; r <= end; r++) {
    const count = nonBlankCount(rowValues(ws, merges, range, r));
    if (count === 0) continue;
    if (firstNonBlank === -1) firstNonBlank = r;
    if (count >= 2) return r;
  }

  return firstNonBlank;
}

function dedupeHeaders(values, startCol) {
  const seen = new Map();
  return values.map((value, index) => {
    const fallback = XLSX.utils.encode_col(startCol + index);
    const base = String(value == null ? '' : value).trim() || fallback;
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

function buildContextLines(rowMetas, headerRow) {
  const lines = [];
  for (const meta of rowMetas) {
    if (meta.r >= headerRow) break;
    if (meta.uniqueTexts.length === 0) continue;
    lines.push(meta.uniqueTexts.join(' | '));
  }
  return lines;
}

function isFallbackHeader(header, columnIndex, startCol) {
  const base = String(header || '').replace(/_\d+$/, '');
  return base === XLSX.utils.encode_col(startCol + columnIndex);
}

function headerQuality(headers, startCol) {
  if (!headers.length) return 0;
  let meaningful = 0;
  for (let i = 0; i < headers.length; i++) {
    const header = String(headers[i] || '').trim();
    if (!header) continue;
    if (isFallbackHeader(header, i, startCol)) continue;
    if (/^https?:\/\//i.test(header)) continue;
    if (/^\\\\/.test(header)) continue;
    if (header.length > 60) continue;
    meaningful += 1;
  }
  return meaningful / headers.length;
}

function headerDiversity(headers, startCol) {
  const normalized = [];
  for (let i = 0; i < headers.length; i++) {
    const header = String(headers[i] || '').trim();
    if (!header) continue;
    if (isFallbackHeader(header, i, startCol)) continue;
    if (/^https?:\/\//i.test(header)) continue;
    if (/^\\\\/.test(header)) continue;
    normalized.push(header.replace(/_\d+$/, ''));
  }
  if (!normalized.length) return 0;
  return new Set(normalized).size / normalized.length;
}

function hasMergedTitleSignal(merges, headerRow, columnCount, firstRowIndex) {
  const minSpan = Math.max(2, Math.min(columnCount, 3));
  const topBoundary = Math.min(headerRow, firstRowIndex + 2);
  return merges.some(merge =>
    merge.s.r <= topBoundary &&
    merge.e.r === merge.s.r &&
    (merge.e.c - merge.s.c + 1) >= minSpan
  );
}

function shouldUseBlockMode({ rowMetas, merges, headers, startCol, headerRow, columnCount }) {
  const dataRows = rowMetas.filter(meta => meta.uniqueTexts.length > 0);
  if (dataRows.length === 0) return false;
  const bodyRows = dataRows.filter(meta => meta.r > headerRow);
  if (bodyRows.length === 0) return false;

  const avgCells = average(bodyRows.map(meta => meta.uniqueTexts.length));
  const wideThreshold = Math.min(Math.max(4, Math.ceil(columnCount * 0.35)), 8);
  const wideRatio = bodyRows.filter(meta => meta.uniqueTexts.length >= wideThreshold).length / bodyRows.length;
  const compactRatio = bodyRows.filter(meta => meta.uniqueTexts.length <= 2).length / bodyRows.length;
  const labelValueRatio = bodyRows.filter(meta =>
    meta.uniqueTexts.length === 2 && looksLikeLabel(meta.uniqueTexts[0])
  ).length / bodyRows.length;
  const contextRows = dataRows.filter(meta => meta.r < headerRow).length;
  const headerScore = headerQuality(headers, startCol);
  const headerShape = headerDiversity(headers, startCol);
  const lowHeaderQuality = headerScore < 0.6;
  const mergeSignal = merges.length >= Math.max(3, Math.ceil(bodyRows.length * 0.08));
  const mergedTitleSignal = hasMergedTitleSignal(
    merges,
    headerRow,
    columnCount,
    rowMetas[0] ? rowMetas[0].r : headerRow
  );

  if (merges.length === 0 && (headerScore >= 0.5 || headerShape >= 0.8 || labelValueRatio < 0.4)) {
    return false;
  }

  if (mergedTitleSignal && headerShape <= 0.5 && (labelValueRatio >= 0.45 || compactRatio >= 0.8)) {
    return true;
  }

  let score = 0;
  if (avgCells <= 3.2) score += 1;
  if (wideRatio < 0.45) score += 1;
  if (mergeSignal) score += 1;
  if (lowHeaderQuality) score += 1;
  if (contextRows >= 2) score += 1;
  if (compactRatio >= 0.75 && (mergeSignal || mergedTitleSignal || contextRows >= 2 || lowHeaderQuality)) score += 1;
  if (
    labelValueRatio >= 0.45 &&
    (mergeSignal || mergedTitleSignal || contextRows >= 1 || lowHeaderQuality || headerShape < 0.6)
  ) score += 1;
  if (mergedTitleSignal && headerShape <= 0.65) score += 1;

  return score >= 3;
}

function looksLikeLabel(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  if (value.length > 28) return false;
  if (/^https?:\/\//i.test(value)) return false;
  if (/^\\\\/.test(value)) return false;
  if (/[。！？.!?]$/.test(value)) return false;
  return true;
}

function dedupeKey(base, obj) {
  let key = base;
  let index = 2;
  while (Object.prototype.hasOwnProperty.call(obj, key)) {
    key = `${base}_${index}`;
    index += 1;
  }
  return key;
}

function formatBlockLine(texts) {
  if (texts.length === 0) return '';
  if (texts.length === 1) return texts[0];
  const [first, ...rest] = texts;
  const restText = rest.join(' | ');
  if (looksLikeLabel(first) && restText) return `${first}: ${restText}`;
  return texts.join(' | ');
}

function addBlockField(obj, headers, texts, excelRow, lineIndex) {
  if (texts.length === 0) return;

  if (lineIndex === 0 && texts.length === 1) {
    const key = dedupeKey('标题', obj);
    obj[key] = texts[0];
    headers.push(key);
    return;
  }

  if (texts.length > 1) {
    const [first, ...rest] = texts;
    const restText = rest.join(' | ');
    if (looksLikeLabel(first) && restText) {
      const key = dedupeKey(first, obj);
      obj[key] = restText;
      headers.push(key);
      return;
    }
  }

  const key = lineIndex === 0 ? dedupeKey('标题', obj) : `row_${excelRow}`;
  obj[key] = texts.join(' | ');
  headers.push(key);
}

function isSectionHeading(rowMeta) {
  return rowMeta.uniqueTexts.length === 1 && rowMeta.uniqueTexts[0].length <= 40;
}

function finalizeBlock(blockRows, sheetName, sheetIndex, nextRowIndex) {
  const excelRowStart = blockRows[0].r + 1;
  const excelRowEnd = blockRows[blockRows.length - 1].r + 1;
  const obj = {
    __sheet: sheetName,
    __parseMode: 'block',
    __excelRowStart: excelRowStart,
    __excelRowEnd: excelRowEnd,
  };
  const headers = [];
  const contentLines = [`Sheet: ${sheetName}`, `Rows: ${excelRowStart}-${excelRowEnd}`];

  blockRows.forEach((meta, index) => {
    addBlockField(obj, headers, meta.uniqueTexts, meta.r + 1, index);
    const line = formatBlockLine(meta.uniqueTexts);
    if (line) contentLines.push(line);
  });

  return {
    rowIndex: nextRowIndex,
    sheetIndex,
    sheetName,
    excelRow: excelRowStart,
    excelRowStart,
    excelRowEnd,
    anchorRow: blockRows[0].r,
    anchorStartRow: blockRows[0].r,
    anchorEndRow: blockRows[blockRows.length - 1].r,
    imageKey: `${sheetIndex}:${blockRows[0].r}`,
    headers,
    primaryCol: headers[0] || null,
    obj,
    content: contentLines.join('\n'),
  };
}

function parseBlockSheet(rowMetas, sheetName, sheetIndex, nextRowIndex) {
  const rows = [];
  let currentBlock = [];
  let globalRowIndex = nextRowIndex;
  let blankStreak = 0;

  const flushCurrentBlock = () => {
    if (currentBlock.length === 0) return;
    rows.push(finalizeBlock(currentBlock, sheetName, sheetIndex, globalRowIndex++));
    currentBlock = [];
  };

  for (const meta of rowMetas) {
    if (meta.uniqueTexts.length === 0) {
      blankStreak += 1;
      continue;
    }

    if (blankStreak > 0 && currentBlock.length > 0) {
      flushCurrentBlock();
    } else if (
      currentBlock.length >= 18 &&
      isSectionHeading(meta) &&
      !isSectionHeading(currentBlock[currentBlock.length - 1])
    ) {
      flushCurrentBlock();
    } else if (currentBlock.length >= 32) {
      flushCurrentBlock();
    }

    blankStreak = 0;
    currentBlock.push(meta);
  }

  flushCurrentBlock();
  return { rows, nextRowIndex: globalRowIndex };
}

function parseTableSheet(rowMetas, headers, contextLines, sheetName, sheetIndex, startCol, headerRow, nextRowIndex) {
  const rows = [];
  let globalRowIndex = nextRowIndex;

  for (const meta of rowMetas) {
    if (meta.r <= headerRow || meta.nonBlank === 0) continue;

    const obj = { __sheet: sheetName, __excelRow: meta.r + 1, __parseMode: 'table' };
    const lines = [`Sheet: ${sheetName}`, `Row: ${meta.r + 1}`];
    for (const line of contextLines) lines.push(`Context: ${line}`);

    for (let i = 0; i < meta.values.length; i++) {
      const label = headers[i] || XLSX.utils.encode_col(startCol + i);
      const value = meta.values[i] == null ? '' : meta.values[i];
      obj[label] = value;
      if (!isBlank(value)) lines.push(`${label}: ${value}`);
    }

    if (lines.length === 2 + contextLines.length) {
      const fallback = meta.uniqueTexts.join(' | ');
      if (fallback) lines.push(fallback);
    }

    rows.push({
      rowIndex: globalRowIndex++,
      sheetIndex,
      sheetName,
      excelRow: meta.r + 1,
      excelRowStart: meta.r + 1,
      excelRowEnd: meta.r + 1,
      anchorRow: meta.r,
      anchorStartRow: meta.r,
      anchorEndRow: meta.r,
      imageKey: `${sheetIndex}:${meta.r}`,
      headers,
      primaryCol: headers[0] || null,
      obj,
      content: lines.join('\n'),
    });
  }

  return { rows, nextRowIndex: globalRowIndex };
}

function parseTransposeSheet(ws, merges, transposeConfig, sheetName, sheetIndex, nextRowIndex) {
  const rows = [];
  let globalRowIndex = nextRowIndex;
  const headers = [...new Set(transposeConfig.headers.filter(Boolean))];
  const primaryCol = transposeConfig.nameLabel;

  for (const c of transposeConfig.dataCols) {
    const primaryValue = getCellText(ws, merges, transposeConfig.nameRow, c);
    if (isBlank(primaryValue)) continue;

    const colLabel = XLSX.utils.encode_col(c);
    const obj = {
      __sheet: sheetName,
      __parseMode: 'transpose',
      __excelCol: c + 1,
      __excelColLabel: colLabel,
      __excelRowStart: transposeConfig.startRow + 1,
      __excelRowEnd: transposeConfig.endRow + 1,
    };
    const lines = [
      `Sheet: ${sheetName}`,
      `Column: ${colLabel}`,
      `Rows: ${transposeConfig.startRow + 1}-${transposeConfig.endRow + 1}`,
    ];

    for (const [r, label] of transposeConfig.rowLabels.entries()) {
      const value = getCellText(ws, merges, r, c);
      obj[label] = value;
      if (!isBlank(value)) lines.push(`${label}: ${value}`);
    }

    rows.push({
      rowIndex: globalRowIndex++,
      sheetIndex,
      sheetName,
      excelRow: transposeConfig.nameRow + 1,
      excelRowStart: transposeConfig.startRow + 1,
      excelRowEnd: transposeConfig.endRow + 1,
      anchorRow: transposeConfig.nameRow,
      anchorStartRow: transposeConfig.startRow,
      anchorEndRow: transposeConfig.endRow,
      anchorCol: c,
      anchorStartCol: c,
      anchorEndCol: c,
      imageKey: `${sheetIndex}:${transposeConfig.startRow}:${c}`,
      headers,
      primaryCol,
      obj,
      content: lines.join('\n'),
    });
  }

  return { rows, nextRowIndex: globalRowIndex, headers };
}

function parseSheet(ws, sheetName, sheetIndex, nextRowIndex) {
  if (!ws || !ws['!ref']) {
    return { headers: [], rows: [], nextRowIndex, mode: 'table' };
  }

  const range = XLSX.utils.decode_range(ws['!ref']);
  const merges = ws['!merges'] || [];
  const rowMetas = [];
  for (let r = range.s.r; r <= range.e.r; r++) rowMetas.push(makeRowMeta(ws, merges, range, r));
  const colMetas = [];
  for (let c = range.s.c; c <= range.e.c; c++) colMetas.push(makeColMeta(ws, merges, range, c));

  const transposeConfig = detectTransposeMode(ws, merges, range, rowMetas, colMetas);
  if (transposeConfig) {
    const parsed = parseTransposeSheet(ws, merges, transposeConfig, sheetName, sheetIndex, nextRowIndex);
    return {
      headers: parsed.headers,
      rows: parsed.rows,
      nextRowIndex: parsed.nextRowIndex,
      mode: 'transpose',
    };
  }

  const headerRow = detectHeaderRow(ws, merges, range);
  if (headerRow < 0) {
    return { headers: [], rows: [], nextRowIndex, mode: 'table' };
  }

  const headers = dedupeHeaders(rowMetas[headerRow - range.s.r].values, range.s.c);
  const mode = shouldUseBlockMode({
    rowMetas,
    merges,
    headers,
    startCol: range.s.c,
    headerRow,
    columnCount: range.e.c - range.s.c + 1,
  }) ? 'block' : 'table';

  if (mode === 'block') {
    const parsed = parseBlockSheet(rowMetas, sheetName, sheetIndex, nextRowIndex);
    const firstHeaders = parsed.rows[0] ? parsed.rows[0].headers : headers;
    return { headers: firstHeaders, rows: parsed.rows, nextRowIndex: parsed.nextRowIndex, mode };
  }

  const contextLines = buildContextLines(rowMetas, headerRow);
  const parsed = parseTableSheet(
    rowMetas,
    headers,
    contextLines,
    sheetName,
    sheetIndex,
    range.s.c,
    headerRow,
    nextRowIndex
  );
  return { headers, rows: parsed.rows, nextRowIndex: parsed.nextRowIndex, mode };
}

function open(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: true, cellText: true });
  const allRows = [];
  const sheetMetas = [];
  let nextRowIndex = 1;

  for (let sheetIndex = 0; sheetIndex < wb.SheetNames.length; sheetIndex++) {
    const sheetName = wb.SheetNames[sheetIndex];
    const parsed = parseSheet(wb.Sheets[sheetName], sheetName, sheetIndex, nextRowIndex);
    nextRowIndex = parsed.nextRowIndex;
    sheetMetas.push({
      sheetIndex,
      sheetName,
      headers: parsed.headers,
      rowCount: parsed.rows.length,
      mode: parsed.mode,
    });
    allRows.push(...parsed.rows);
  }

  const primarySheet = sheetMetas.find(sheet => sheet.headers.length > 0) || sheetMetas[0] || { sheetName: '', headers: [] };

  function* iterate() {
    for (const row of allRows) yield row;
  }

  return {
    sheetName: primarySheet.sheetName,
    headers: primarySheet.headers,
    sheets: sheetMetas,
    rowCount: allRows.length,
    iterate,
  };
}

module.exports = { open, _parseSheet: parseSheet };
