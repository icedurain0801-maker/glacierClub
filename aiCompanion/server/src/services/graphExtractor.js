// 从结构化行抽实体/关系：首列作主实体；其它非空列的值若与另一行的主实体重名，则建立关系。
// 简单启发式，不调 LLM，适合表格类知识；复杂自由文本抽取后期再加。
// 附带产出：实体别名(kb_entity_aliases，识别「别名/alias」列) + 条目-实体关联(kb_entry_entities)。
const db = require('../config/db');

// 别名列识别：列名等于这些(不区分大小写)即视为别名列，值按逗号/顿号/分号切分
const ALIAS_HEADERS = ['别名', 'alias', 'aliases', '昵称', '外号'];

function isAliasHeader(h) {
  return ALIAS_HEADERS.includes(String(h || '').trim().toLowerCase());
}

function splitAliases(val) {
  return String(val || '')
    .split(/[,，、;；]/)
    .map(s => s.trim())
    .filter(Boolean);
}

// upsertEntity: 依赖 UNIQUE(version_id, name, type)，冲突时用 INSERT ... ON DUPLICATE KEY UPDATE。
async function upsertEntity({ versionId, documentId, name, type, props }) {
  const propsJson = JSON.stringify(props || {});
  await db.query(
    `INSERT INTO kb_entities (version_id, document_id, name, type, props_json)
     VALUES (?,?,?,?,?)
     ON DUPLICATE KEY UPDATE props_json=VALUES(props_json), document_id=VALUES(document_id)`,
    [versionId, documentId, name, type, propsJson]
  );
  // 拿 id：ON DUPLICATE 更新时 insertId 不可靠，查一遍
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

// 写别名：alias 在 version 内唯一，冲突(重复导入/跨实体同别名)时保留已有记录不覆盖。
async function addAlias(versionId, entityId, alias, source = 'ingest') {
  if (!alias) return;
  await db.query(
    'INSERT IGNORE INTO kb_entity_aliases (version_id, entity_id, alias, source) VALUES (?,?,?,?)',
    [versionId, entityId, alias, source]
  );
}

// 条目-实体关联，主键(entry_id, entity_id)天然去重
async function addEntryEntity(entryId, entityId) {
  if (!entryId || !entityId) return;
  await db.query(
    'INSERT IGNORE INTO kb_entry_entities (entry_id, entity_id) VALUES (?,?)',
    [entryId, entityId]
  );
}

// 主入口：传入 rows(已解析的 [{obj, rowIndex}])、headers 和 entryIdByRow(rowIndex → entry_id)。
// 阶段一：为每行首列建主实体，写主名+别名列到 alias 表，记条目-实体关联。
// 阶段二：遍历其它列，若值命中已存在的主实体名，则建关系并补目标实体的条目关联。
async function extract({ versionId, documentId, headers, rows, entryIdByRow }) {
  if (headers.length === 0) return { entityCount: 0, relationCount: 0, aliasCount: 0 };
  const primaryCol = headers[0];
  const primaryType = primaryCol || 'entity';
  const entryIdOf = entryIdByRow || new Map();

  // 阶段一：主实体 + 别名 + 条目关联
  const nameToId = new Map();
  let aliasCount = 0;
  for (const r of rows) {
    const name = String(r.obj[primaryCol] || '').trim();
    if (!name) continue;
    const id = await upsertEntity({ versionId, documentId, name, type: primaryType, props: r.obj });
    if (!id) continue;
    nameToId.set(name, id);
    // 主名也写入 alias 表，查询链路只查一张表
    await addAlias(versionId, id, name);
    aliasCount++;
    // 别名列
    for (const col of headers) {
      if (!isAliasHeader(col)) continue;
      for (const a of splitAliases(r.obj[col])) {
        await addAlias(versionId, id, a);
        aliasCount++;
      }
    }
    await addEntryEntity(entryIdOf.get(r.rowIndex), id);
  }

  // 阶段二：关系 + 目标实体的条目关联
  let relCount = 0;
  for (const r of rows) {
    const fromName = String(r.obj[primaryCol] || '').trim();
    const fromId = nameToId.get(fromName);
    if (!fromId) continue;
    for (let c = 1; c < headers.length; c++) {
      const col = headers[c];
      if (isAliasHeader(col)) continue;  // 别名列不建关系
      const val = String(r.obj[col] || '').trim();
      if (!val) continue;
      // 若值匹配任一主实体名（跨行同名 → 关系）
      const toId = nameToId.get(val);
      if (toId && toId !== fromId) {
        await addRelation(versionId, fromId, toId, col);
        await addEntryEntity(entryIdOf.get(r.rowIndex), toId);
        relCount++;
      }
    }
  }

  return { entityCount: nameToId.size, relationCount: relCount, aliasCount };
}

module.exports = { extract, upsertEntity, addRelation, addAlias, addEntryEntity };
