'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const RUN_ID = 'risk-v058d-real-20260921-3e462961';
const FIXED_SAMPLES = Object.freeze([
  { role: 'fixed_919098', externalId: '919098', contentId: 'bc64d7a5-4032-49e9-80cd-4c83fabb7e94', sentiment: 'negative', severity: 'normal' },
  { role: 'fixed_919167', externalId: '919167', contentId: '74f19f1c-f027-4826-a042-fb49dcc19724', sentiment: 'negative', severity: 'attention' },
  { role: 'ordinary_negative', externalId: '6826813', contentId: '3454bd9f-8bec-43e6-8eb5-e296ff965575', sentiment: 'negative', severity: 'normal' },
  { role: 'positive_reconciliation', externalId: '920120', contentId: '20a46255-d6db-4140-b6c5-10dc9d5c5ea1', sentiment: 'positive', severity: 'attention' }
]);
const FIXED_SCOPE = Object.freeze({
  sourceId: '5c21f78d-5f67-4467-963d-dcdeb5e26cab',
  gameId: '896b6b25-39ea-4979-bb87-8c1d7334fde7',
  communityId: '00000000-0000-0000-0000-000000000101',
  platform: 'bigplayer_h5'
});
const ROOT = path.resolve(__dirname, '../../..');
const CANDIDATE_NAME = 'v058f-risk-severity-formal-integration-20260921';
const EXPECTED_MANIFEST_SHA256 = '1BB0CFFCF660124FA421C1615F024CFE2E9080C308F3B7260A14537AE525FE1E';
const CANDIDATE = path.join(ROOT, '.temp', 'candidates', CANDIDATE_NAME);
const EVIDENCE = path.join(__dirname, 'evidence', `v302-${RUN_ID}`);
const MODE = String(process.argv.find(value => value.startsWith('--phase=')) || '--phase=preflight').slice(8);
const API_BASE = 'http://127.0.0.1:3001/api/public-opinion';
const writeProgress = { aiAnalyzeBatchCalls: 0, analyzedSampleCount: 0, controlledAlertCreates: 0, analysisUpserts: 0, reconciliationStateChanges: 0, reconciliationAudits: 0 };

function candidatePath(...parts) { return path.join(CANDIDATE, ...parts); }
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase(); }
function writeEvidence(name, value) {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function sanitizeError(error) { return { code: error?.code || 'UNKNOWN', message: String(error?.message || error).replace(/(token|password|secret|authorization)=[^\s&]+/ig, '$1=[REDACTED]') }; }

function assertCandidate() {
  const ready = JSON.parse(fs.readFileSync(candidatePath('READY.json'), 'utf8'));
  const manifestHash = sha256(candidatePath('manifest.json'));
  const readyManifestHash = ready.manifestSha256 || ready.manifest?.sha256;
  if (ready.status !== 'ready' || ready.candidate !== CANDIDATE_NAME || readyManifestHash !== manifestHash || manifestHash !== EXPECTED_MANIFEST_SHA256) {
    throw Object.assign(new Error('candidate READY/manifest mismatch'), { code: 'CANDIDATE_NOT_READY' });
  }
  return { ready, manifestHash };
}

function loadRuntimeWithoutPrintingSecrets() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.statSync(envPath).isFile()) throw Object.assign(new Error('runtime env file is unavailable'), { code: 'RUNTIME_ENV_UNAVAILABLE' });
  process.loadEnvFile(envPath);
  process.env.DINGTALK_ENABLED = 'false';
  delete process.env.DINGTALK_WEBHOOK;
  delete process.env.DINGTALK_SECRET;
}

function candidateModules() {
  const { Repository } = require(candidatePath('server', 'src', 'db', 'repository.js'));
  const { AiAnalyzer } = require(candidatePath('server', 'src', 'integrations', 'aiAnalyzer.js'));
  const { AlertEngine } = require(candidatePath('server', 'src', 'pipeline', 'alertEngine.js'));
  const worker = require(candidatePath('worker', 'src', 'worker.js'));
  return { Repository, AiAnalyzer, AlertEngine, worker };
}

class FailFastNotifier {
  constructor() { this.enabled = false; this.webhook = ''; this.attempts = 0; }
  async notify() { this.attempts += 1; throw Object.assign(new Error('notification gate violation'), { code: 'NO_NOTIFY_GATE_VIOLATION' }); }
}

