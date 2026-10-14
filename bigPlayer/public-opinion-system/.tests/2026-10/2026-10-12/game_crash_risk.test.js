const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { correction, preview, apply } = require('../../../scripts/reconcile-content-risk');
const runtimeRoot = process.env.PO_RISK_TEST_RUNTIME_ROOT || path.resolve(__dirname, '../../..');
const policy = require(path.join(runtimeRoot, 'server/src/services/riskSeverityNormalizer'));
const contentId = '0399ee49-35e3-4223-bc08-632b7a2d2b94';
const body = 'Hey all. So when I start rally’s to alliance boss my game crashes maybe like 1 out of 10 times. Pretty annoying cause loose time reconnecting and end up out of sync with other players. Is this a common thing or my phone issue?';
const fingerprint = 'a'.repeat(64);
const content = { id: contentId, game_id: contentId, source_id: contentId, account_id: null, title: null, body, fingerprint, is_deleted: 0 };
const analysis = { id: contentId, content_id: contentId, content_fingerprint: fingerprint, sentiment: 'negative', severity: 'attention', negative_score: '0.6000', risk_context: null, analysis_level: 'light', analysis_version: 'sentiment-v1', model_name: 'test' };

test('截图原文即使低强度和低置信度，也按实际崩溃问题归负面待处理', () => {
  for (const negativeScore of [0.1, 0.5, 0.6]) {
    const result = policy.normalizeSeverity({ sentiment: 'negative', severity: 'attention', negativeScore, confidence: 0.1, body });
    assert.equal(result.severity, 'negative'); assert.equal(result.gameIssueMatched, true);
  }
  for (const text of ['我的游戏一直崩溃，导致无法正常打联盟boss', '游戏频繁闪退，影响战斗', 'The game keeps crashing when I start a rally']) {
    assert.equal(policy.normalizeSeverity({ sentiment: 'negative', severity: 'attention', negativeScore: 0.1, body: text }).severity, 'negative');
  }
  assert.equal(correction(analysis, content, policy), 'negative');
});
test('普通咨询、无故障说明、正面解决方法分享不因崩溃词升级', () => {
  for (const text of ['Where is the crash FAQ?', '请问游戏崩溃反馈入口在哪？', 'My game does not crash', '请问闪退解决方法在哪里看？']) {
    assert.equal(policy.normalizeSeverity({ sentiment: 'negative', severity: 'attention', negativeScore: 0.1, body: text }).severity, 'attention');
  }
  assert.equal(policy.normalizeSeverity({ sentiment: 'positive', severity: 'attention', body: '游戏闪退解决了，现在玩得很顺畅' }).severity, 'normal');
  assert.throws(() => correction(analysis, { ...content, body: 'Where is the crash FAQ?' }, policy), /not an eligible/);
});
test('校正拒绝过期分析、已删除内容、紧急内容及旧风险策略', async () => {
  assert.throws(() => correction({ ...analysis, content_fingerprint: 'old' }, content, policy), /stale/);
  assert.throws(() => correction(analysis, { ...content, is_deleted: 1 }, policy), /deleted/);
  assert.throws(() => correction({ ...analysis, severity: 'urgent' }, content, policy), /not an eligible/);
  await assert.rejects(preview({}, contentId, { SEVERITY_RANK: { urgent: 2 } }), /runtime must support/);
});
test('隔离MySQL：预览只读、记录缓存审计原子校正、幂等、并发变化和审计失败回滚', async t => {
  require('../../../server/src/runtimeEnv').loadRuntimeEnv();
  const mysql = require('mysql2/promise');
  const database = 'public_opinion_crash_risk_test';
  const env = process.env;
  const config = env.DATABASE_URL ? { uri: env.DATABASE_URL } : { host: env.DB_HOST || '127.0.0.1', port: Number(env.DB_PORT || 3306), user: env.DB_USER || 'root', password: env.DB_PASSWORD || '', database: env.DB_NAME || 'public_opinion' };
  const admin = await mysql.createConnection(config);
  await admin.query(`CREATE DATABASE IF NOT EXISTS ${database} CHARACTER SET utf8mb4`); await admin.end();
  const isolated = { ...env, DB_NAME: database };
  if (env.DATABASE_URL) { const url = new URL(env.DATABASE_URL); url.pathname = '/' + database; isolated.DATABASE_URL = url.toString(); }
  const { Repository } = require(path.join(runtimeRoot, 'server/src/db/repository'));
  const repo = new Repository(isolated);
  try {
    assert.equal((await repo.query('SELECT DATABASE() AS name'))[0].name, database);
    await repo.query('CREATE TABLE IF NOT EXISTS po_contents (id CHAR(36) PRIMARY KEY,game_id CHAR(36),source_id CHAR(36),account_id CHAR(36),title TEXT,body TEXT,fingerprint CHAR(64),is_deleted TINYINT)');
    await repo.query('CREATE TABLE IF NOT EXISTS po_analyses (id CHAR(36) PRIMARY KEY,content_id CHAR(36) UNIQUE,content_fingerprint CHAR(64),sentiment VARCHAR(20),severity VARCHAR(20),negative_score DECIMAL(5,4),risk_context JSON,analysis_level VARCHAR(20),analysis_version VARCHAR(80),model_name VARCHAR(120))');
    await repo.query('CREATE TABLE IF NOT EXISTS po_analysis_cache (cache_key CHAR(64) PRIMARY KEY,content_fingerprint CHAR(64),sentiment VARCHAR(20),severity VARCHAR(20),negative_score DECIMAL(5,4),risk_context JSON,analysis_profile VARCHAR(20),analysis_version VARCHAR(80),model_name VARCHAR(120))');
    await repo.query('CREATE TABLE IF NOT EXISTS po_audit_events (id CHAR(36) PRIMARY KEY,game_id CHAR(36),source_id CHAR(36),account_id CHAR(36),actor_type VARCHAR(30),actor_id VARCHAR(160),event_type VARCHAR(80),outcome VARCHAR(30),detail JSON)');
    await repo.query('REPLACE INTO po_contents VALUES (?,?,?,?,?,?,?,?)', Object.values(content));
    await repo.query('REPLACE INTO po_analyses VALUES (?,?,?,?,?,?,?,?,?,?)', Object.values(analysis));
    await repo.query('REPLACE INTO po_analysis_cache VALUES (?,?,?,?,?,?,?,?,?)', ['b'.repeat(64), fingerprint, 'negative', 'attention', 0.6, null, 'light', 'sentiment-v1', 'test']);
    const plan = await preview(repo, contentId, policy);
    assert.equal((await repo.query('SELECT severity FROM po_analyses'))[0].severity, 'attention');
    const updated = await apply(repo, plan, policy);
    assert.equal(updated.analysisChanged, 1); assert.equal(updated.cacheChanged, 1);
    assert.equal((await repo.query('SELECT severity FROM po_analyses'))[0].severity, 'negative');
    assert.equal((await repo.query('SELECT severity FROM po_analysis_cache'))[0].severity, 'negative');
    assert.equal((await repo.query('SELECT COUNT(*) AS count FROM po_audit_events'))[0].count, 2);
    const retry = await apply(repo, await preview(repo, contentId, policy), policy);
    assert.equal(retry.analysisChanged + retry.cacheChanged, 0);
    await repo.query("UPDATE po_analyses SET severity='attention'"); await repo.query("UPDATE po_analysis_cache SET severity='attention'");
    const stale = await preview(repo, contentId, policy);
    await repo.query("UPDATE po_contents SET body='updated'");
    await assert.rejects(apply(repo, stale, policy), /changed since preview/);
    await repo.query('UPDATE po_contents SET body=?', [body]);
    const cacheStale = await preview(repo, contentId, policy);
    await repo.query("UPDATE po_analysis_cache SET negative_score=0.2");
    await assert.rejects(apply(repo, cacheStale, policy), /cache changed/);
    await repo.query('UPDATE po_analysis_cache SET negative_score=0.6');
    const rollbackPlan = await preview(repo, contentId, policy);
    const rollbackRepo = { pool: { getConnection: async () => {
      const conn = await repo.pool.getConnection(); const originalQuery = conn.query, originalRelease = conn.release;
      const query = originalQuery.bind(conn);
      conn.query = async (sql, params) => { if (sql.startsWith('INSERT INTO po_audit_events')) throw new Error('injected audit failure'); return query(sql, params); };
      conn.release = () => { conn.query = originalQuery; conn.release = originalRelease; originalRelease.call(conn); };
      return conn;
    } } };
    await assert.rejects(apply(rollbackRepo, rollbackPlan, policy), /injected audit failure/);
    assert.equal((await repo.query('SELECT severity FROM po_analyses'))[0].severity, 'attention');
    assert.equal((await repo.query('SELECT severity FROM po_analysis_cache'))[0].severity, 'attention');
    t.diagnostic('仅写 public_opinion_crash_risk_test 隔离库');
  } finally {
    await repo.query('DELETE FROM po_audit_events WHERE game_id=?', [contentId]);
    await repo.query('DELETE FROM po_analysis_cache WHERE content_fingerprint=?', [fingerprint]);
    await repo.query('DELETE FROM po_analyses WHERE content_id=?', [contentId]);
    await repo.query('DELETE FROM po_contents WHERE id=?', [contentId]);
    await repo.pool.end();
  }
});
