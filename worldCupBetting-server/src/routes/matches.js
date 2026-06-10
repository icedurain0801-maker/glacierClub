const router = require('express').Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

// GET /api/matches?date=2026-06-13&stage=group
// 返回赛程列表，如果已登录附带 my_pick
router.get('/', async (req, res) => {
  const { date, stage } = req.query;

  // 可选鉴权：有 token 就解析，没有也允许访问
  let userId = null;
  try {
    const { verify } = require('../utils/jwt');
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (token) userId = verify(token).id;
  } catch {}

  const conditions = [];
  const params = [];
  if (date)  { conditions.push('m.match_date = ?'); params.push(date); }
  if (stage) { conditions.push('m.stage = ?');      params.push(stage); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const sql = `
    SELECT
      m.id, m.match_date, m.kickoff_at, m.stage, m.group_name,
      m.team1_code, m.team2_code, m.team1_name, m.team2_name,
      m.venue, m.odds_win, m.odds_draw, m.odds_lose,
      m.status, m.score1, m.score2, m.result,
      ${userId ? 'p.side AS my_pick_side, p.amount AS my_pick_amount, p.status AS my_pick_status' : 'NULL AS my_pick_side, NULL AS my_pick_amount, NULL AS my_pick_status'}
    FROM matches m
    ${userId ? 'LEFT JOIN picks p ON p.match_id = m.id AND p.user_id = ?' : ''}
    ${where}
    ORDER BY m.kickoff_at ASC
  `;

  if (userId) params.unshift(userId);

  const [rows] = await db.query(sql, params);
  res.json(rows);
});

// GET /api/matches/dates?stage=group  — 返回有赛程的日期列表
router.get('/dates', async (req, res) => {
  const { stage } = req.query;
  const [rows] = await db.query(
    'SELECT DISTINCT match_date FROM matches WHERE stage = ? ORDER BY match_date',
    [stage || 'group']
  );
  res.json(rows.map(r => r.match_date));
});

// GET /api/matches/:id
router.get('/:id', async (req, res) => {
  const [rows] = await db.query('SELECT * FROM matches WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: '赛程不存在' });
  res.json(rows[0]);
});

module.exports = router;
