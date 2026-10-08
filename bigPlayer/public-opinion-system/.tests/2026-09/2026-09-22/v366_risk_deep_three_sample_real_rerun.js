'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadRuntimeEnv } = require('../../../server/src/runtimeEnv');
loadRuntimeEnv();

const { Repository } = require('../../../server/src/db/repository');
const { AiAnalyzer } = require('../../../server/src/integrations/aiAnalyzer');
const { Q1AnalysisRunner } = require('../../../worker/src/q1DailyAnalysisRunner');

const RUN_ID = String(process.env.APPROVED_RUN_ID || '').trim();
const SAMPLES = Object.freeze([
  { externalId: '919167', contentId: '74f19f1c-f027-4826-a042-fb49dcc19724' },
  { externalId: '6826813', contentId: '3454bd9f-8bec-43e6-8eb5-e296ff965575' },
  { externalId: '920120', contentId: '20a46255-d6db-4140-b6c5-10dc9d5c5ea1' }
]);
const BASELINE = { externalId: '919098', contentId: 'bc64d7a5-4032-49e9-80cd-4c83fabb7e94' };
const SCOPE = { sourceId: '5c21f78d-5f67-4467-963d-dcdeb5e26cab', gameId: '896b6b25-39ea-4979-bb87-8c1d7334fde7', communityId: '00000000-0000-0000-0000-000000000101' };
const EVIDENCE = path.join(__dirname, 'evidence', `v366-risk-deep-real-rerun-${RUN_ID}`);
const writeJson = (name, value) => { fs.mkdirSync(EVIDENCE, { recursive: true }); fs.writeFileSync(path.join(EVIDENCE, name), `${JSON.stringify(value, null, 2)}\n`); };
const assert = (condition, code) => { if (!condition) throw Object.assign(new Error(code), { code }); };

async function httpGet(base, pathname) {
  try {
    const response = await fetch(`${base}${pathname}`, { method: 'GET', signal: AbortSignal.timeout(10000) });
    const text = await response.text();
    let body; try { body = JSON.parse(text); } catch { body = text.slice(0, 500); }
    return { url: `${base}${pathname}`, status: response.status, body };
  } catch (error) { return { url: `${base}${pathname}`, status: 'unavailable', error: error.message }; }
}

async function snapshot(repo, phase) {
  const ids = [BASELINE.contentId, ...SAMPLES.map(item => item.contentId)];
  const marks = ids.map(() => '?').join(',');
  const [rows, jobs, api4320Health, api4320Contents, frontend3000Health, frontend3000Contents] = await Promise.all([
    repo.query(`SELECT c.id,c.external_id,c.source_id,c.game_id,c.community_id,c.fingerprint,a.sentiment,a.severity,a.analysis_level,a.analysis_version,a.model_name,a.analysis_reason,a.analyzed_at FROM po_contents c LEFT JOIN po_analyses a ON a.content_id=c.id WHERE c.id IN (${marks}) ORDER BY FIELD(c.id,${marks})`, [...ids, ...ids]),
    repo.query(`SELECT content_id,analysis_profile,analysis_version,status,attempts,error_code,completed_at FROM po_analysis_jobs WHERE content_id IN (${marks}) ORDER BY content_id,analysis_profile`, ids),
    httpGet('http://127.0.0.1:4320', '/health'),
    httpGet('http://127.0.0.1:4320', '/api/public-opinion/contents?page=1&pageSize=20&postId=919167'),
    httpGet('http://127.0.0.1:3000', '/health'),
    httpGet('http://127.0.0.1:3000', '/api/public-opinion/contents?page=1&pageSize=20&postId=919167')
  ]);
  const value = { runId: RUN_ID, phase, at: new Date().toISOString(), rows, jobs, api4320: { health: api4320Health, contents: api4320Contents }, frontend3000: { health: frontend3000Health, contents: frontend3000Contents } };
  writeJson(`${phase}.json`, value);
  return value;
}

