// 从结构化行抽实体/关系：首列作主实体；其它非空列的值若与另一行的主实体重名，则建立关系。
// 简单启发式，不调 LLM，适合表格类知识；复杂自由文本抽取后期再加。
const db = require('../config/db');

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

// 主入口：传入 rows(已解析的 [{obj, rowIndex}]) 和 headers。
// 阶段一：为每行首列建主实体。阶段二：遍历其它列，若值命中已存在的主实体名，则建关系。
async function extract({ versionId, documentId, headers, rows }) {
  if (headers.length === 0) return { entityCount: 0, relationCount: 0 };
  const primaryCol = headers[0];
  const primaryType = primaryCol || 'entity';

  // 阶段一：主实体
  const nameToId = new Map();
  for (const r of rows) {
    const name = String(r.obj[primaryCol] || '').trim();
    if (!name) continue;
    const id = await upsertEntity({ versionId, documentId, name, type: primaryType, props: r.obj });
    if (id) nameToId.set(name, id);
  }

  // 阶段二：关系
  let relCount = 0;
  for (const r of rows) {
    const fromName = String(r.obj[primaryCol] || '').trim();
    const fromId = nameToId.get(fromName);
    if (!fromId) continue;
    for (let c = 1; c < headers.length; c++) {
      const col = headers[c];
      const val = String(r.obj[col] || '').trim();
      if (!val) continue;
      // 若值匹配任一主实体名（跨行同名 → 关系）
      const toId = nameToId.get(val);
      if (toId && toId !== fromId) {
        await addRelation(versionId, fromId, toId, col);
        relCount++;
      }
    }
  }

  return { entityCount: nameToId.size, relationCount: relCount };
}

module.exports = { extract, upsertEntity, addRelation };