async function queryRows(repo, sql, params = []) { return repo.query(sql, params); }

async function selectSamples(repo, normalizePersistedAnalysis) {
  const ids = FIXED_SAMPLES.map(sample => sample.externalId);
  const fixed = await queryRows(repo, `SELECT c.id,c.external_id,c.source_id,c.game_id,c.community_id,s.platform,c.content_type,c.title,c.body,c.published_at,c.fingerprint,c.is_deleted,
    a.sentiment,a.severity,a.negative_score,a.confidence,a.analysis_level,a.analysis_version,a.analysis_reason,a.analyzed_at
    FROM po_contents c JOIN po_sources s ON s.id=c.source_id LEFT JOIN po_analyses a ON a.content_id=c.id
    WHERE c.external_id IN (?,?,?,?) ORDER BY FIELD(c.external_id,?,?,?,?)`, [...ids, ...ids]);
  if (fixed.length !== FIXED_SAMPLES.length) throw Object.assign(new Error('four fixed samples do not resolve uniquely'), { code: 'FIXED_SAMPLE_SCOPE_MISMATCH' });
  const byExternalId = new Map(fixed.map(row => [String(row.external_id), row]));
  const samples = FIXED_SAMPLES.map(expected => {
    const row = byExternalId.get(expected.externalId);
    if (!row || row.id !== expected.contentId || row.sentiment !== expected.sentiment || row.severity !== expected.severity) {
      throw Object.assign(new Error(`fixed sample baseline mismatch: ${expected.externalId}`), { code: 'FIXED_SAMPLE_BASELINE_MISMATCH' });
    }
    if (row.source_id !== FIXED_SCOPE.sourceId || row.game_id !== FIXED_SCOPE.gameId || row.community_id !== FIXED_SCOPE.communityId || row.platform !== FIXED_SCOPE.platform) {
      throw Object.assign(new Error(`fixed sample scope mismatch: ${expected.externalId}`), { code: 'FIXED_SAMPLE_SCOPE_MISMATCH' });
    }
    return { ...row, role: expected.role, expectedNormalizedSeverity: normalizePersistedAnalysis(row, row).severity };
  });
  if (new Set(samples.map(row => row.id)).size !== 4) throw Object.assign(new Error('four-sample identity is not unique'), { code: 'SAMPLE_IDENTITY_COLLISION' });
  if (samples[0].expectedNormalizedSeverity !== 'urgent' || samples[1].expectedNormalizedSeverity !== 'urgent'
    || samples[2].expectedNormalizedSeverity !== 'attention' || samples[3].expectedNormalizedSeverity !== 'normal') {
    throw Object.assign(new Error('fixed sample deterministic normalization mismatch'), { code: 'FIXED_SAMPLE_NORMALIZATION_MISMATCH' });
  }
  return samples;
}

async function apiSnapshot(samples) {
  const rows = [];
  for (const sample of samples) {
    const url = new URL(`${API_BASE}/contents`);
    url.searchParams.set('page', '1'); url.searchParams.set('pageSize', '20'); url.searchParams.set('postId', sample.external_id);
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const body = await response.json();
    rows.push({ externalId: sample.external_id, status: response.status, data: body.data || null });
  }
  return rows;
}

async function dbSnapshot(repo, samples) {
  const ids = samples.map(row => row.id);
  const marks = ids.map(() => '?').join(',');
  const [analyses, jobs, cache, alerts, notificationCounts, messageTables, auditTables] = await Promise.all([
    queryRows(repo, `SELECT * FROM po_analyses WHERE content_id IN (${marks}) ORDER BY content_id`, ids),
    queryRows(repo, `SELECT * FROM po_analysis_jobs WHERE content_id IN (${marks}) ORDER BY content_id,analysis_profile,analysis_version`, ids),
    queryRows(repo, `SELECT ac.* FROM po_analysis_cache ac JOIN po_contents c ON c.fingerprint=ac.content_fingerprint WHERE c.id IN (${marks}) ORDER BY c.id,ac.analysis_profile,ac.updated_at`, ids),
    queryRows(repo, `SELECT al.*,ac.content_id FROM po_alert_contents ac JOIN po_alerts al ON al.id=ac.alert_id WHERE ac.content_id IN (${marks}) ORDER BY ac.content_id,al.created_at,al.id`, ids),
    queryRows(repo, 'SELECT ding_talk_status,COUNT(*) AS count FROM po_alerts GROUP BY ding_talk_status ORDER BY ding_talk_status'),
    queryRows(repo, "SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND (LOWER(table_name) LIKE '%outbox%' OR LOWER(table_name) LIKE '%notification%' OR LOWER(table_name) LIKE '%message%') ORDER BY table_name"),
    queryRows(repo, "SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND LOWER(table_name) LIKE '%audit%' ORDER BY table_name")
  ]);
  const outboxCounts = [];
  for (const { table_name: tableName } of messageTables) {
    if (!/^[A-Za-z0-9_]+$/.test(tableName)) throw new Error('unsafe information_schema table name');
    const rows = await queryRows(repo, `SELECT COUNT(*) AS count FROM \`${tableName}\``);
    outboxCounts.push({ tableName, count: Number(rows[0]?.count || 0) });
  }
  return { analyses, jobs, cache, alerts, notificationCounts, messageTables, outboxCounts, auditTables };
}

