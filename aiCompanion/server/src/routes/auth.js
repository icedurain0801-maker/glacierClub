const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { sign } = require('../utils/jwt');
const auth = require('../middleware/auth');
const { fail } = require('../utils/errors');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return fail(res, 400, '用户名和密码必填');

  const [rows] = await db.query(
    'SELECT id, username, password_hash, display_name, is_super_admin FROM users WHERE username=? AND status="active"',
    [username]
  );
  const user = rows[0];
  if (!user) return fail(res, 401, '用户名或密码错误');

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return fail(res, 401, '用户名或密码错误');

  const token = sign({ id: user.id, username: user.username, isSuperAdmin: !!user.is_super_admin });
  res.json({
    token,
    user: { id: user.id, username: user.username, displayName: user.display_name, isSuperAdmin: !!user.is_super_admin },
  });
});

// GET /api/auth/me — 当前用户 + 可访问版本列表
router.get('/me', auth, async (req, res) => {
  const [uRows] = await db.query(
    'SELECT id, username, display_name, is_super_admin FROM users WHERE id=?',
    [req.user.id]
  );
  const user = uRows[0];
  if (!user) return fail(res, 404, '用户不存在');

  let versions;
  if (user.is_super_admin) {
    const [vRows] = await db.query(
      'SELECT id, code, game_name, region, display_name FROM versions WHERE status="active" ORDER BY id'
    );
    versions = vRows;
  } else {
    const [vRows] = await db.query(
      `SELECT v.id, v.code, v.game_name, v.region, v.display_name
         FROM versions v
         JOIN user_version_roles r ON r.version_id = v.id
        WHERE r.user_id=? AND v.status="active"
        ORDER BY v.id`,
      [req.user.id]
    );
    versions = vRows;
  }

  res.json({
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    isSuperAdmin: !!user.is_super_admin,
    versions,
  });
});

module.exports = router;
