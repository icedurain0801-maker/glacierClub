const router = require('express').Router();
const version = require('../middleware/version');
const ah = require('../utils/asyncHandler');
const { fail } = require('../utils/errors');
const communitySync = require('../services/communitySyncWorker');
const settings = require('../services/communitySyncSettings');

router.use(version);
router.use((req, res, next) => {
  if (!req.user.isSuperAdmin) return fail(res, 403, 'Only super admins can manage community sync');
  next();
});

router.get('/status', ah(async (req, res) => {
  res.json(await communitySync.getStatus(req.versionId));
}));

router.put('/settings', ah(async (req, res) => {
  const config = await settings.saveConfig(req.versionId, req.body || {});
  res.json({
    ...settings.toPublic(config),
    running: (await communitySync.getStatus(req.versionId)).running,
  });
}));

router.post('/schedule', ah(async (req, res) => {
  const current = await settings.getEffectiveConfig(req.versionId);
  const config = await settings.saveConfig(req.versionId, {
    ...current,
    ...(req.body || {}),
    enabled: true,
  });
  res.json({
    ...settings.toPublic(config),
    running: (await communitySync.getStatus(req.versionId)).running,
  });
}));

router.delete('/schedule', ah(async (req, res) => {
  const current = await settings.getEffectiveConfig(req.versionId);
  const config = await settings.saveConfig(req.versionId, {
    ...current,
    enabled: false,
  });
  res.json({
    ...settings.toPublic(config),
    running: (await communitySync.getStatus(req.versionId)).running,
  });
}));

router.get('/runs', ah(async (req, res) => {
  const rows = await communitySync.listRuns(req.versionId, req.query.limit);
  res.json(rows);
}));

router.delete('/runs/:id', ah(async (req, res) => {
  const runId = parseInt(req.params.id, 10);
  if (!Number.isFinite(runId) || runId <= 0) return fail(res, 400, 'invalid community sync run id');

  const result = await communitySync.deleteRun(req.versionId, runId);
  if (!result.found) return fail(res, 404, 'community sync run not found');
  if (result.stopping) {
    return res.status(202).json({
      ok: true,
      id: runId,
      status: 'stopping',
    });
  }
  if (!result.deleted) return fail(res, 409, result.error || 'community sync run is stopping, retry shortly');

  res.json({ ok: true, id: runId });
}));

router.get('/pages', ah(async (req, res) => {
  const rows = await communitySync.listPages(req.versionId, req.query.limit);
  res.json(rows);
}));

router.get('/pages/:id', ah(async (req, res) => {
  const page = await communitySync.getPage(req.versionId, parseInt(req.params.id, 10));
  if (!page) return fail(res, 404, 'community sync page not found');
  res.json(page);
}));

router.post('/run', ah(async (req, res) => {
  const status = await communitySync.getStatus(req.versionId);
  if (status.running) return fail(res, 409, 'community sync is already running');
  settings.validateConfigForRun(await settings.getEffectiveConfig(req.versionId));
  communitySync.runOnce({ versionId: req.versionId, triggerType: 'manual' })
    .catch(err => console.error('[communitySync] manual run failed:', err.message));
  res.status(202).json({ ok: true, status: 'started' });
}));

module.exports = router;