function reconciliationCapability() {
  const candidateFiles = [
    candidatePath('server', 'src', 'db', 'repository.js'),
    candidatePath('server', 'src', 'pipeline', 'alertEngine.js'),
    candidatePath('worker', 'src', 'worker.js')
  ];
  const source = candidateFiles.map(file => fs.readFileSync(file, 'utf8')).join('\n');
  return {
    available: /reconcilePositiveAlerts|reconcilePositiveRiskAlerts/.test(source),
    requiredContract: 'candidate-owned positive analysis -> existing pending/processing risk alerts become false_positive with system reason and audit'
  };
}

function normalizeAndAssertRealAnalyses(samples, rawResults, worker, profile) {
  if (!Array.isArray(rawResults) || rawResults.length !== samples.length) throw Object.assign(new Error('AI result count does not match fixed sample count'), { code: 'AI_RESULT_COUNT_MISMATCH' });
  const expectedSeverity = { fixed_919098: 'urgent', fixed_919167: 'urgent', ordinary_negative: 'attention', positive_reconciliation: 'normal' };
  return samples.map((sample, index) => {
    const raw = rawResults[index];
    const analysis = worker.normalizePersistedAnalysis({
      ...raw,
      analysisLevel: 'light',
      profile: 'light',
      analysisVersion: raw?.analysisVersion || profile.version,
      modelName: raw?.modelName || profile.model,
      contentFingerprint: sample.fingerprint,
      triggerReason: 'v302_real_sample',
      matchedKeywords: Array.isArray(raw?.matchedKeywords) ? raw.matchedKeywords : []
    }, sample);
    if (analysis.sentiment !== sample.sentiment) throw Object.assign(new Error(`real AI sentiment mismatch: ${sample.external_id}`), { code: 'REAL_AI_SENTIMENT_MISMATCH' });
    if (analysis.severity !== expectedSeverity[sample.role]) throw Object.assign(new Error(`real AI normalized severity mismatch: ${sample.external_id}`), { code: 'REAL_AI_SEVERITY_MISMATCH' });
    if (!String(analysis.analysisReason || '').trim()) throw Object.assign(new Error(`analysisReason is empty: ${sample.external_id}`), { code: 'ANALYSIS_REASON_AUDIT_MISSING' });
    const reasons = analysis.severityNormalizationReasons || [];
    const audit = `severity=${analysis.originalSeverity}->${analysis.severity};reasons=${reasons.join(',') || 'none'}`;
    if (reasons.length && !analysis.analysisReason.includes(audit)) throw Object.assign(new Error(`analysisReason normalization audit mismatch: ${sample.external_id}`), { code: 'ANALYSIS_REASON_AUDIT_MISMATCH' });
    return { sample, analysis, audit };
  });
}

async function persistAnalysisPass(repo, prepared, runId, progress = null) {
  const reconciliation = [];
  for (const item of prepared) {
    await repo.insertAnalysis(item.sample.id, item.analysis);
    if (progress) progress.analysisUpserts += 1;
    const result = await repo.reconcilePositiveRiskAlerts(item.sample.id, item.analysis, { runId });
    if (progress && result.reconciled) { progress.reconciliationStateChanges += 1; progress.reconciliationAudits += 1; }
    reconciliation.push(result);
  }
  return reconciliation;
}