async function main() {
  assert(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(RUN_ID), 'APPROVED_RUN_ID_REQUIRED');
  process.env.DINGTALK_ENABLED = 'false';
  delete process.env.DINGTALK_WEBHOOK;
  delete process.env.DINGTALK_SECRET;
  const repo = new Repository(process.env);
  const ai = new AiAnalyzer(process.env);
  let providerCalls = 0;
  let promptHash = null;
  let rawBody = null;
  try {
    await repo.health();
    const spec = ai.selectProfile('deep');
    assert(ai.configured('deep'), 'DEEP_AI_NOT_CONFIGURED');
    assert(spec.model === 'gpt-5.6-luna' && spec.version === 'sentiment-v1', 'DEEP_PROFILE_MISMATCH');
    ai.maxRetries = 0;
    ai.timeoutMs = Number(process.env.APPROVED_AI_TIMEOUT_MS || 30000);
    assert(ai.timeoutMs === 120000, 'APPROVED_TIMEOUT_MISMATCH');
    ai.profiles.deep.batchSize = 3;
    ai.profiles.deep.dailyCallLimit = 3;

    const before = await snapshot(repo, 'before');
    assert(before.api4320.health.status === 200 && before.api4320.health.body?.data?.database?.status === 'ok', 'API_4320_GATE_FAILED');
    assert(before.frontend3000.health.status === 200 && before.frontend3000.health.body?.data?.database?.status === 'ok', 'FRONTEND_3000_GATE_FAILED');
    assert(before.api4320.contents.status === 200 && before.frontend3000.contents.status === 200, 'THREE_ROUTE_CONTENT_GATE_FAILED');
    const byExternalId = new Map(before.rows.map(row => [String(row.external_id), row]));
    const baseline = byExternalId.get(BASELINE.externalId);
    assert(baseline?.id === BASELINE.contentId && baseline.sentiment === 'negative' && baseline.analysis_level === 'deep', 'STRICT_919098_BASELINE_MISMATCH');
    for (const sample of SAMPLES) {
      const row = byExternalId.get(sample.externalId);
      assert(row?.id === sample.contentId && row.source_id === SCOPE.sourceId && row.game_id === SCOPE.gameId && row.community_id === SCOPE.communityId, `SAMPLE_IDENTITY_MISMATCH_${sample.externalId}`);
    }

    const originalCallOnce = ai.callOnce.bind(ai);
    ai.callOnce = async (messages, profile) => {
      providerCalls += 1;
      assert(providerCalls <= 1, 'PROVIDER_CALL_LIMIT_EXCEEDED');
      assert(profile.name === 'deep' && profile.model === 'gpt-5.6-luna' && profile.version === 'sentiment-v1', 'PROVIDER_PROFILE_MISMATCH');
      promptHash = crypto.createHash('sha256').update(JSON.stringify(messages)).digest('hex');
      rawBody = await originalCallOnce(messages, profile);
      return rawBody;
    };

    for (const sample of SAMPLES) {
      await repo.enqueueAnalysisJob(sample.contentId, { profile: 'deep', version: 'sentiment-v1', contentFingerprint: byExternalId.get(sample.externalId).fingerprint, triggerReason: `approved_run:${RUN_ID}`, matchedKeywords: [], force: false });
    }
    const runner = new Q1AnalysisRunner({ repo, ai, alertEngine: { process: async () => { throw new Error('NOTIFICATION_GATE_VIOLATION'); } }, sourceId: SCOPE.sourceId, contentIds: SAMPLES.map(item => item.contentId), scope: { gameId: SCOPE.gameId, communityId: SCOPE.communityId }, claimOwner: `approved:${RUN_ID}`, batchSize: 3, deepBatchSize: 3, parallel: 1, deepParallel: 1, maxAttempts: 1, log: message => writeJson('runner-error.json', { runId: RUN_ID, message }) });
    const processed = await runner.processBatch('deep');
    assert(processed === 3 && providerCalls === 1 && promptHash && rawBody, 'REAL_RERUN_INCOMPLETE');

    const rawText = rawBody?.choices?.[0]?.message?.content;
    const rawItems = JSON.parse(String(rawText || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''));
    assert(Array.isArray(rawItems) && rawItems.length === 3, 'RAW_PROVIDER_OUTPUT_INCOMPLETE');
    const requestExternalIds = ['919167', '920120', '6826813'];
    for (const raw of rawItems) {
      const externalId = requestExternalIds[raw.i];
      assert(externalId, 'RAW_PROVIDER_INDEX_UNMAPPED');
      writeJson(`raw-provider-${externalId}.json`, { runId: RUN_ID, externalId, requestIndex: raw.i, promptHash, providerResponseId: rawBody.id || null, providerModel: rawBody.model || spec.model, usage: rawBody.usage || null, raw });
    }
    const after = await snapshot(repo, 'after');
    const afterByExternalId = new Map(after.rows.map(row => [String(row.external_id), row]));
    assert(afterByExternalId.get('919098')?.sentiment === 'negative' && afterByExternalId.get('919098')?.analysis_level === 'deep', 'STRICT_919098_BASELINE_CHANGED');
    for (const sample of SAMPLES) {
      const row = afterByExternalId.get(sample.externalId);
      assert(row?.analysis_level === 'deep' && row.analysis_version === 'sentiment-v1' && row.model_name === 'gpt-5.6-luna', `DEEP_RESULT_MISMATCH_${sample.externalId}`);
    }
    const result = { runId: RUN_ID, status: 'PASS', promptHash, providerCalls, samples: SAMPLES.map(item => ({ ...item, result: afterByExternalId.get(item.externalId) })), baseline: afterByExternalId.get('919098'), evidenceDir: EVIDENCE, sideEffects: { notifications: 0, port3001Accesses: 0 } };
    writeJson('result.json', result);
    console.log(JSON.stringify(result));
  } catch (error) {
    writeJson('failure.json', { runId: RUN_ID, status: 'FAIL_STOPPED', errorCode: error.code || error.message, providerCalls, promptHash, sideEffects: { notifications: 0, port3001Accesses: 0 } });
    throw error;
  } finally { await repo.pool.end(); }
}

main().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
