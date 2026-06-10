require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const db = require('./config/db');

const app = express();
app.use(cors());
app.use(express.json());

// ---------------- 路由 ----------------
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/matches',       require('./routes/matches'));
app.use('/api/picks',         require('./routes/picks'));
app.use('/api/records',       require('./routes/records'));
app.use('/api/admin/matches', require('./routes/admin/matches'));
app.use('/api/admin/users',   require('./routes/admin/users'));
app.use('/api/admin/stats',   require('./routes/admin/stats'));

// 健康检查
app.get('/api/ping', (_, res) => res.json({ ok: true, ts: Date.now() }));

// 统一错误处理
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: '服务器内部错误' });
});

// ---------------- 管理员初始化 ----------------
async function ensureAdmin() {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';

  const [rows] = await db.query("SELECT id FROM users WHERE role='admin' LIMIT 1");
  if (rows.length > 0) return;

  const hash = await bcrypt.hash(adminPassword, 10);
  await db.query(
    'INSERT INTO users (username, password_hash, nickname, avatar_text, points, role) VALUES (?,?,?,?,?,?)',
    [adminUsername, hash, '管理员', '管', 999999, 'admin']
  );
  console.log(`[init] 管理员账号已创建：${adminUsername}`);
}

// ---------------- 启动 ----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  try {
    await ensureAdmin();
  } catch (err) {
    console.error('[init] 管理员初始化失败，请检查数据库连接：', err.message);
  }
});

module.exports = app;