function stableAlertState(rows) {
  return rows.map(row => ({ id: row.id, contentId: row.content_id, status: row.status, resolutionNote: row.resolution_note, resolvedAt: row.resolved_at })).sort((a, b) => `${a.id}:${a.contentId}`.localeCompare(`${b.id}:${b.contentId}`));
}

async function preflight() {
  const candidate = assertCandidate();
  loadRuntimeWithoutPrintingSecrets();
  const { Repository, worker } = candidateModules();
  const repo = new Repository(process.env);
  try {
    await repo.health();
    const samples = await selectSamples(repo, worker.normalizePersistedAnalysis);
    const before = await dbSnapshot(repo, samples);
    const api = await apiSnapshot(samples);
    const capability = reconciliationCapability();
    const result = {
      runId: RUN_ID,
      phase: 'preflight',
      at: new Date().toISOString(),
      candidate: { root: CANDIDATE, manifestSha256: candidate.manifestHash },
      noNotifyGate: { envForcedDisabled: process.env.DINGTALK_ENABLED === 'false', failFastNotifier: true },
      servicesUntouched: true,
      sideEffects: { dbWrites: 0, aiCalls: 0, notificationAttempts: 0 },
      sampleCount: samples.length,
      samples,
      before,
      api,
      reconciliation: capability,
      positiveExistingAlertLinks: before.alerts.filter(row => row.content_id === FIXED_SAMPLES[3].contentId).length,
      controlledPositiveAlertRequired: !before.alerts.some(row => row.content_id === FIXED_SAMPLES[3].contentId && ['pending', 'processing'].includes(row.status)),
      writePhaseAllowed: capability.available,
      status: capability.available
        ? 'READY_FOR_WRITE_APPROVAL'
        : 'BLOCKED_MISSING_POSITIVE_ALERT_RECONCILIATION'
    };
    writeEvidence('preflight.json', result);
    return result;
  } finally { await repo.pool.end(); }
}

