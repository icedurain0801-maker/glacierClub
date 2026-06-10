const router = require('express').Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

// GET /api/records/ranking?range=week  — 积分排行榜
router.get('/ranking', async (req, res) => {
  const { range = 'all', limit = 50 } = req.query;

  let timeFilter = '';
  if (range === 'week') timeFilter = 'AND pl.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
  if (range === 'month') timeFilter = 'AND pl.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';

  let sql, params;
  if (range === 'all') {
    sql = `
      SELECT id, nickname, avatar_text, points, streak
      FROM users WHERE role = 'user'
      ORDER BY points DESC, id ASC
      LIMIT ?
    `;
    params = [parseInt(limit)];
  } else {
    sql = `
      SELECT u.id, u.nickname, u.avatar_text, u.points,
             SUM(CASE WHEN pl.delta > 0 THEN pl.delta ELSE 0 END) AS period_earned
      FROM users u
      JOIN point_logs pl ON pl.user_id = u.id AND pl.reason = 'settle_won' ${timeFilter}
      WHERE u.role = 'user'
      GROUP BY u.id
      ORDER BY period_earned DESC
      LIMIT ?
    `;
    params = [parseInt(limit)];
  }

  const [rows] = await db.query(sql, params);
  res.json(rows);
});

module.exports = router;
