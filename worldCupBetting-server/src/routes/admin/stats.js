const router = require('express').Router();
const db = require('../../config/db');
const adminGuard = require('../../middleware/admin');

router.use(adminGuard);

// GET /api/admin/stats/dashboard
router.get('/dashboard', async (req, res) => {
  const [[{ total_users }]] = await db.query("SELECT COUNT(*) AS total_users FROM users WHERE role='user'");
  const [[{ today_picks }]] = await db.query("SELECT COUNT(*) AS today_picks FROM picks WHERE DATE(created_at)=CURDATE()");
  const [[{ pending_picks }]] = await db.query("SELECT COUNT(*) AS pending_picks FROM picks WHERE status='pending'");
  const [[{ pending_matches }]] = await db.query("SELECT COUNT(*) AS pending_matches FROM matches WHERE status='pending' AND kickoff_at > NOW()");
  const [[{ active_today }]] = await db.query(
    "SELECT COUNT(DISTINCT user_id) AS active_today FROM picks WHERE DATE(created_at)=CURDATE()"
  );
  const [[{ total_points_bet_today }]] = await db.query(
    "SELECT COALESCE(SUM(amount),0) AS total_points_bet_today FROM picks WHERE DATE(created_at)=CURDATE()"
  );

  res.json({
    total_users,
    today_picks,
    pending_picks,
    pending_matches,
    active_today,
    total_points_bet_today,
  });
});

module.exports = router;