async function writePhase() {
  const result = await preflight();
  if (!result.reconciliation.available) {
    const failure = { runId: RUN_ID, phase: 'write', at: new Date().toISOString(), status: 'FAIL_STOPPED_BEFORE_WRITE', errorCode: 'POSITIVE_ALERT_RECONCILIATION_NOT_IMPLEMENTED', dbWrites: 0, aiCalls: 0, notificationAttempts: 0 };
    writeEvidence('write-blocked.json', failure);
    process.exitCode = 2;
    return failure;
  }
  if (!result.writePhaseAllowed) throw Object.assign(new Error('write phase preflight did not pass'), { code: 'WRITE_PHASE_NOT_ALLOWED' });
  const { Repository, AiAnalyzer, worker } = candidateModules();
  const repo = new Repository(process.env);
  const notifier = new FailFastNotifier();
  const positive = result.samples.find(sample => sample.role === 'positive_reconciliation');
  const controlledTitle = `[CONTROLLED ${RUN_ID}] positive reconciliation`;
  const ai = new AiAnalyzer(process.env);
  if (!ai.configured('light')) throw Object.assign(new Error('light AI profile is not configured'), { code: 'AI_ANALYSIS_NOT_CONFIGURED' });
  const profile = ai.selectProfile('light');
  let analyzeBatchCalls = 0; let providerBatchCalls = 0; let analyzedSampleCount = 0;
  const originalCallOnce = ai.callOnce.bind(ai);
  ai.callOnce = async (...args) => { providerBatchCalls += 1; return originalCallOnce(...args); };
  try {
    const aiItems = result.samples.map(sample => ({ title: sample.title, body: sample.body, platform: sample.platform, fingerprint: sample.fingerprint, gameId: sample.game_id, communityId: sample.community_id, regionCode: 'domestic' }));
    analyzeBatchCalls += 1; analyzedSampleCount += aiItems.length; writeProgress.aiAnalyzeBatchCalls += 1; writeProgress.analyzedSampleCount += aiItems.length;
    const rawResults = await ai.analyzeBatch(aiItems, 'light');
    const prepared = normalizeAndAssertRealAnalyses(result.samples, rawResults, worker, profile);
    let controlled = (await queryRows(repo, 'SELECT * FROM po_alerts WHERE title=? ORDER BY created_at DESC,id DESC LIMIT 1', [controlledTitle]))[0] || null;
    let created = false;
    if (!controlled) {
      controlled = await repo.insertAlert({
        gameId: positive.game_id,
        communityId: positive.community_id,
        severity: 'attention',
        alertType: 'ai_urgent',
        title: controlledTitle,
        triggerDetail: `controlled acceptance alert; runId=${RUN_ID}; contentId=${positive.id}; no-notify`,
        contentIds: [positive.id]
      });
      created = true; writeProgress.controlledAlertCreates += 1;
    }
    if (created && controlled.status !== 'pending') throw Object.assign(new Error('controlled alert was not created pending'), { code: 'CONTROLLED_ALERT_NOT_PENDING' });
    const firstReconciliation = await persistAnalysisPass(repo, prepared, RUN_ID, writeProgress);
    const afterFirst = await dbSnapshot(repo, result.samples);
    const firstAudits = await queryRows(repo, "SELECT * FROM po_audit_events WHERE event_type='positive_risk_alerts_reconciled' AND JSON_UNQUOTE(JSON_EXTRACT(detail,'$.runId'))=? AND JSON_UNQUOTE(JSON_EXTRACT(detail,'$.contentId'))=? ORDER BY created_at,id", [RUN_ID, positive.id]);
    const controlledAfter = afterFirst.alerts.find(row => row.id === controlled.id);
    if (!controlledAfter || controlledAfter.status !== 'false_positive' || !controlledAfter.resolved_at) throw Object.assign(new Error('controlled alert was not reconciled'), { code: 'CONTROLLED_ALERT_NOT_RECONCILED' });
    if (firstAudits.length !== 1) throw Object.assign(new Error('controlled reconciliation audit count mismatch'), { code: 'CONTROLLED_AUDIT_COUNT_MISMATCH' });
    const callsBeforeReplay = { analyzeBatchCalls, providerBatchCalls, analyzedSampleCount };
    const replayReconciliation = await persistAnalysisPass(repo, prepared, RUN_ID, writeProgress);
    const afterReplay = await dbSnapshot(repo, result.samples);
    const replayAudits = await queryRows(repo, "SELECT * FROM po_audit_events WHERE event_type='positive_risk_alerts_reconciled' AND JSON_UNQUOTE(JSON_EXTRACT(detail,'$.runId'))=? AND JSON_UNQUOTE(JSON_EXTRACT(detail,'$.contentId'))=? ORDER BY created_at,id", [RUN_ID, positive.id]);
    if (analyzeBatchCalls !== callsBeforeReplay.analyzeBatchCalls || providerBatchCalls !== callsBeforeReplay.providerBatchCalls || analyzedSampleCount !== callsBeforeReplay.analyzedSampleCount) throw Object.assign(new Error('idempotent replay made an additional AI call'), { code: 'REPLAY_AI_CALL_DETECTED' });
    if (JSON.stringify(stableAlertState(afterReplay.alerts)) !== JSON.stringify(stableAlertState(afterFirst.alerts))) throw Object.assign(new Error('idempotent replay changed alert state'), { code: 'REPLAY_ALERT_STATE_CHANGED' });
    if (replayAudits.length !== firstAudits.length) throw Object.assign(new Error('idempotent replay added an audit event'), { code: 'REPLAY_AUDIT_INCREMENTED' });
    if (JSON.stringify(afterReplay.notificationCounts) !== JSON.stringify(afterFirst.notificationCounts)) throw Object.assign(new Error('idempotent replay changed notification state'), { code: 'REPLAY_NOTIFICATION_INCREMENTED' });
    if (notifier.attempts !== 0) throw Object.assign(new Error('notification gate violation'), { code: 'NO_NOTIFY_GATE_VIOLATION' });
    const output = { runId: RUN_ID, phase: 'write', at: new Date().toISOString(), status: 'PASS', candidate: result.candidate, taskId: 'N/A (one-shot)', ai: { profile: 'light', configured: true, model: profile.model, analysisVersion: profile.version, analyzeBatchCalls, providerBatchCalls, analyzedSampleCount }, analyses: prepared.map(({ sample, analysis, audit }) => ({ role: sample.role, externalId: sample.external_id, contentId: sample.id, sentiment: analysis.sentiment, originalSeverity: analysis.originalSeverity, severity: analysis.severity, normalizationReasons: analysis.severityNormalizationReasons, analysisReason: analysis.analysisReason, analysisReasonAudit: audit, modelName: analysis.modelName, analysisVersion: analysis.analysisVersion })), controlledAlert: { id: controlled.id, created, status: controlledAfter.status, resolvedAt: controlledAfter.resolved_at }, firstReconciliation, replay: { aiCallsAdded: 0, reconciliation: replayReconciliation, alertsChanged: false, auditsAdded: 0, notificationsAdded: 0 }, auditIds: replayAudits.map(row => row.id), after: afterReplay, sideEffects: { notificationAttempts: notifier.attempts, serviceOperations: 0 }, outbox: afterReplay.messageTables.length ? afterReplay.outboxCounts : 'N/A' };
    writeEvidence('write.json', output);
    return output;
  } finally { await repo.pool.end(); }
}

