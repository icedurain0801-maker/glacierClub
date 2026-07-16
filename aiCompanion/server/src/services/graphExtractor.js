const db = require('../config/db');

const ALIAS_HEADERS = ['别名', 'alias', 'aliases', '曾用名', '外号'];

const STRICT_PRIMARY_HEADERS = [
  '需求英雄',
  '英雄名称',
  '英雄名',
  '角色名称',
  '角色名',
  '英雄',
  '角色',
  '名称',
  '名字',
  'title',
  'name',
  'hero',
  'character',
  'entity',
];

const LOW_SIGNAL_HEADER_PATTERNS = [
  /^col\d+$/i,
  /截图|图片|图标|icon/i,
  /时间|日期|ddl/i,
  /链接|地址|url|path/i,
  /备注|说明|描述|文案|资料|内容|规则|条件/i,
  /状态|进度|发布|配置/i,
  /级别|等级|品质|稀有度/i,
  /阵营|职业|语言|百科/i,
  /跳转/i,
];

const STRICT_PRIMARY_HEADER_SET = new Set(STRICT_PRIMARY_HEADERS.map(normalizeHeader));

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[：:()（）【】[\]<>]/g, '');
}

function isAliasHeader(header) {
  const normalized = normalizeHeader(header);
  return ALIAS_HEADERS.some(item => normalizeHeader(item) === normalized);
}

