const router = require('express').Router();
const db = require('../../config/db');
const adminGuard = require('../../middleware/admin');

router.use(adminGuard);

// GET /api/admin/users?q=&page=1
router.get('/', async (req, res) => {
  const { q, page = 1 } = req.query;
  const limit = 30;
  const offset = (parseInt(page) - 1) * limit;

  const where = q ? 'WHERE username LIKE ? OR nickname LIKE ?' : '';
  const likeQ = `%${q}%`;
  const params = q ? [likeQ, likeQ, limit, offset] : [limit, offset];

  const [rows] = await db.query(
    `SELECT id, username, nickname, avatar_text, points, role, streak, created_at
     FROM users ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
    params
  );
  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM users ${where}`,
    q ? [likeQ, likeQ] : []
  );
  res.json({ data: rows, total, page: parseInt(page), limit });
});

// POST /api/admin/users/:id/points  — 人工调整积分
router.post('/:id/points', async (req, res) => {
  const { delta, reason } = req.body;
  if (!delta || !reason) return res.status(400).json({ error: '参数缺失' });
  const d = parseInt(delta);
  if (isNaN(d) || d === 0) return res.status(400).json({ error: 'delta 不能为 0' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[user]] = await conn.query('SELECT id, points FROM users WHERE id=? FOR UPDATE', [req.params.id]);
    if (!user) throw new Error('用户不存在');

    const newPoints = Math.max(0, user.points + d);
    await conn.query('UPDATE users SET points=? WHERE id=?', [newPoints, user.id]);
    await conn.query(
      'INSERT INTO point_logs (user_id, delta, balance_after, reason, ref_type, ref_id) VALUES (?,?,?,?,?,?)',
      [user.id, d, newPoints, reason, 'admin', req.user.id]
    );
    await conn.query(
      'INSERT INTO admin_logs (admin_id, action, target_type, target_id, payload) VALUES (?,?,?,?,?)',
      [req.user.id, 'adjust_points', 'user', user.id, JSON.stringify({ delta: d, reason })]
    );

    await conn.commit();
    res.json({ points: newPoints });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ error: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
