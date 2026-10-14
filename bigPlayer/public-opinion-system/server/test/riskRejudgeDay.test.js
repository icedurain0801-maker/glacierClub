const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { run, SCOPE, SQL, PARAMS } = require('../../scripts/rejudge-risk-day');
const { normalizeAnalysisResult, RISK_POLICY_VERSION } = require('../src/services/riskSeverityNormalizer');

test('bounded replay holds the consumer gate, preserves urgent review and suppresses all historical alerts', async () => {
  const output = path.resolve(__dirname, '../../../../.temp', `risk-v8-replay-test-${crypto.randomUUID()}`);
  const body = '超能世界账号被盗';
  const rows = [{ id: '1', body, title: '', fingerprint: 'fp', community_id: SCOPE.communityId, platform: SCOPE.platform, content_type: 'post', old_severity: 'attention' }];
  let scopeReads = 0, writes = 0, cacheWrites = 0, locked = false, unlocked = false;
  const repo = {
    async query(sql, params) {
      if (sql === SQL) { assert.deepEqual(params, PARAMS); return scopeReads++ ? [{ ...rows[0], old_severity: 'urgent', risk_context: { riskPolicyVersion: RISK_POLICY_VERSION } }] : rows; }
      assert.match(sql, /^SELECT fingerprint/); return [{ fingerprint: 'fp', community_id: SCOPE.communityId, is_deleted: 0 }];
    },
    async acquireAdvisoryLock(name) { assert.equal(name, 'po-analysis-consumer'); locked = true; return true; },
    async releaseAdvisoryLock() { unlocked = true; },
    async insertAnalysis(id, a) { assert.equal(locked, true); assert.equal(id, '1'); assert.equal(a.severity, 'urgent'); assert.ok(a.riskDecision.downgrade_suggest); writes++; },
    async upsertAnalysisCache() { cacheWrites++; }
  };
  const risk = { level: 'L3', level_name: '紧急告警', gate_result: 'GATE2_pass_L3', claim_type: 'fact', issue_object: '账号', claim_evidence: body, issue_summary: '账号被盗', confidence: 0.9, evidence_types: [], action_intent: [], hit_rules: ['R6'], rule_evidence: { R6: body } };
  const ai = { profiles: { light: { batchSize: 5, version: 'v' }, deep: { batchSize: 5, version: 'v' } }, callState: {}, configured: () => true, cacheKey: (_, p) => p.version,
    async analyzeBatch(items, profile) { assert.equal(locked, false); return [normalizeAnalysisResult({ sentiment: 'negative', severity: profile === 'light' ? 'urgent' : 'attention', confidence: 0.9,
      riskDecision: profile === 'light' ? risk : { ...risk, claim_type: 'emotion', hit_rules: ['G1'], rule_evidence: {} } }, items[0])]; } };
  const r = await run({ repo, ai, normalizeAnalysisResult, policyVersion: RISK_POLICY_VERSION, output, apply: true });
  assert.equal(writes, 1); assert.equal(cacheWrites, 2); assert.equal(unlocked, true);
  assert.equal(r.createdAlerts, 0); assert.equal(r.historicalNotifications, false); assert.equal(r.status, 'completed');
  assert.ok(fs.existsSync(path.join(output, 'snapshot.json')));
});

test('readonly preview makes no AI calls or writes and includes unanalyzed contents', async () => {
  const output = path.resolve(__dirname, '../../../../.temp', `risk-v8-readonly-test-${crypto.randomUUID()}`);
  const ai = { profiles: { light: { batchSize: 5 }, deep: { batchSize: 5 } }, analyzeBatch() { throw Error('must not call AI'); } };
  const repo = { async query(sql, params) { assert.equal(sql, SQL); assert.deepEqual(params, PARAMS); return [{ id: 'c', content_type: 'comment' }]; } };
  const r = await run({ repo, ai, policyVersion: RISK_POLICY_VERSION, output });
  assert.equal(r.total, 1); assert.equal(r.needsPolicy, 1); assert.equal(r.historicalNotifications, false);
  assert.equal(fs.existsSync(path.join(output, 'snapshot.json')), false);
});

test('followup replay selects only late arrivals and preserves previously rejudged rows', async () => {
  const output = path.resolve(__dirname, '../../../../.temp', `risk-v8-late-arrival-test-${crypto.randomUUID()}`);
  const old = { id: 'old', body: '已重判内容', fingerprint: 'old-fp', content_type: 'post', risk_context: { riskPolicyVersion: RISK_POLICY_VERSION }, old_severity: 'normal' };
  const late = { id: 'late', body: '超能世界太坑了', fingerprint: 'new-fp', content_type: 'comment', community_id: SCOPE.communityId };
  let scopeReads = 0, writes = [];
  const repo = { async query(sql) {
    if (sql === SQL) return scopeReads++ ? [old, { ...late, old_severity: 'attention', risk_context: { riskPolicyVersion: RISK_POLICY_VERSION } }] : [old, late];
    return [{ fingerprint: 'new-fp', is_deleted: 0, community_id: SCOPE.communityId }];
  }, acquireAdvisoryLock: async () => true, releaseAdvisoryLock: async () => {},
  insertAnalysis: async id => writes.push(id), upsertAnalysisCache: async () => {} };
  const ai = { profiles: { light: { batchSize: 5, version: 'v' }, deep: { batchSize: 5, version: 'v' } }, configured: () => true, cacheKey: () => 'key', callState: {},
    async analyzeBatch(items) { assert.equal(items.length, 1); assert.equal(items[0].fingerprint, 'new-fp'); return [{ sentiment: 'negative', severity: 'attention', confidence: 0.9,
      riskDecision: { level: 'L1', claim_type: 'emotion', confidence: 0.9, issue_summary: null, evidence_types: [], hit_rules: ['G1'], action_intent: [], rule_evidence: {}, claim_evidence: '太坑了' } }]; } };
  const r = await run({ repo, ai, normalizeAnalysisResult, policyVersion: RISK_POLICY_VERSION, output, apply: true });
  assert.deepEqual(writes, ['late']); assert.equal(r.selected, 1); assert.equal(r.completed, 1);
  assert.equal(r.remainingOldPolicy, 0); assert.equal(r.transitions['unanalyzed->attention'], 1);
});
