const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const requireSuperAdmin = require('../middleware/requireSuperAdmin');
const { fail } = require('../utils/errors');

// GET /api/users — 用户列表 + 各自被授权的版本（仅超管）
router.get('/', requireSuperAdmin, async (_req, res) => {
  const [users] = await db.query(
    'SELECT id, username, display_name, is_super_admin, status, created_at FROM users ORDER BY id'
  );
  const [roles] = await db.query(
    `SELECT r.user_id, r.version_id, r.role, v.display_name
       FROM user_version_roles r JOIN versions v ON v.id=r.version_id`
  );
  const grouped = {};
  for (const r of roles) {
    (grouped[r.user_id] = grouped[r.user_id] || []).push(
      { versionId: r.version_id, role: r.role, displayName: r.display_name }
    );
  }
  res.json(users.map(u => ({
    id: u.id, username: u.username, displayName: u.display_name,
    isSuperAdmin: !!u.is_super_admin, status: u.status,
    versions: grouped[u.id] || [],
  })));
});

// POST /api/users — 新建用户（仅超管）
router.post('/', requireSuperAdmin, async (req, res) => {
  const { username, password, displayName } = req.body || {};
  if (!username || !password) return fail(res, 400, '用户名和密码必填');
  if (username.length < 3 || username.length > 64) return fail(res, 400, '用户名长度 3–64 位');
  if (password.length < 6) return fail(res, 400, '密码至少 6 位');

  const hash = await bcrypt.hash(password, 10);
  try {
    const [result] = await db.query(
      'INSERT INTO users (username, password_hash, display_name) VALUES (?,?,?)',
      [username, hash, (displayName || username).slice(0, 64)]
    );
    res.status(201).json({ id: result.insertId, username, displayName: displayName || username });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return fail(res, 409, '用户名已存在');
    throw err;
  }
});

// POST /api/users/:id/grant — 给用户授权某版本（仅超管）
router.post('/:id/grant', requireSuperAdmin, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { versionId, role } = req.body || {};
  if (!versionId) return fail(res, 400, 'versionId 必填');
  const roleVal = role === 'admin' ? 'admin' : 'operator';

  const [u] = await db.query('SELECT id FROM users WHERE id=?', [userId]);
  if (u.length === 0) return fail(res, 404, '用户不存在');
  const [v] = await db.query('SELECT id FROM versions WHERE id=?', [versionId]);
  if (v.length === 0) return fail(res, 404, '版本不存在');

  try {
    await db.query(
      'INSERT INTO user_version_roles (user_id, version_id, role) VALUES (?,?,?)',
      [userId, versionId, roleVal]
    );
    res.status(201).json({ userId, versionId, role: roleVal });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return fail(res, 409, '该用户已被授权此版本');
    throw err;
  }
});

// DELETE /api/users/:id/grant/:versionId — 取消授权（仅超管）
router.delete('/:id/grant/:versionId', requireSuperAdmin, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const versionId = parseInt(req.params.versionId, 10);
  await db.query('DELETE FROM user_version_roles WHERE user_id=? AND version_id=?', [userId, versionId]);
  res.json({ ok: true });
});

module.exports = router;
