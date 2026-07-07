const router = require('express').Router();
const db = require('../config/db');
const requireSuperAdmin = require('../middleware/requireSuperAdmin');
const { fail } = require('../utils/errors');
const ah = require('../utils/asyncHandler');

// GET /api/versions — 所有版本（仅超管）
router.get('/', requireSuperAdmin, ah(async (_req, res) => {
  const [rows] = await db.query(
    'SELECT id, code, game_name, region, display_name, status, created_at FROM versions ORDER BY id'
  );
  res.json(rows);
}));

// POST /api/versions — 新建版本（仅超管）
router.post('/', requireSuperAdmin, ah(async (req, res) => {
  const { code, gameName, region, displayName } = req.body || {};
  if (!code || !gameName || !region) return fail(res, 400, 'code、gameName、region 必填');

  const display = displayName || `${gameName}·${region}`;
  try {
    const [result] = await db.query(
      'INSERT INTO versions (code, game_name, region, display_name) VALUES (?,?,?,?)',
      [code, gameName, region, display]
    );
    res.status(201).json({ id: result.insertId, code, gameName, region, displayName: display, status: 'active' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return fail(res, 409, '版本 code 已存在');
    throw err;
  }
}));

module.exports = router;