async function simulateWriteContract() {
  const { worker } = candidateModules();
  const samples = FIXED_SAMPLES.map((sample, index) => ({ ...sample, id: sample.contentId, external_id: sample.externalId, fingerprint: `fp-${index}`, title: index < 2 ? '游戏异常' : '普通内容', body: index === 0 ? '红点消不掉' : index === 1 ? '云顶出 bug 导致无法正常游戏' : index === 2 ? '没什用' : '终于完成活动目标' }));
  const rawResults = [
    { sentiment: 'negative', severity: 'normal', negativeScore: 0.68, confidence: 0.97, reason: '功能异常' },
    { sentiment: 'negative', severity: 'attention', negativeScore: 0.8, confidence: 0.9, reason: '游戏 bug' },
    { sentiment: 'negative', severity: 'normal', negativeScore: 0.4, confidence: 0.6, reason: '体验不佳' },
    { sentiment: 'positive', severity: 'attention', negativeScore: 0.2, confidence: 0.85, reason: '活动达成' }
  ];
  const state = { alert: { id: 'controlled-1', status: 'pending' }, audits: 0, inserts: 0, aiCalls: 0 };
  const simulatedAnalyzeBatch = async () => { state.aiCalls += 1; return rawResults; };
  const prepared = normalizeAndAssertRealAnalyses(samples, await simulatedAnalyzeBatch(), worker, { version: 'sim-v1', model: 'sim-model' });
  const positiveId = FIXED_SAMPLES[3].contentId;
  const repo = { async insertAnalysis(contentId) { if (contentId === positiveId && state.inserts < 4 && state.alert.status !== 'pending') throw new Error('controlled alert must exist before positive persistence'); state.inserts += 1; }, async reconcilePositiveRiskAlerts(contentId, analysis) { if (analysis.sentiment === 'positive' && analysis.severity === 'normal' && state.alert.status === 'pending') { state.alert.status = 'false_positive'; state.audits += 1; return { reconciled: true, alertIds: [state.alert.id] }; } return { reconciled: false, alertIds: [] }; } };
  await persistAnalysisPass(repo, prepared, RUN_ID);
  const beforeReplay = { ...state };
  await persistAnalysisPass(repo, prepared, RUN_ID);
  if (state.aiCalls !== 1 || state.audits !== 1 || state.alert.status !== 'false_positive' || state.inserts !== 8) throw new Error('simulated write contract failed');
  return { status: 'SIMULATION_PASS', firstPassInserts: beforeReplay.inserts, replayInserts: state.inserts - beforeReplay.inserts, aiCalls: state.aiCalls, audits: state.audits, alertStatus: state.alert.status };
}

(async () => {
  if (!['preflight', 'write', 'simulate'].includes(MODE)) throw Object.assign(new Error(`unsupported phase: ${MODE}`), { code: 'INVALID_PHASE' });
  const result = MODE === 'preflight' ? await preflight() : MODE === 'write' ? await writePhase() : await simulateWriteContract();
  console.log(JSON.stringify(MODE === 'simulate' ? result : { runId: result.runId, phase: result.phase, status: result.status, sampleCount: result.sampleCount ?? 0, evidence: EVIDENCE }));
})().catch(error => {
  const failure = { runId: RUN_ID, phase: MODE, at: new Date().toISOString(), status: 'FAIL_STOPPED', error: sanitizeError(error), writeProgress, notificationAttempts: 0 };
  writeEvidence(`${MODE}-failure.json`, failure);
  console.error(JSON.stringify(failure));
  process.exitCode = 1;
});