function splitAliases(value) {
  return String(value || '')
    .split(/[,，;；、]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function isLowSignalHeader(header) {
  const normalized = normalizeHeader(header);
  return LOW_SIGNAL_HEADER_PATTERNS.some(re => re.test(normalized));
}

function getHeaderScore(header) {
  const normalized = normalizeHeader(header);
  if (!normalized) return Number.NEGATIVE_INFINITY;
  if (STRICT_PRIMARY_HEADER_SET.has(normalized)) return 100;
  if (isLowSignalHeader(normalized)) return -100;
  if (/需求.*(英雄|角色|名称|名字)/.test(normalized)) return 95;
  if (/(英雄|角色).*(名称|名字)?/.test(normalized)) return 90;
  if (/(hero|character).*(name|title)?/.test(normalized)) return 85;
  if (/^(name|title)$/.test(normalized)) return 80;
  if (/(名称|名字|标题)/.test(normalized)) return 70;
  if (/(name|title)/.test(normalized)) return 65;
  if (/entity/.test(normalized)) return 60;
  return 0;
}

function getValueScore(value) {
  const text = String(value || '').trim();
  if (!text) return Number.NEGATIVE_INFINITY;
  if (text.length > 120) return -100;
  if (text.includes('\n')) return -40;
  if (/^https?:\/\//i.test(text)) return -100;
  if (/^\\\\/.test(text)) return -100;
  if (/^\d{4}-\d{2}-\d{2}(?:t|\s)/i.test(text)) return -100;
  if (/^[☑☐✅✔\/\-]+$/.test(text)) return -60;
  if (text.length < 2) return -20;
  if (/[A-Za-z\u00C0-\u024F\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(text)) return 10;
  return 0;
}

function collectPreferredHeaders(headers, rows) {
  const stats = new Map();
  for (const row of rows) {
    const rowHeaders = (row.headers && row.headers.length > 0) ? row.headers : headers;
    for (const header of rowHeaders) {
      const headerScore = getHeaderScore(header);
      const valueScore = getValueScore(row.obj && row.obj[header]);
      if (headerScore < 60 || valueScore < -20) continue;
      const prev = stats.get(header) || { headerScore, hits: 0 };
      prev.hits += 1;
      stats.set(header, prev);
    }
  }

  return [...stats.entries()]
    .sort((a, b) => {
      if (b[1].headerScore !== a[1].headerScore) return b[1].headerScore - a[1].headerScore;
      return b[1].hits - a[1].hits;
    })
    .map(([header]) => header);
}

function pickPrimaryCol(rowHeaders, obj, preferredHeaders, fallback) {
  const available = new Set((rowHeaders || []).filter(Boolean));

  for (const header of preferredHeaders || []) {
    if (!available.has(header)) continue;
    if (getValueScore(obj && obj[header]) >= -20) return header;
  }

  let best = null;
  for (const header of available) {
    const headerScore = getHeaderScore(header);
    const valueScore = getValueScore(obj && obj[header]);
    if (headerScore <= 0 || valueScore < -20) continue;
    const total = headerScore * 10 + valueScore;
    if (!best || total > best.total) best = { header, total };
  }
  if (best) return best.header;

  if (fallback && available.has(fallback)) {
    const headerScore = getHeaderScore(fallback);
    const valueScore = getValueScore(obj && obj[fallback]);
    if (headerScore >= 60 && valueScore >= -20) return fallback;
  }

  return null;
}

function splitRelationCandidates(value) {
  const raw = String(value || '').trim();
  if (!raw) return [];
  const candidates = new Set([raw]);
  raw
    .split(/[\n,，;；、]/)
    .map(item => item.trim())
    .filter(Boolean)
    .forEach(item => candidates.add(item));
  return [...candidates];
}

async function upsertEntity({ versionId, documentId, name, type, props }) {
  const propsJson = JSON.stringify(props || {});
  await db.query(
    `INSERT INTO kb_entities (version_id, document_id, name, type, props_json)
     VALUES (?,?,?,?,?)
     ON DUPLICATE KEY UPDATE props_json=VALUES(props_json), document_id=VALUES(document_id)`,
    [versionId, documentId, name, type, propsJson]
  );
  const [rows] = await db.query(
    'SELECT id FROM kb_entities WHERE version_id=? AND name=? AND type=?',
    [versionId, name, type]
  );
  return rows[0] ? rows[0].id : null;
}

async function addRelation(versionId, fromId, toId, relation) {
  if (!fromId || !toId || fromId === toId) return;
  await db.query(
    'INSERT INTO kb_relations (version_id, from_entity_id, to_entity_id, relation) VALUES (?,?,?,?)',
    [versionId, fromId, toId, relation]
  );
}

async function addAlias(versionId, entityId, alias, source = 'ingest') {
  if (!alias) return;
  await db.query(
    'INSERT IGNORE INTO kb_entity_aliases (version_id, entity_id, alias, source) VALUES (?,?,?,?)',
    [versionId, entityId, alias, source]
  );
}

async function addEntryEntity(entryId, entityId) {
  if (!entryId || !entityId) return;
  await db.query(
    'INSERT IGNORE INTO kb_entry_entities (entry_id, entity_id) VALUES (?,?)',
    [entryId, entityId]
  );
}

async function extract({ versionId, documentId, headers, rows, entryIdByRow }) {
  if ((!headers || headers.length === 0) && !rows.some(row => row.headers && row.headers.length > 0)) {
    return { entityCount: 0, relationCount: 0, aliasCount: 0 };
  }

  const entryIdOf = entryIdByRow || new Map();
  const preferredHeaders = collectPreferredHeaders(headers, rows);
  const primaryMetaByRow = new Map();
  const nameToId = new Map();
  let aliasCount = 0;

  for (const row of rows) {
    const rowHeaders = (row.headers && row.headers.length > 0) ? row.headers : headers;
    const primaryCol = pickPrimaryCol(rowHeaders, row.obj, preferredHeaders, row.primaryCol);
    if (!primaryCol) continue;

    const name = String(row.obj[primaryCol] || '').trim();
    if (!name) continue;

    const id = await upsertEntity({
      versionId,
      documentId,
      name,
      type: 'primary',
      props: row.obj,
    });
    if (!id) continue;

    primaryMetaByRow.set(row.rowIndex, { id, primaryCol, name, rowHeaders });
    nameToId.set(name, id);

    await addAlias(versionId, id, name);
    aliasCount += 1;

    for (const col of rowHeaders) {
      if (!isAliasHeader(col)) continue;
      for (const alias of splitAliases(row.obj[col])) {
        await addAlias(versionId, id, alias);
        aliasCount += 1;
      }
    }

    await addEntryEntity(entryIdOf.get(row.rowIndex), id);
  }

  let relCount = 0;
  for (const row of rows) {
    const meta = primaryMetaByRow.get(row.rowIndex);
    if (!meta) continue;

    const { id: fromId, primaryCol, rowHeaders } = meta;
    for (const col of rowHeaders) {
      if (col === primaryCol) continue;
      if (isAliasHeader(col)) continue;

      const value = String(row.obj[col] || '').trim();
      if (!value) continue;

      const seenTargets = new Set();
      for (const candidate of splitRelationCandidates(value)) {
        const toId = nameToId.get(candidate);
        if (!toId || toId === fromId || seenTargets.has(toId)) continue;
        seenTargets.add(toId);
        await addRelation(versionId, fromId, toId, col);
        await addEntryEntity(entryIdOf.get(row.rowIndex), toId);
        relCount += 1;
      }
    }
  }

  return { entityCount: nameToId.size, relationCount: relCount, aliasCount };
}

module.exports = { extract, upsertEntity, addRelation, addAlias, addEntryEntity };
