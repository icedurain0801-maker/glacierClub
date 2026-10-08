'use strict';

const crypto = require('node:crypto');
const { normalizeSiteUrls, normalizeUrl } = require('../../server/src/services/bigplayerSiteConfig');
const { boardIdOf } = require('../../shared/bigPlayerBoard');

const SOURCE_ID = '081a16d2-5545-4afd-9c65-e04777e4540b';
const GAME_ID = '00000000-0000-0000-0000-000000000002';
const COMMUNITY_ID = '00000000-0000-0000-0000-000000000102';
const BOARD_ID = '100017';

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function parseConfig(value) {
  try { return typeof value === 'string' ? JSON.parse(value) : value; }
  catch { fail('LAST_NIGHT_CONFIG_INVALID'); }
}
function assertSource(source) {
  if (String(source?.id) !== SOURCE_ID || String(source.game_id) !== GAME_ID ||
    String(source.community_id) !== COMMUNITY_ID || source.region_code !== 'overseas' ||
    source.platform !== 'bigplayer_h5' || String(boardIdOf(source)) !== BOARD_ID ||
    !Number(source.enabled) || source.community_status !== 'enabled') fail('LAST_NIGHT_SCOPE_MISMATCH');
}

function inspectSiteAlignment(source, registry, historicalSiteIds = []) {
  assertSource(source);
  let config;
  try { config = normalizeSiteUrls(parseConfig(source.config)); }
  catch { fail('LAST_NIGHT_CONFIG_INVALID'); }
  const sites = config.siteUrls.filter(site => site.enabled);
  if (sites.length !== 3 || config.siteUrls.length !== 3) fail('LAST_NIGHT_SITE_COUNT_MISMATCH');
  const rows = Array.isArray(registry) ? registry : [];
  const byId = new Map(rows.map(row => [String(row.site_id), row]));
  if (byId.size !== rows.length) fail('LAST_NIGHT_REGISTRY_DUPLICATE');
  const aligned = rows.length === 3 && sites.every(site => {
    const row = byId.get(site.siteId);
    return row && Number(row.enabled) === 1 && normalizeUrl(row.url) === site.url;
  });
  if (aligned) {
    const allowed = new Set(sites.map(site => site.siteId));
    if (historicalSiteIds.some(id => id != null && !allowed.has(String(id)))) {
      fail('LAST_NIGHT_HISTORY_IDENTITY_UNSAFE');
    }
    return { status: 'aligned', sites };
  }

  if (rows.length !== 1 || Number(rows[0].enabled) !== 1 ||
    !String(rows[0].site_id).startsWith('legacy-')) fail('LAST_NIGHT_SITE_IDENTITY_UNSAFE');
  const legacy = rows[0];
  const legacyUrl = normalizeUrl(legacy.url);
  const matches = sites.filter(site => site.url === legacyUrl);
  const rawConfig = parseConfig(source.config);
  if (!Array.isArray(rawConfig.siteUrls) || rawConfig.siteUrls.some(site =>
    !site || typeof site !== 'object' || !String(site.siteId || '').trim())) {
    fail('LAST_NIGHT_SITE_IDENTITY_UNSAFE');
  }
  if (matches.length !== 1 || sites.some(site => site.siteId === String(legacy.site_id))) {
    fail('LAST_NIGHT_SITE_IDENTITY_UNSAFE');
  }
  const referenced = new Set(historicalSiteIds.filter(Boolean).map(String));
  if ([...referenced].some(id => id !== String(legacy.site_id))) fail('LAST_NIGHT_HISTORY_IDENTITY_UNSAFE');
  const corrected = rawConfig.siteUrls.map((site, index) => sites[index].url === legacyUrl
    ? { ...site, siteId: String(legacy.site_id) } : site);
  const missing = corrected.filter(site => site.siteId !== String(legacy.site_id));
  const planHash = crypto.createHash('sha256').update(JSON.stringify({ sourceId: SOURCE_ID,
    before: config.siteUrls.map(site => [site.siteId, site.url]),
    after: corrected.map((site, index) => [site.siteId, sites[index].url]),
    registry: [String(legacy.site_id), legacyUrl],
    historicalSiteIds: [...referenced].sort() })).digest('hex');
  return { status: 'alignment_required', legacySiteId: String(legacy.site_id),
    missingSiteIds: missing.map(site => site.siteId), plannedConfig: { ...rawConfig,
      siteUrls: corrected }, planHash };
}

async function loadTarget(repo) {
  const sources = await repo.query(`SELECT s.*,g.region_code,c.status AS community_status
    FROM po_sources s JOIN po_games g ON g.id=s.game_id
    JOIN po_communities c ON c.id=s.community_id WHERE s.id=?`, [SOURCE_ID]);
  const source = sources[0];
  assertSource(source);
  const registry = await repo.query('SELECT site_id,url,enabled FROM po_source_sites WHERE source_id=? ORDER BY site_id', [SOURCE_ID]);
  const runs = await repo.query('SELECT DISTINCT site_id FROM po_sync_runs WHERE source_id=? AND site_id IS NOT NULL', [SOURCE_ID]);
  const checkpoints = await repo.query(`SELECT DISTINCT cp.site_id FROM po_sync_checkpoints cp
    JOIN po_accounts a ON a.id=cp.account_id WHERE a.source_id=? AND cp.site_id IS NOT NULL`, [SOURCE_ID]);
  const historicalSiteIds = [...runs, ...checkpoints].map(row => row.site_id);
  return { source, alignment: inspectSiteAlignment(source, registry, historicalSiteIds) };
}

function utcWindow(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/.test(text)) fail('LAST_NIGHT_WINDOW_INVALID');
  return `${text.replace(' ', 'T')}Z`;
}

