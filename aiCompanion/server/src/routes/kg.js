// B 端图谱管理:实体列表(含别名) + 别名增删。写操作后失效 kgContext 缓存。
const router = require('express').Router();
const db = require('../config/db');
const version = require('../middleware/version');
const ah = require('../utils/asyncHandler');
const { fail } = require('../utils/errors');
const kgContext = require('../services/kgContext');

router.use(version);

// —— 实体列表(含别名) ——
router.get('/entities', ah(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const offset = parseInt(req.query.offset, 10) || 0;
  const q = String(req.query.q || '').trim();

  const where = ['e.version_id=?'];
  const params = [req.versionId];
  if (q) { where.push('e.name LIKE ?'); params.push(`%${q}%`); }

  const [entities] = await db.query(
    `SELECT e.id, e.name, e.type FROM kb_entities e WHERE ${where.join(' AND ')} ORDER BY e.id LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  if (entities.length === 0) return res.json([]);

  const ids = entities.map(e => e.id);
  const [aliases] = await db.query(
    `SELECT id, entity_id, alias, source FROM kb_entity_aliases WHERE entity_id IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  const byEntity = new Map();
  for (const a of aliases) {
    if (!byEntity.has(a.entity_id)) byEntity.set(a.entity_id, []);
    byEntity.get(a.entity_id).push({ id: a.id, alias: a.alias, source: a.source });
  }
  res.json(entities.map(e => ({ ...e, aliases: byEntity.get(e.id) || [] })));
}));

// —— 新增别名 ——
router.post('/entities/:id/aliases', ah(async (req, res) => {
  const entityId = parseInt(req.params.id, 10);
  const alias = String(req.body?.alias || '').trim();
  if (!alias) return fail(res, 400, 'alias 必填');
  if (alias.length > 128) return fail(res, 400, 'alias 过长(>128)');

  const [ents] = await db.query('SELECT id FROM kb_entities WHERE id=? AND version_id=?', [entityId, req.versionId]);
  if (ents.length === 0) return fail(res, 404, '实体不存在');

  try {
    const [ins] = await db.query(
      'INSERT INTO kb_entity_aliases (version_id, entity_id, alias, source) VALUES (?,?,?,"manual")',
      [req.versionId, entityId, alias]
    );
    kgContext.invalidate(req.versionId);
    res.status(201).json({ id: ins.insertId, alias });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return fail(res, 409, '该别名已存在');
    throw err;
  }
}));

// —— 删除别名 ——
router.delete('/aliases/:aliasId', ah(async (req, res) => {
  const [r] = await db.query(
    'DELETE FROM kb_entity_aliases WHERE id=? AND version_id=?',
    [req.params.aliasId, req.versionId]
  );
  if (r.affectedRows === 0) return fail(res, 404, '别名不存在');
  kgContext.invalidate(req.versionId);
  res.json({ ok: true });
}));

module.exports = router;
