require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors({ exposedHeaders: ['X-Version-Id'] }));
app.use(express.json({ limit: '10mb' }));

app.use('/api/auth',     require('./routes/auth'));
app.use('/api/versions', require('./routes/versions'));
app.use('/api/users',    require('./routes/users'));
app.use('/api/kb',       require('./routes/kb'));
app.use('/api/kg',       require('./routes/kg'));
app.use('/api/bot',      require('./routes/bot'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/public',   require('./routes/public'));

app.get('/api/ping', (_, res) => res.json({ ok: true, ts: Date.now() }));

// 统一错误处理
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: '服务器内部错误' });
});

const PORT = process.env.PORT || 3100;
if (require.main === module) {
  // 启动前加载向量索引并启动 worker
  const vectorStore = require('./services/vectorStore');
  const ingestWorker = require('./services/ingestWorker');
  vectorStore.loadAll()
    .then(() => { ingestWorker.start(); })
    .catch(err => console.error('[startup] loadAll failed:', err.message));

  app.listen(PORT, () => console.log(`AI Companion server on http://localhost:${PORT}`));
}

module.exports = app;
