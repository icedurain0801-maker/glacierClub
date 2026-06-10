const router = require('express').Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

// POST /api/picks  — 下注
router.post('/', auth, async (req, res) => {
  const { match_id, side, amount } = req.body;
  const userId = req.user.id;

  if (!match_id || !side || !amount) {
    return res.status(400).json({ error: '参数缺失' });
  }
  if (!['win', 'draw', 'lose'].includes(side)) {
    return res.status(400).json({ error: 'side 只能是 win / draw / lose' });
  }
  const amt = parseInt(amount);
  if (isNaN(amt) || amt < 10 || amt > 5000) {
    return res.status(400).json({ error: '积分范围 10–5000' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 锁住用户行
    const [[user]] = await conn.query(
      'SELECT id, points FROM users WHERE id = ? FOR UPDATE',
      [userId]
    );
    if (!user) throw { status: 404, message: '用户不存在' };
    if (user.points < amt) throw { status: 400, message: '积分不足' };

    // 检查赛程状态
    const [[match]] = await conn.query(
      'SELECT id, kickoff_at, status, odds_win, odds_draw, odds_lose FROM matches WHERE id = ? FOR UPDATE',
      [match_id]
    );
    if (!match) throw { status: 404, message: '赛程不存在' };
    if (match.status !== 'pending') throw { status: 400, message: '该场比赛不可投注' };
    if (new Date(match.kickoff_at) <= new Date()) {
      throw { status: 400, message: '比赛已开始，无法投注' };
    }

    // 取赔率快照
    const oddsMap = { win: match.odds_win, draw: match.odds_draw, lose: match.odds_lose };
    const oddsSnapshot = oddsMap[side];

    // 写 pick（唯一约束保证一场一注）
    const [insertResult] = await conn.query(
      'INSERT INTO picks (user_id, match_id, side, amount, odds_snapshot) VALUES (?, ?, ?, ?, ?)',
      [userId, match_id, side, amt, oddsSnapshot]
    );
    const pickId = insertResult.insertId;

    // 扣积分
    const newPoints = user.points - amt;
    await conn.query('UPDATE users SET points = ? WHERE id = ?', [newPoints, userId]);

    // 写流水
    await conn.query(
      'INSERT INTO point_logs (user_id, delta, balance_after, reason, ref_type, ref_id) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, -amt, newPoints, '下注', 'pick', pickId]
    );

    await conn.commit();
    res.status(201).json({
      pick_id: pickId,
      match_id,
      side,
      amount: amt,
      odds_snapshot: oddsSnapshot,
      points_remaining: newPoints,
    });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: '每场比赛只能投注一次' });
    }
    res.status(err.status || 500).json({ error: err.message || '投注失败' });
  } finally {
    conn.release();
  }
});

// GET /api/picks/me?status=pending&page=1
router.get('/me', auth, async (req, res) => {
  const { status, page = 1 } = req.query;
  const limit = 20;
  const offset = (parseInt(page) - 1) * limit;
  const userId = req.user.id;

  const conditions = ['p.user_id = ?'];
  const params = [userId];
  if (status && status !== 'all') {
    conditions.push('p.status = ?');
    params.push(status);
  }

  const where = 'WHERE ' + conditions.join(' AND ');
  const [rows] = await db.query(
    `SELECT
       p.id, p.match_id, p.side, p.amount, p.odds_snapshot,
       p.status, p.earned, p.created_at, p.settled_at,
       m.match_date, m.kickoff_at, m.team1_name, m.team2_name,
       m.team1_code, m.team2_code, m.score1, m.score2, m.result
     FROM picks p
     JOIN matches m ON m.id = p.match_id
     ${where}
     ORDER BY p.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM picks p ${where}`,
    params
  );

  res.json({ data: rows, total, page: parseInt(page), limit });
});

module.exports = router;
