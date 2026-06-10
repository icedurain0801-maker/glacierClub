const router = require('express').Router();
const db = require('../../config/db');
const { settleMatch } = require('../../services/settle');
const adminGuard = require('../../middleware/admin');

router.use(adminGuard);

// GET /api/admin/matches?date=&stage=&status=
router.get('/', async (req, res) => {
  const { date, stage, status, page = 1 } = req.query;
  const limit = 30;
  const offset = (parseInt(page) - 1) * limit;

  const conditions = [];
  const params = [];
  if (date)   { conditions.push('match_date = ?'); params.push(date); }
  if (stage)  { conditions.push('stage = ?');      params.push(stage); }
  if (status) { conditions.push('status = ?');     params.push(status); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const [rows] = await db.query(
    `SELECT * FROM matches ${where} ORDER BY kickoff_at ASC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM matches ${where}`, params);
  res.json({ data: rows, total, page: parseInt(page), limit });
});

// POST /api/admin/matches  — 新建赛程
router.post('/', async (req, res) => {
  const { match_date, kickoff_at, stage, group_name, team1_code, team2_code,
          team1_name, team2_name, venue, odds_win, odds_draw, odds_lose } = req.body;

  const [result] = await db.query(
    `INSERT INTO matches (match_date, kickoff_at, stage, group_name, team1_code, team2_code,
       team1_name, team2_name, venue, odds_win, odds_draw, odds_lose)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [match_date, kickoff_at, stage || 'group', group_name || null,
     team1_code, team2_code, team1_name, team2_name,
     venue || null, odds_win || 2.00, odds_draw || 3.20, odds_lose || 2.00]
  );
  res.status(201).json({ id: result.insertId });
});

// PATCH /api/admin/matches/:id  — 修改赔率/时间（仅未开赛）
router.patch('/:id', async (req, res) => {
  const { odds_win, odds_draw, odds_lose, kickoff_at } = req.body;

  const [[match]] = await db.query('SELECT status FROM matches WHERE id=?', [req.params.id]);
  if (!match) return res.status(404).json({ error: '赛程不存在' });
  if (match.status !== 'pending') return res.status(400).json({ error: '已开始或已结算的比赛不可修改' });

  const fields = [];
  const vals = [];
  if (odds_win   !== undefined) { fields.push('odds_win=?');   vals.push(odds_win); }
  if (odds_draw  !== undefined) { fields.push('odds_draw=?');  vals.push(odds_draw); }
  if (odds_lose  !== undefined) { fields.push('odds_lose=?');  vals.push(odds_lose); }
  if (kickoff_at !== undefined) { fields.push('kickoff_at=?'); vals.push(kickoff_at); }

  if (!fields.length) return res.status(400).json({ error: '没有要更新的字段' });

  await db.query(`UPDATE matches SET ${fields.join(', ')} WHERE id=?`, [...vals, req.params.id]);
  res.json({ ok: true });
});

// POST /api/admin/matches/:id/result  — 录入比分 + 触发结算
router.post('/:id/result', async (req, res) => {
  const { score1, score2 } = req.body;
  if (score1 === undefined || score2 === undefined) {
    return res.status(400).json({ error: '比分必填' });
  }
  try {
    const data = await settleMatch(
      parseInt(req.params.id),
      parseInt(score1),
      parseInt(score2),
      req.user.id
    );
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/admin/matches/:id/cancel  — 取消比赛（退还所有投注积分）
router.post('/:id/cancel', async (req, res) => {
  const matchId = parseInt(req.params.id);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[match]] = await conn.query('SELECT status FROM matches WHERE id=? FOR UPDATE', [matchId]);
    if (!match) throw new Error('赛程不存在');
    if (match.status === 'finished') throw new Error('已结算不可取消');

    await conn.query('UPDATE matches SET status="cancelled" WHERE id=?', [matchId]);

    const [picks] = await conn.query(
      'SELECT id, user_id, amount FROM picks WHERE match_id=? AND status="pending" FOR UPDATE',
      [matchId]
    );
    for (const pick of picks) {
      await conn.query('UPDATE picks SET status="refunded", earned=? WHERE id=?', [pick.amount, pick.id]);
      await conn.query('UPDATE users SET points=points+? WHERE id=?', [pick.amount, pick.user_id]);
      const [[u]] = await conn.query('SELECT points FROM users WHERE id=?', [pick.user_id]);
      await conn.query(
        'INSERT INTO point_logs (user_id, delta, balance_after, reason, ref_type, ref_id) VALUES (?,?,?,?,?,?)',
        [pick.user_id, pick.amount, u.points, 'refund', 'pick', pick.id]
      );
    }

    await conn.query(
      'INSERT INTO admin_logs (admin_id, action, target_type, target_id) VALUES (?,?,?,?)',
      [req.user.id, 'cancel_match', 'match', matchId]
    );

    await conn.commit();
    res.json({ refunded: picks.length });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ error: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
