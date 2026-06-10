const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { sign } = require('../utils/jwt');

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { username, password, nickname } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码必填' });
  }
  if (username.length < 3 || username.length > 32) {
    return res.status(400).json({ error: '用户名长度 3–32 位' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: '密码至少 6 位' });
  }

  const nick = (nickname || username).slice(0, 32);
  const avatarText = nick.slice(0, 1);
  const hash = await bcrypt.hash(password, 10);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      'INSERT INTO users (username, password_hash, nickname, avatar_text) VALUES (?, ?, ?, ?)',
      [username, hash, nick, avatarText]
    );
    const userId = result.insertId;

    // 注册赠送 500 积分流水
    await conn.query(
      'INSERT INTO point_logs (user_id, delta, balance_after, reason, ref_type) VALUES (?, 500, 500, "注册奖励", "system")',
      [userId]
    );

    await conn.commit();

    const token = sign({ id: userId, username, role: 'user' });
    res.status(201).json({
      token,
      user: { id: userId, username, nickname: nick, avatarText, points: 500, role: 'user' },
    });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: '用户名已存在' });
    }
    console.error(err);
    res.status(500).json({ error: '注册失败' });
  } finally {
    conn.release();
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码必填' });
  }

  const [rows] = await db.query(
    'SELECT id, username, password_hash, nickname, avatar_text, points, role, streak FROM users WHERE username = ?',
    [username]
  );
  const user = rows[0];
  if (!user) return res.status(401).json({ error: '用户名或密码错误' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: '用户名或密码错误' });

  const token = sign({ id: user.id, username: user.username, role: user.role });
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      avatarText: user.avatar_text,
      points: user.points,
      role: user.role,
      streak: user.streak,
    },
  });
});

// GET /api/auth/me  — 刷新当前用户信息
const auth = require('../middleware/auth');
router.get('/me', auth, async (req, res) => {
  const [rows] = await db.query(
    'SELECT id, username, nickname, avatar_text, points, role, streak FROM users WHERE id = ?',
    [req.user.id]
  );
  const user = rows[0];
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json({
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    avatarText: user.avatar_text,
    points: user.points,
    role: user.role,
    streak: user.streak,
  });
});

module.exports = router;
