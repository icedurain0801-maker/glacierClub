const router = require('express').Router();
const version = require('../middleware/version');
const ah = require('../utils/asyncHandler');
const { fail } = require('../utils/errors');
const chatSimulation = require('../services/chatSimulation');

router.use(version);

router.get('/meta', ah(async (req, res) => {
  res.json({
    turns: {
      min: chatSimulation.MIN_TURNS,
      max: chatSimulation.MAX_TURNS,
      default: chatSimulation.DEFAULT_TURNS,
    },
    scenarios: chatSimulation.listScenarioOptions(),
    promptModes: chatSimulation.listPromptModes(),
  });
}));

router.post('/chat', ah(async (req, res) => {
  const turns = chatSimulation.sanitizeTurns(req.body?.turns);
  const scenarioKey = chatSimulation.normalizeScenarioKey(req.body?.scenarioKey);
  const promptMode = chatSimulation.normalizePromptMode(req.body?.promptMode);
  const customTopic = String(req.body?.customTopic || '').trim();

  if (req.body?.turns != null && turns < 1) {
    return fail(res, 400, 'turns 无效');
  }

  const requestMeta = {
    ip: req.ip,
    forwardedFor: req.get('x-forwarded-for') || '',
    userAgent: req.get('user-agent') || '',
  };

  const result = await chatSimulation.runSimulation({
    versionId: req.versionId,
    scenarioKey,
    promptMode,
    turns,
    customTopic,
    requestMeta,
  });

  res.json(result);
}));

module.exports = router;
