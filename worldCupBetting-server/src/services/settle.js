const db = require('../config/db');

/**
 * 结算一场比赛
 * @param {number} matchId
 * @param {number} score1
 * @param {number} score2
 * @param {number} adminId  操作管理员 id
 */
async function settleMatch(matchId, score1, score2, adminId) {
  // 确定比赛结果（从 team1 视角）
  let result;
  if (score1 > score2)      result = 'win';
  else if (score1 < score2) result = 'lose';
  else                      result = 'draw';

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 检查并锁定赛程
    const [[match]] = await conn.query(
      'SELECT id, status FROM matches WHERE id = ? FOR UPDATE',
      [matchId]
    );
    if (!match) throw new Error('赛程不存在');
    if (match.status === 'finished') throw new Error('该场比赛已结算');

    // 更新赛程
    await conn.query(
      'UPDATE matches SET status="finished", score1=?, score2=?, result=?, settled_at=NOW() WHERE id=?',
      [score1, score2, result, matchId]
    );

    // 拉取所有待结算投注
    const [picks] = await conn.query(
      'SELECT id, user_id, side, amount, odds_snapshot FROM picks WHERE match_id=? AND status="pending" FOR UPDATE',
      [matchId]
    );

    for (const pick of picks) {
      const won = pick.side === result;
      const earned = won ? Math.floor(pick.amount * pick.odds_snapshot) : 0;
      const pickStatus = won ? 'won' : 'lost';

      await conn.query(
        'UPDATE picks SET status=?, earned=?, settled_at=NOW() WHERE id=?',
        [pickStatus, earned, pick.id]
      );

      if (won) {
        // 把赢得积分加回用户
        await conn.query(
          'UPDATE users SET points = points + ?, streak = streak + 1 WHERE id=?',
          [earned, pick.user_id]
        );
        const [[u]] = await conn.query('SELECT points FROM users WHERE id=?', [pick.user_id]);
        await conn.query(
          'INSERT INTO point_logs (user_id, delta, balance_after, reason, ref_type, ref_id) VALUES (?,?,?,?,?,?)',
          [pick.user_id, earned, u.points, 'settle_won', 'pick', pick.id]
        );
      } else {
        // 输了重置连胜
        await conn.query('UPDATE users SET streak=0 WHERE id=?', [pick.user_id]);
      }
    }

    // 写管理日志
    await conn.query(
      'INSERT INTO admin_logs (admin_id, action, target_type, target_id, payload) VALUES (?,?,?,?,?)',
      [adminId, 'settle_match', 'match', matchId, JSON.stringify({ score1, score2, result, picks_count: picks.length })]
    );

    await conn.commit();
    return { result, picks_settled: picks.length };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { settleMatch };
