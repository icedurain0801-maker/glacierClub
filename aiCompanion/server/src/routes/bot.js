const router = require('express').Router();
const db = require('../config/db');
const version = require('../middleware/version');
const ah = require('../utils/asyncHandler');
const { fail } = require('../utils/errors');

router.use(version);

// GET /api/bot — 拿当前版本机器人配置(无则返默认值,不入库)
router.get('/', ah(async (req, res) => {
  const [rows] = await db.query('SELECT * FROM bots WHERE version_id=?', [req.versionId]);
  if (rows.length > 0) {
    const b = rows[0];
    return res.json({
      persona: b.persona,
      welcome: b.welcome,
      ragEnabled: !!b.rag_enabled,
      ragTopK: b.rag_top_k,
      kgEnabled: !!b.kg_enabled,
      historyTurns: b.history_turns,
      model: b.model,
    });
  }
  res.json({
    persona: '你是一个热情耐心的游戏陪玩助手。',
    welcome: '你好,我是你的游戏陪玩助手,有什么想聊的?',
    ragEnabled: true,
    ragTopK: 5,
    kgEnabled: true,
    historyTurns: 10,
    model: null,
  });
}));

// PUT /api/bot — upsert
router.put('/', ah(async (req, res) => {
  const { persona, welcome, ragEnabled, ragTopK, kgEnabled, historyTurns, model } = req.body || {};
  if (!persona || !welcome) return fail(res, 400, 'persona / welcome 必填');
  if (persona.length > 8000) return fail(res, 400, 'persona 过长(>8000)');
  if (welcome.length > 512) return fail(res, 400, 'welcome 过长(>512)');

  const topK = parseInt(ragTopK, 10);
  if (Number.isNaN(topK) || topK < 1 || topK > 20) return fail(res, 400, 'ragTopK 需在 1-20');
  const turns = parseInt(historyTurns, 10);
  if (Number.isNaN(turns) || turns < 1 || turns > 50) return fail(res, 400, 'historyTurns 需在 1-50');

  await db.query(
    `INSERT INTO bots (version_id, persona, welcome, rag_enabled, rag_top_k, kg_enabled, history_turns, model)
     VALUES (?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       persona=VALUES(persona), welcome=VALUES(welcome),
       rag_enabled=VALUES(rag_enabled), rag_top_k=VALUES(rag_top_k),
       kg_enabled=VALUES(kg_enabled),
       history_turns=VALUES(history_turns), model=VALUES(model)`,
    [req.versionId, persona, welcome, ragEnabled ? 1 : 0, topK, kgEnabled === undefined || kgEnabled ? 1 : 0, turns, model || null]
  );
  res.json({ ok: true });
}));

module.exports = router;
