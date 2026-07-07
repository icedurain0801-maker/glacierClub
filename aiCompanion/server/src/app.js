require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors({ exposedHeaders: ['X-Version-Id'] }));
app.use(express.json());

app.use('/api/auth',     require('./routes/auth'));
app.use('/api/versions', require('./routes/versions'));
app.use('/api/users',    require('./routes/users'));

app.get('/api/ping', (_, res) => res.json({ ok: true, ts: Date.now() }));

// 统一错误处理
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: '服务器内部错误' });
});

const PORT = process.env.PORT || 3100;
if (require.main === module) {
  app.listen(PORT, () => console.log(`AI Companion server on http://localhost:${PORT}`));
}

module.exports = app;