async function runLastNightDaily({ deps, schedule, processRun, analyze } = {}) {
  if (!deps?.repo || !deps?.unifiedScheduler || typeof schedule !== 'function' ||
    typeof processRun !== 'function' || typeof analyze !== 'function') fail('LAST_NIGHT_RUNNER_CONFIG_INVALID');
  const { source, alignment } = await loadTarget(deps.repo);
  if (alignment.status !== 'aligned') fail('LAST_NIGHT_SITE_ALIGNMENT_REQUIRED');
  const scheduled = await schedule({ ...deps.unifiedScheduler, mode: 'enabled', recoverySourceId: null,
    sourceAllowlist: [SOURCE_ID] });
  if (scheduled?.status !== 'completed' || scheduled.candidateCount !== 1 ||
    !Array.isArray(scheduled.decisions) || scheduled.decisions.some(item => item.sourceId !== SOURCE_ID)) {
    fail('LAST_NIGHT_SCHEDULER_FAILED');
  }
  const enqueued = scheduled.decisions.filter(item => item.status === 'enqueued');
  if (scheduled.decisions.some(item => !['enqueued', 'not_due'].includes(item.status))) fail('LAST_NIGHT_SCHEDULER_BLOCKED');
  if (!enqueued.length) return { status: 'not_due', sourceId: SOURCE_ID, scheduledRuns: 0 };
  if (enqueued.length !== 1 || !enqueued[0].runId) fail('LAST_NIGHT_SCHEDULER_UNEXPECTED_RUNS');
  const children = await deps.repo.query(`SELECT * FROM po_sync_runs WHERE parent_run_id=?
    AND source_id=? AND trigger_type='scheduled_site' ORDER BY site_id`, [enqueued[0].runId, SOURCE_ID]);
  if (children.length !== 3 || new Set(children.map(row => String(row.site_id))).size !== 3) {
    fail('LAST_NIGHT_CHILD_RUN_MISMATCH');
  }
  const sites = new Map(alignment.sites.map(site => [site.siteId, site.url]));
  for (const child of children) {
    if (String(child.source_id) !== SOURCE_ID || String(child.community_id) !== COMMUNITY_ID ||
      String(child.board_id) !== BOARD_ID || sites.get(String(child.site_id)) !== child.site_url_snapshot) {
      fail('LAST_NIGHT_CHILD_RUN_MISMATCH');
    }
  }
  for (const child of children) {
    await processRun(deps, source, child);
    const finished = await deps.repo.getSyncRun(child.id, { sourceId: SOURCE_ID });
    if (!['completed', 'completed_full', 'completed_authorized_scope'].includes(finished?.status)) {
      fail('LAST_NIGHT_CHILD_RUN_INCOMPLETE');
    }
  }
  const parent = await deps.repo.getSyncRun(enqueued[0].runId, { sourceId: SOURCE_ID });
  if (!['completed', 'completed_full', 'completed_authorized_scope'].includes(parent?.status)) {
    fail('LAST_NIGHT_PARENT_RUN_INCOMPLETE');
  }
  const starts = children.map(child => utcWindow(child.window_start));
  const ends = children.map(child => utcWindow(child.window_end));
  const analysis = await analyze({ sourceId: SOURCE_ID, publishedFrom: starts.sort()[0],
    publishedTo: ends.sort().at(-1), scope: { regionCode: 'overseas', gameId: GAME_ID,
      communityId: COMMUNITY_ID }, repo: deps.repo, ai: deps.ai, alertEngine: deps.alertEngine });
  if (analysis?.status !== 'completed') fail('LAST_NIGHT_ANALYSIS_INCOMPLETE');
  return { status: 'completed', sourceId: SOURCE_ID, scheduledRuns: 1, siteRuns: children.length,
    analysisStatus: analysis.status };
}

async function main(argv = process.argv) {
  if (argv.length === 3 && argv[2] === '--dry-run') {
    process.stdout.write(JSON.stringify({ status: 'prepared', sourceId: SOURCE_ID,
      mode: 'overseas-only', productionReadAttempted: false }) + '\n');
    return;
  }
  if (argv.length !== 3 || argv[2] !== '--execute') fail('LAST_NIGHT_ARGUMENTS_REJECTED');
  const { loadRuntimeEnv } = require('../../server/src/runtimeEnv');
  loadRuntimeEnv();
  if (process.env.LAST_NIGHT_OVERSEAS_EXECUTION_ENABLED !== 'true' ||
    process.env.UNIFIED_SOURCE_SCHEDULER_MODE !== 'enabled') fail('LAST_NIGHT_EXECUTION_DISABLED');
  const worker = require('./worker');
  const { Q1AnalysisRunner } = require('./q1DailyAnalysisRunner');
  const deps = worker.buildDeps();
  try {
    const result = await runLastNightDaily({ deps, schedule: worker.runUnifiedSchedulerSeam,
      processRun: worker.runSource,
      analyze: options => new Q1AnalysisRunner(options).runScoped() });
    process.stdout.write(JSON.stringify(result) + '\n');
  } finally { await deps.repo.pool?.end?.(); }
}

if (require.main === module) main().catch(error => {
  process.stderr.write(JSON.stringify({ status: 'failed', code: /^[A-Z0-9_]+$/.test(error?.code || '')
    ? error.code : 'LAST_NIGHT_FAILED' }) + '\n');
  process.exitCode = 1;
});

module.exports = { SOURCE_ID, GAME_ID, COMMUNITY_ID, BOARD_ID, inspectSiteAlignment,
  loadTarget, runLastNightDaily, main };
