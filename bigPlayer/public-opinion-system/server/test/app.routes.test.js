const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

// A4 写接口路由集成测试：起真实 server，用临时 game/source 落库验证契约。
// 全程在独立 DB（public_opinion_test）跑，结束清场；凭据用固定测试密钥，明文不回显。
process.env.DB_NAME = 'public_opinion_test';
process.env.CREDENTIAL_ENC_KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
// SSRF 白名单是唯一可信边界（env 控）。测试里指定一个允许域，用于验证 POST/PATCH baseUrl 校验。
process.env.BIGPLAYER_H5_ALLOWED_HOSTS = 'community.bigplayer.com';
process.env.BIGPLAYER_H5_ENABLED = 'true';
process.env.BIGPLAYER_H5_API_BASE_URL = 'https://community.bigplayer.com';
process.env.PUBLIC_OPINION_CORS_ORIGIN = 'http://127.0.0.1:8123,http://localhost:8093';
process.env.LOGIN_SESSION_INTERNAL_TOKEN = 'test-login-session-internal-token';

const { Repository } = require('../src/db/repository');

  const mockLoginSession = {
    async bindAccount() { return { bound: true }; },
    async startLogin() { return { status: 'pending', sessionRef: 'test-session-ref' }; }
  };
async function api(path, options = {}) {
  const response = await fetch(`${base}${path}`, { headers: { 'content-type': 'application/json' }, ...options });
  return { status: response.status, body: await response.json() };
}

test.before(async () => {
  repo = new Repository();
  // 建库 + 灌入最小 schema（复用迁移脚本不现实——这里是测试库，直接建两张要用的表即可）。
  await repo.query('CREATE TABLE IF NOT EXISTS po_games (id VARCHAR(64) PRIMARY KEY, name VARCHAR(120), kind VARCHAR(20) DEFAULT \'owned\', enabled TINYINT DEFAULT 1, dingtalk_webhook_ref VARCHAR(120), created_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
  await repo.query('CREATE TABLE IF NOT EXISTS po_sources (id VARCHAR(64) PRIMARY KEY, game_id VARCHAR(64), community_id VARCHAR(64) NULL, platform VARCHAR(40), source_type VARCHAR(20) DEFAULT \'owned_community\', display_name VARCHAR(120), enabled TINYINT DEFAULT 0, frequency_seconds INT DEFAULT 1800, config TEXT NULL, active_window TEXT NULL, auth_status VARCHAR(20) DEFAULT \'unconfigured\', auth_expire_at DATETIME NULL, collect_requested_at DATETIME NULL, last_success_at DATETIME NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
  await repo.query('CREATE TABLE IF NOT EXISTS po_communities (id VARCHAR(64) PRIMARY KEY, game_id VARCHAR(64) NOT NULL, name VARCHAR(160) NOT NULL, status VARCHAR(20) DEFAULT \'enabled\', sort_order INT DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY po_communities_test_game_name_uk (game_id, name))');
  await repo.query('ALTER TABLE po_games ADD COLUMN IF NOT EXISTS region_code VARCHAR(20) NOT NULL DEFAULT \'domestic\'');
  await repo.query('ALTER TABLE po_sources ADD COLUMN IF NOT EXISTS community_id VARCHAR(64) NULL');
  await repo.query('ALTER TABLE po_sources ADD COLUMN IF NOT EXISTS default_account_id VARCHAR(64) NULL');
  await repo.query('ALTER TABLE po_accounts ADD COLUMN IF NOT EXISTS community_id VARCHAR(64) NULL');
  await repo.query('ALTER TABLE po_contents ADD COLUMN IF NOT EXISTS community_id VARCHAR(64) NULL');
  await repo.query('ALTER TABLE po_alerts ADD COLUMN IF NOT EXISTS community_id VARCHAR(64) NULL');
  await repo.query('ALTER TABLE po_keyword_rules ADD COLUMN IF NOT EXISTS community_id VARCHAR(64) NULL');
  await repo.query('ALTER TABLE po_communities ADD COLUMN IF NOT EXISTS external_id VARCHAR(32) NULL');
  await repo.query('ALTER TABLE po_communities ADD COLUMN IF NOT EXISTS managed_by VARCHAR(80) NULL');
  await repo.query('ALTER TABLE po_games ADD COLUMN IF NOT EXISTS external_id VARCHAR(32) NULL');
  await repo.query('ALTER TABLE po_communities ADD COLUMN IF NOT EXISTS region_code VARCHAR(20) NULL');

  // 历史测试库可能残留旧结构（无 config/source_type 列）；幂等补列，保证软删除/新增读写可用。
  await repo.query('ALTER TABLE po_sources ADD COLUMN IF NOT EXISTS config TEXT NULL');
  await repo.query('ALTER TABLE po_sources ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) DEFAULT \'owned_community\'');
  await repo.query('ALTER TABLE po_sources ADD UNIQUE KEY IF NOT EXISTS po_sources_test_identity_uk (game_id, platform, display_name)');
  await repo.query('CREATE TABLE IF NOT EXISTS po_accounts (id VARCHAR(64) PRIMARY KEY, game_id VARCHAR(64), community_id VARCHAR(64) NULL, source_id VARCHAR(64), platform VARCHAR(40), platform_account_id VARCHAR(255), account_name VARCHAR(160), account_type VARCHAR(20) DEFAULT \'official\', profile_url TEXT NULL, enabled TINYINT DEFAULT 1, auth_status VARCHAR(40) DEFAULT \'unconfigured\', auth_expire_at DATETIME NULL, last_full_sync_at DATETIME NULL, last_incremental_sync_at DATETIME NULL, masked_login_identifier VARCHAR(255) NULL, metadata TEXT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY po_accounts_test_identity_uk (game_id, platform, platform_account_id))');
  await repo.query('ALTER TABLE po_accounts ADD COLUMN IF NOT EXISTS masked_login_identifier VARCHAR(255) NULL');
  await repo.query('CREATE TABLE IF NOT EXISTS po_credentials (id VARCHAR(64) PRIMARY KEY, account_id VARCHAR(64) NULL, source_id VARCHAR(64), credential_type VARCHAR(40) DEFAULT \'api_token\', secret_ref VARCHAR(160), secret_cipher TEXT NULL, status VARCHAR(20) DEFAULT \'unconfigured\', last_checked_at DATETIME NULL, expire_at DATETIME NULL, failure_reason TEXT NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
  await repo.query('ALTER TABLE po_credentials ADD COLUMN IF NOT EXISTS account_id VARCHAR(64) NULL');
  await repo.query('ALTER TABLE po_credentials ADD COLUMN IF NOT EXISTS credential_type VARCHAR(40) DEFAULT \'api_token\'');
  await repo.query('ALTER TABLE po_credentials ADD UNIQUE KEY IF NOT EXISTS po_credentials_test_account_type_uk (account_id, credential_type)');
  await repo.query('ALTER TABLE po_sync_checkpoints ADD COLUMN IF NOT EXISTS `cursor` TEXT NULL');
  await repo.query('ALTER TABLE po_sync_checkpoints ADD COLUMN IF NOT EXISTS task_kind VARCHAR(40) NOT NULL DEFAULT \'sync\'');
  await repo.query('ALTER TABLE po_sync_checkpoints ADD COLUMN IF NOT EXISTS task_key VARCHAR(255) NOT NULL DEFAULT \'\'');
  await repo.query('ALTER TABLE po_sync_checkpoints ADD COLUMN IF NOT EXISTS last_item_at DATETIME NULL');
  await repo.query('ALTER TABLE po_sync_checkpoints ADD COLUMN IF NOT EXISTS lease_owner VARCHAR(160) NULL');
  await repo.query('ALTER TABLE po_sync_checkpoints ADD COLUMN IF NOT EXISTS lease_until DATETIME NULL');
  await repo.query('CREATE UNIQUE INDEX IF NOT EXISTS po_sync_checkpoints_test_task_uk ON po_sync_checkpoints (account_id, task_kind, task_key, sync_scope, root_platform_content_id)');  await repo.query('CREATE TABLE IF NOT EXISTS po_sync_runs (id VARCHAR(64) PRIMARY KEY, account_id VARCHAR(64), status VARCHAR(30) DEFAULT \'queued\', sync_mode VARCHAR(20) DEFAULT \'incremental\', requested_at DATETIME DEFAULT CURRENT_TIMESTAMP, started_at DATETIME NULL, finished_at DATETIME NULL, discovered_count INT DEFAULT 0, stored_count INT DEFAULT 0, fetched_count INT DEFAULT 0, inserted_count INT DEFAULT 0, changed_count INT DEFAULT 0, unchanged_count INT DEFAULT 0, comment_count INT DEFAULT 0, error_code VARCHAR(80) NULL, error_message TEXT NULL, lease_owner VARCHAR(160) NULL, lease_until DATETIME NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
  await repo.query('ALTER TABLE po_sync_runs ADD COLUMN IF NOT EXISTS requested_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  await repo.query('ALTER TABLE po_sync_runs ADD COLUMN IF NOT EXISTS created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  await repo.query('ALTER TABLE po_sync_runs ADD COLUMN IF NOT EXISTS fetched_count INT DEFAULT 0');
  await repo.query('ALTER TABLE po_sync_runs ADD COLUMN IF NOT EXISTS inserted_count INT DEFAULT 0');
  await repo.query('ALTER TABLE po_sync_runs ADD COLUMN IF NOT EXISTS changed_count INT DEFAULT 0');
  await repo.query('ALTER TABLE po_sync_runs ADD COLUMN IF NOT EXISTS unchanged_count INT DEFAULT 0');
  await repo.query('ALTER TABLE po_sync_runs ADD COLUMN IF NOT EXISTS comment_count INT DEFAULT 0');
  await repo.query('ALTER TABLE po_sync_runs ADD COLUMN IF NOT EXISTS lease_owner VARCHAR(160) NULL');
  await repo.query('ALTER TABLE po_sync_runs ADD COLUMN IF NOT EXISTS lease_until DATETIME NULL');
  await repo.query('ALTER TABLE po_sync_runs ADD COLUMN IF NOT EXISTS updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  await repo.query('CREATE TABLE IF NOT EXISTS po_sync_run_contents (sequence_no BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, run_id VARCHAR(64) NOT NULL, content_id VARCHAR(64) NOT NULL, sync_scope VARCHAR(20) NOT NULL, change_type VARCHAR(20) NOT NULL, fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY po_sync_run_contents_test_uk (run_id, content_id, sync_scope))');
  await repo.query('CREATE TABLE IF NOT EXISTS po_contents (id VARCHAR(64) PRIMARY KEY, game_id VARCHAR(64), source_id VARCHAR(64), account_id VARCHAR(64) NULL, external_id VARCHAR(255), content_type VARCHAR(20), platform_author_id VARCHAR(255) NULL, author_name VARCHAR(160) NULL, title TEXT NULL, body TEXT NULL, published_at DATETIME NULL, source_url TEXT NULL, engagement TEXT NULL, raw_payload TEXT NULL, is_deleted TINYINT DEFAULT 0, UNIQUE KEY po_contents_test_identity_uk (source_id, external_id))');
  await repo.query(`CREATE TABLE IF NOT EXISTS po_alerts (id VARCHAR(64) PRIMARY KEY, game_id VARCHAR(64), severity VARCHAR(20), alert_type VARCHAR(20), title VARCHAR(255), trigger_detail TEXT, status VARCHAR(20) DEFAULT 'pending', assignee_id VARCHAR(64) NULL, resolution_note TEXT NULL, ding_talk_status VARCHAR(20) DEFAULT 'not_sent', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, resolved_at DATETIME NULL)`);
  await repo.query('ALTER TABLE po_contents ADD COLUMN IF NOT EXISTS community_id VARCHAR(64) NULL');
  await repo.query('ALTER TABLE po_contents ADD COLUMN IF NOT EXISTS fingerprint CHAR(64) NULL');
  await repo.query('ALTER TABLE po_contents ADD COLUMN IF NOT EXISTS root_content_id VARCHAR(64) NULL');
  await repo.query('ALTER TABLE po_contents ADD COLUMN IF NOT EXISTS parent_content_id VARCHAR(64) NULL');
  await repo.query('ALTER TABLE po_contents ADD COLUMN IF NOT EXISTS content_depth INT NOT NULL DEFAULT 0');
  await repo.query('ALTER TABLE po_contents ADD COLUMN IF NOT EXISTS collected_at DATETIME NULL');
  await repo.query('CREATE INDEX IF NOT EXISTS po_contents_game_collected_idx ON po_contents (game_id, collected_at, id)');
  await repo.query('CREATE INDEX IF NOT EXISTS po_contents_source_collected_idx ON po_contents (source_id, collected_at, id)');
  await repo.query('ALTER TABLE po_alerts ADD COLUMN IF NOT EXISTS community_id VARCHAR(64) NULL');
  await repo.query('CREATE TABLE IF NOT EXISTS po_analyses (content_id VARCHAR(64) PRIMARY KEY, sentiment VARCHAR(20) NULL, severity VARCHAR(20) NULL, negative_score DECIMAL(5,4) NULL, analyzed_at DATETIME NULL)');
  await repo.query('ALTER TABLE po_analyses ADD COLUMN IF NOT EXISTS sentiment VARCHAR(20) NULL');
  await repo.query('ALTER TABLE po_analyses ADD COLUMN IF NOT EXISTS severity VARCHAR(20) NULL');
  await repo.query('ALTER TABLE po_analyses ADD COLUMN IF NOT EXISTS negative_score DECIMAL(5,4) NULL');
  await repo.query('ALTER TABLE po_analyses ADD COLUMN IF NOT EXISTS analyzed_at DATETIME NULL');
  await repo.query('ALTER TABLE po_analyses ADD COLUMN IF NOT EXISTS topics TEXT NULL');
  await repo.query('ALTER TABLE po_analyses ADD COLUMN IF NOT EXISTS matched_keywords TEXT NULL');
  await repo.query('ALTER TABLE po_analyses ADD COLUMN IF NOT EXISTS summary TEXT NULL');
  await repo.query('CREATE INDEX IF NOT EXISTS po_analyses_sentiment_cover_idx ON po_analyses (sentiment, severity, content_id)');
  await repo.query('ALTER TABLE po_keyword_rules ADD COLUMN IF NOT EXISTS community_id VARCHAR(64) NULL');
  await repo.query(`CREATE TABLE IF NOT EXISTS po_quality_candidates (
    id VARCHAR(64) PRIMARY KEY,
    content_id VARCHAR(64) NOT NULL,
    quality_score DECIMAL(5,4) NULL,
    recommend_home TINYINT(1) NOT NULL DEFAULT 0,
    recommend_pin TINYINT(1) NOT NULL DEFAULT 0,
    recommend_feature TINYINT(1) NOT NULL DEFAULT 0,
    quality_reason VARCHAR(255) NULL,
    analysis_version VARCHAR(80) NOT NULL,
    model_name VARCHAR(120) NULL,
    content_fingerprint CHAR(64) NULL,
    home_review_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    pin_review_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    feature_review_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    home_adopted TINYINT(1) NOT NULL DEFAULT 0,
    pin_adopted TINYINT(1) NOT NULL DEFAULT 0,
    feature_adopted TINYINT(1) NOT NULL DEFAULT 0,
    reviewer_id VARCHAR(120) NULL,
    review_note VARCHAR(1000) NULL,
    reviewed_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY po_quality_candidates_test_content_uk (content_id)
  )`);
  await repo.query('CREATE TABLE IF NOT EXISTS po_source_capabilities (id VARCHAR(64) PRIMARY KEY, source_id VARCHAR(64), capability VARCHAR(80), status VARCHAR(30) DEFAULT \'unknown\', detail TEXT NULL, checked_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY po_source_capabilities_test_uk (source_id, capability))');
  await repo.query('CREATE TABLE IF NOT EXISTS po_keyword_rules (id VARCHAR(64) PRIMARY KEY, game_id VARCHAR(64), platform VARCHAR(40) NULL, keyword VARCHAR(160), group_name VARCHAR(120) NULL, severity VARCHAR(20) DEFAULT \'attention\', trigger_mode VARCHAR(20) DEFAULT \'aggregate\', window_seconds INT DEFAULT 1800, threshold_count INT DEFAULT 1, enabled TINYINT DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
  gameId = 'g-test-1';
  sourceId = 's-test-1';
  await repo.query('DELETE FROM po_alert_contents WHERE alert_id LIKE ?', ['alert-detail-%']);
  await repo.query('DELETE FROM po_quality_candidates WHERE id LIKE ?', ['quality-test-%']);
  await repo.query('DELETE FROM po_alerts WHERE id LIKE ?', ['alert-detail-%']);
  await repo.query('DELETE FROM po_contents WHERE id LIKE ? OR id LIKE ?', ['alert-detail-%', 'quality-test-%']);
  await repo.query('DELETE FROM po_keyword_rules WHERE game_id=?', [gameId]);
  await repo.query('DELETE FROM po_credentials WHERE source_id=?', [sourceId]);
  await repo.query('DELETE FROM po_accounts WHERE id=? OR game_id=?', ['a-test-1', gameId]);
  await repo.query('DELETE FROM po_sources WHERE id=? OR game_id=?', [sourceId, gameId]);
  await repo.query('DELETE FROM po_communities WHERE id=? OR game_id=?', ['c-test-1', gameId]);
  await repo.query('DELETE FROM po_games WHERE id=?', [gameId]);
  await repo.query('INSERT INTO po_games (id, name) VALUES (?,?)', [gameId, '测试游戏']);
  await repo.query('INSERT INTO po_communities (id, game_id, name) VALUES (?,?,?)', ['c-test-1', gameId, '测试社区']);
  await repo.query('INSERT INTO po_sources (id, game_id, community_id, platform, display_name, enabled, auth_status) VALUES (?,?,?,?,?,?,?)', [sourceId, gameId, 'c-test-1', 'bigplayer_h5', '测试源', 1, 'authorized']);
  await repo.query('INSERT INTO po_accounts (id, game_id, community_id, source_id, platform, platform_account_id, account_name, enabled, auth_status, metadata) VALUES (?,?,?,?,?,?,?,?,?,?)', ['a-test-1', gameId, 'c-test-1', sourceId, 'bigplayer_h5', 'tenant-test', '测试账号', 1, 'authorized', '{}']);
  await repo.query('UPDATE po_sources SET default_account_id=? WHERE id=?', ['a-test-1', sourceId]);
  const cipher = require('../src/integrations/credentialCipher').encrypt('test-account-token');
  await repo.query('INSERT INTO po_credentials (id, account_id, source_id, credential_type, secret_cipher, status) VALUES (?,?,?,?,?,?)', ['cr-test-1', 'a-test-1', sourceId, 'api_token', cipher, 'active']);

  const mod = require('../src/app');
  mod.loginSessionClient.configured = () => true;
  mod.loginSessionClient.bindAccount = async () => ({ bound: true });
  mod.loginSessionClient.startLogin = async () => ({ status: 'pending', sessionRef: 'test-session-ref' });
  mod.communityDirectory.refresh = async () => [];
  server = mod.server.listen(0);
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}/api/public-opinion`;
});

test.after(async () => {
  try { await repo.query('DELETE FROM po_alert_contents WHERE alert_id LIKE ?', ['alert-detail-%']); await repo.query('DELETE FROM po_quality_candidates WHERE id LIKE ?', ['quality-test-%']); await repo.query('DELETE FROM po_alerts WHERE id LIKE ?', ['alert-detail-%']); await repo.query('DELETE FROM po_contents WHERE id LIKE ? OR id LIKE ?', ['alert-detail-%', 'quality-test-%']); await repo.query('DELETE FROM po_keyword_rules WHERE game_id=?', [gameId]); await repo.query('DELETE FROM po_sync_run_contents WHERE run_id IN (SELECT id FROM po_sync_runs WHERE account_id IN (SELECT id FROM po_accounts WHERE game_id=?))', [gameId]); await repo.query('DELETE FROM po_sync_runs WHERE account_id IN (SELECT id FROM po_accounts WHERE game_id=?)', [gameId]); await repo.query('DELETE FROM po_credentials WHERE source_id IN (SELECT id FROM po_sources WHERE game_id=?)', [gameId]); await repo.query('DELETE FROM po_accounts WHERE game_id=?', [gameId]); await repo.query('DELETE FROM po_sources WHERE game_id=?', [gameId]); await repo.query('DELETE FROM po_games WHERE id=?', [gameId]); } catch {}
  if (server) await new Promise(resolve => server.close(resolve));
  if (repo && repo.pool) await repo.pool.end();
  // app.js 内部另持一个模块级 repo 连接池，测试结束需一并关闭，否则进程不退出。
  try { const mod = require('../src/app'); if (mod.repo && mod.repo.pool) await mod.repo.pool.end(); } catch {}
});

test('CORS 允许 localhost:8093 且预检与实际响应一致', async () => {
  const origin = 'http://localhost:8093';
  const preflight = await fetch(`${base}/games`, { method: 'OPTIONS', headers: { origin } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.equal(preflight.headers.get('vary'), 'Origin');
  const get = await fetch(`${base}/games`, { headers: { origin } });
  assert.equal(get.status, 200);
  assert.equal(get.headers.get('access-control-allow-origin'), origin);
});

test('社区写接口已下线并返回外部管理错误', async () => {
  for (const [path, method] of [['/communities', 'POST'], ['/communities/c-test-1', 'PATCH']]) {
    const result = await api(path, { method, body: JSON.stringify({ name: '不应写入' }) });
    assert.equal(result.status, 410);
    assert.equal(result.body.error.code, 'COMMUNITY_MANAGED_EXTERNALLY');
  }
});

test('GET /overview 接受 period 时间视图并拒绝非法参数', async () => {
  const today = await api('/overview?period=today&gameId=g-test-1&communityId=c-test-1');
  assert.equal(today.status, 200);
  assert.ok(today.body.data.metrics);
  const yesterday = await api('/overview?period=yesterday&gameId=g-test-1');
  assert.equal(yesterday.status, 200);
  const invalidPeriod = await api('/overview?period=month');
  assert.equal(invalidPeriod.status, 400);
  assert.equal(invalidPeriod.body.error.code, 'INVALID_INPUT');
  const unknown = await api('/overview?period=today&unexpected=1');
  assert.equal(unknown.status, 400);
  const conflict = await api('/overview?period=week&from=2026-08-01T00:00:00.000Z');
  assert.equal(conflict.status, 400);
  const reversed = await api('/overview?from=2026-08-08T00:00:00.000Z&to=2026-08-01T00:00:00.000Z');
  assert.equal(reversed.status, 400);
});

test('GET /contents/:id 保留内容树翻译字段并为评论映射翻译对象', async () => {
  const mod = require('../src/app');
  const originalGetContentTree = mod.repo.getContentTree;
  const originalListContents = mod.repo.listContents;
  const root = {
    id: 'translation-detail-root',
    game_id: 'g-overseas-test',
    source_id: 's-overseas-test',
    content_type: 'post',
    region_code: 'overseas',
    translation_target_language: 'zh-CN',
    translation_status: 'completed',
    translated_title: '详情树译文标题',
    translated_body: '详情树译文正文',
    translation_source_language: 'en',
    translation_version: 'translation-v1',
    translated_at: '2026-09-09T08:00:00.000Z',
    translation_error_code: null
  };
  const comment = {
    id: 'translation-detail-comment',
    root_content_id: root.id,
    parent_content_id: root.id,
    content_type: 'comment',
    region_code: 'overseas',
    translation_status: 'failed',
    translated_title: null,
    translated_body: null,
    translation_error_code: 'TRANSLATION_PROVIDER_ERROR'
  };

  try {
    mod.repo.getContentTree = async () => [root, comment];
    // listContents 是分析视图；其中的过期翻译列不得覆盖 getContentTree 的当前值。
    mod.repo.listContents = async () => [{
      ...root,
      analysis_status: 'completed',
      summary: '分析摘要',
      translation_status: 'not_requested',
      translated_title: null,
      translated_body: null,
      translation_source_language: null
    }];

    const result = await api(`/contents/${root.id}`);
    assert.equal(result.status, 200);
    assert.equal(result.body.data.content.summary, '分析摘要');
    assert.deepEqual(result.body.data.content.translation, {
      targetLanguage: 'zh-CN',
      status: 'completed',
      title: '详情树译文标题',
      body: '详情树译文正文',
      sourceLanguage: 'en',
      version: 'translation-v1',
      translatedAt: '2026-09-09T08:00:00.000Z',
      errorCode: null
    });
    assert.equal(result.body.data.comments.length, 1);
    assert.equal(result.body.data.comments[0].translation.status, 'failed');
    assert.equal(result.body.data.comments[0].translation.errorCode, 'TRANSLATION_PROVIDER_ERROR');
  } finally {
    mod.repo.getContentTree = originalGetContentTree;
    mod.repo.listContents = originalListContents;
  }
});

test('GET /alerts/:id 返回帖子和评论的完整原文，PATCH 保持处置能力', async () => {
  const longBody = `第一行\n${'完整帖子正文'.repeat(50)}\n最后一行`;
  const alertId = 'alert-detail-full';
  await repo.query('INSERT INTO po_contents (id, game_id, source_id, external_id, content_type, author_name, platform_author_id, title, body, published_at, source_url) VALUES (?,?,?,?,?,?,?,?,?,?,?), (?,?,?,?,?,?,?,?,?,?,?)', [
    'alert-detail-post', gameId, sourceId, 'alert-post', 'post', '帖子作者', 'author-post', '完整帖子', longBody, '2026-08-14 09:00:00', 'https://community.bigplayer.com/post/1',
    'alert-detail-comment', gameId, sourceId, 'alert-comment', 'comment', '评论作者', 'author-comment', '', '完整评论正文', '2026-08-14 09:05:00', 'https://community.bigplayer.com/post/1#comment'
  ]);
  await repo.query('INSERT INTO po_alerts (id, game_id, severity, alert_type, title, trigger_detail, status) VALUES (?,?,?,?,?,?,?)', [alertId, gameId, 'urgent', 'ai_urgent', '详情测试告警', '游戏：测试游戏\n严重度：urgent', 'pending']);
  await repo.query('INSERT INTO po_alert_contents (alert_id, content_id) VALUES (?,?), (?,?)', [alertId, 'alert-detail-post', alertId, 'alert-detail-comment']);

  const detail = await api(`/alerts/${alertId}`);
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.body.data.related_contents.map(item => item.content_type), ['post', 'comment']);
  assert.equal(detail.body.data.related_contents[0].body, longBody);
  assert.equal(detail.body.data.related_contents[0].author_id, 'author-post');
  assert.equal(detail.body.data.related_contents[1].author_id, 'author-comment');
  assert.equal(detail.body.data.related_contents[1].body, '完整评论正文');

  const patch = await api(`/alerts/${alertId}`, { method: 'PATCH', body: JSON.stringify({ status: 'processing', resolutionNote: '正在处理' }) });
  assert.equal(patch.status, 200);
  assert.equal(patch.body.data.status, 'processing');
  assert.equal(patch.body.data.resolution_note, '正在处理');
  assert.equal(patch.body.data.related_contents.length, 2);
});

test('GET /alerts/:id 返回原帖线程及完整评论回复，并标记实际命中内容', async () => {
  const alertId = 'alert-detail-thread';
  await repo.query('INSERT INTO po_contents (id, game_id, source_id, external_id, content_type, author_name, platform_author_id, title, body, published_at, content_depth) VALUES (?,?,?,?,?,?,?,?,?,?,?), (?,?,?,?,?,?,?,?,?,?,?), (?,?,?,?,?,?,?,?,?,?,?)', [
    'alert-detail-thread-post', gameId, sourceId, 'alert-detail-thread-post-external', 'post', '原帖作者', 'thread-author', '原帖标题', '完整原帖正文', '2026-08-14 10:00:00', 0,
    'alert-detail-thread-comment', gameId, sourceId, 'alert-detail-thread-comment-external', 'comment', '评论作者', 'comment-author', '', '一级评论正文', '2026-08-14 10:05:00', 1,
    'alert-detail-thread-reply', gameId, sourceId, 'alert-detail-thread-reply-external', 'comment', '回复作者', 'reply-author', '', '二级回复正文', '2026-08-14 10:06:00', 2
  ]);
  await repo.query('UPDATE po_contents SET root_content_id=?, parent_content_id=? WHERE id=?', ['alert-detail-thread-post', 'alert-detail-thread-post', 'alert-detail-thread-comment']);
  await repo.query('UPDATE po_contents SET root_content_id=?, parent_content_id=? WHERE id=?', ['alert-detail-thread-post', 'alert-detail-thread-comment', 'alert-detail-thread-reply']);
  await repo.query('INSERT INTO po_alerts (id, game_id, severity, alert_type, title, trigger_detail) VALUES (?,?,?,?,?,?)', [alertId, gameId, 'urgent', 'ai_urgent', '评论命中告警', '摘录：一级评论正文']);
  await repo.query('INSERT INTO po_alert_contents (alert_id, content_id) VALUES (?,?)', [alertId, 'alert-detail-thread-comment']);

  const detail = await api(`/alerts/${alertId}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.related_threads.length, 1);
  assert.equal(detail.body.data.related_threads[0].root.id, 'alert-detail-thread-post');
  assert.deepEqual(detail.body.data.related_threads[0].matched_content_ids, ['alert-detail-thread-comment']);
  assert.deepEqual(detail.body.data.related_threads[0].comments.map(item => item.id), ['alert-detail-thread-comment', 'alert-detail-thread-reply']);
});

test('GET /alerts/:id 可用唯一摘录回溯没有关联记录的历史告警', async () => {
  const alertId = 'alert-detail-recovered';
  await repo.query('INSERT INTO po_contents (id, game_id, source_id, external_id, content_type, author_name, title, body, published_at, content_depth) VALUES (?,?,?,?,?,?,?,?,?,?)', [
    'alert-detail-recovered-post', gameId, sourceId, 'alert-detail-recovered-external', 'post', '历史作者', '唯一历史标题', '这是一段仅用于当前路由测试的唯一历史告警原文', '2026-08-14 11:00:00', 0
  ]);
  await repo.query('INSERT INTO po_alerts (id, game_id, severity, alert_type, title, trigger_detail) VALUES (?,?,?,?,?,?)', [alertId, gameId, 'urgent', 'ai_urgent', '历史告警', '严重度：urgent\n摘录：这是一段仅用于当前路由测试的唯一历史告警原文']);

  const detail = await api(`/alerts/${alertId}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.related_contents[0].id, 'alert-detail-recovered-post');
  assert.equal(detail.body.data.related_threads[0].root.body, '这是一段仅用于当前路由测试的唯一历史告警原文');
  assert.equal(detail.body.data.relation_status, 'recovered');
  const links = await repo.query('SELECT content_id FROM po_alert_contents WHERE alert_id=?', [alertId]);
  assert.deepEqual(links.map(item => item.content_id), ['alert-detail-recovered-post']);
});

test('GET /alerts/:id 无法唯一回溯时返回明确关联状态，未知告警返回 404', async () => {
  const alertId = 'alert-detail-empty';
  await repo.query('INSERT INTO po_alerts (id, game_id, severity, alert_type, title, trigger_detail) VALUES (?,?,?,?,?,?)', [alertId, gameId, 'attention', 'aggregate', '无关联告警', '规则']);
  const empty = await api(`/alerts/${alertId}`);
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.data.related_contents, []);
  assert.deepEqual(empty.body.data.related_threads, []);
  assert.equal(empty.body.data.relation_status, 'missing');
  const missing = await api('/alerts/alert-detail-missing');
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, 'NOT_FOUND');
});

test('quality contents support scoped listing, detail, and independent review', async () => {
  const contentId = 'quality-test-content';
  const candidateId = 'quality-test-candidate';
  await repo.query('DELETE FROM po_quality_candidates WHERE id=?', [candidateId]);
  await repo.query('DELETE FROM po_contents WHERE id=?', [contentId]);
  await repo.query('INSERT INTO po_contents (id, game_id, community_id, source_id, external_id, content_type, author_name, title, body, published_at, source_url, fingerprint) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [contentId, gameId, 'c-test-1', sourceId, 'quality-external', 'post', '优质作者', '优质候选标题', '这是一段足够长、结构完整、包含明确问题背景、影响范围、复现步骤和解决建议的优质社区内容，用于验证优质内容接口的真实筛选条件。', '2026-08-20 09:00:00', 'https://community.bigplayer.com/post/quality', 'a'.repeat(64)]);
  await repo.query('INSERT INTO po_quality_candidates (id, content_id, quality_score, recommend_home, recommend_pin, recommend_feature, quality_reason, analysis_version, model_name, content_fingerprint) VALUES (?,?,?,?,?,?,?,?,?,?)', [candidateId, contentId, 0.95, 1, 1, 1, '兼具公共价值与栏目参考价值', 'deep-v2', 'quality-model', 'a'.repeat(64)]);

  const list = await api(`/quality-contents?regionCode=domestic&gameId=${gameId}&communityId=c-test-1&sourceId=${sourceId}&recommendationType=home&reviewStatus=pending&page=1&pageSize=20`);
  assert.equal(list.status, 200);
  assert.equal(list.body.meta.total, 1);
  assert.equal(list.body.data[0].id, candidateId);
  assert.equal(list.body.data[0].community_name, '测试社区');

  const detail = await api(`/quality-contents/${candidateId}?gameId=${gameId}&communityId=c-test-1`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.body, '这是一段足够长、结构完整、包含明确问题背景、影响范围、复现步骤和解决建议的优质社区内容，用于验证优质内容接口的真实筛选条件。');
  const outsideScope = await api(`/quality-contents/${candidateId}?communityId=other-community`);
  assert.equal(outsideScope.status, 404);

  const accepted = await api(`/quality-contents/${candidateId}?gameId=${gameId}&communityId=c-test-1`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-admin-user': 'reviewer-1' }, body: JSON.stringify({ homeReviewStatus: 'accepted', reviewNote: '采纳首页推荐' }) });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.data.home_review_status, 'accepted');
  assert.equal(accepted.body.data.home_adopted, true);
  assert.equal(accepted.body.data.pin_review_status, 'pending');
  assert.equal(accepted.body.data.feature_review_status, 'pending');
  assert.equal(accepted.body.data.reviewer_id, 'reviewer-1');

  for (const [path, body] of [
    ['/quality-contents?page=0', null],
    ['/quality-contents?recommendationType=unknown', null],
    [`/quality-contents/${candidateId}`, { qualityScore: 1 }],
    [`/quality-contents/${candidateId}`, { pinReviewStatus: 'accepted', pinAdopted: false }],
    [`/quality-contents/${candidateId}`, {}]
  ]) {
    const invalid = body == null ? await api(path) : await api(path, { method: 'PATCH', body: JSON.stringify(body) });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error.code, 'INVALID_INPUT');
  }
});

test('independent review API normalizes booleans and exposes alert candidates fail-closed', async () => {
  const contentId = 'quality-test-contract-content';
  const emptyContentId = 'alert-detail-review-empty-content';
  const candidateId = 'quality-test-contract-candidate';
  const alertId = 'alert-detail-review-contract';
  const emptyAlertId = 'alert-detail-review-empty';
  const longBody = '这是一段用于验证独立审核接口合同的完整正文，必须足够长以通过优质内容候选的服务端筛选条件，并确保测试只验证返回结构。';

  try {
    await repo.query('INSERT INTO po_contents (id, game_id, community_id, source_id, external_id, content_type, author_name, title, body, published_at, fingerprint) VALUES (?,?,?,?,?,?,?,?,?,?,?), (?,?,?,?,?,?,?,?,?,?,?)', [
      contentId, gameId, 'c-test-1', sourceId, 'quality-contract-external', 'post', '合同作者', '合同候选', longBody, '2026-09-10 09:00:00', 'b'.repeat(64),
      emptyContentId, gameId, 'c-test-1', sourceId, 'quality-contract-empty', 'post', '空态作者', '无候选告警', longBody, '2026-09-10 09:05:00', 'c'.repeat(64)
    ]);
    await repo.query('INSERT INTO po_quality_candidates (id, content_id, quality_score, recommend_home, recommend_pin, recommend_feature, quality_reason, analysis_version, model_name, content_fingerprint, home_review_status, pin_review_status, feature_review_status, home_adopted, pin_adopted, feature_adopted) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [candidateId, contentId, 0.95, 1, 0, 1, '合同测试推荐理由', 'deep-v2', 'quality-model', 'b'.repeat(64), 'accepted', 'rejected', 'pending', 1, 0, 0]);
    await repo.query('INSERT INTO po_alerts (id, game_id, community_id, severity, alert_type, title, trigger_detail) VALUES (?,?,?,?,?,?,?), (?,?,?,?,?,?,?)', [
      alertId, gameId, 'c-test-1', 'urgent', 'ai_urgent', '有独立审核候选', '合同测试',
      emptyAlertId, gameId, 'c-test-1', 'attention', 'aggregate', '无独立审核候选', '合同测试'
    ]);
    await repo.query('INSERT INTO po_alert_contents (alert_id, content_id) VALUES (?,?), (?,?)', [alertId, contentId, emptyAlertId, emptyContentId]);

    const list = await api(`/quality-contents?gameId=${gameId}&communityId=c-test-1&page=1&pageSize=20`);
    assert.equal(list.status, 200);
    const listed = list.body.data.find(item => item.id === candidateId);
    assert.ok(listed);
    for (const key of ['recommend_home', 'recommend_pin', 'recommend_feature', 'home_adopted', 'pin_adopted', 'feature_adopted', 'canReview']) assert.equal(typeof listed[key], 'boolean', key);
    assert.deepEqual([listed.recommend_home, listed.recommend_pin, listed.recommend_feature], [true, false, true]);
    assert.equal(listed.canReview, true);

    const detail = await api(`/quality-contents/${candidateId}?gameId=${gameId}&communityId=c-test-1`);
    assert.equal(detail.status, 200);
    assert.deepEqual([detail.body.data.recommend_home, detail.body.data.recommend_pin, detail.body.data.recommend_feature], [true, false, true]);
    assert.equal(detail.body.data.canReview, true);

    const patched = await api(`/quality-contents/${candidateId}?gameId=${gameId}&communityId=c-test-1`, { method: 'PATCH', body: JSON.stringify({ featureReviewStatus: 'accepted' }) });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.data.feature_review_status, 'accepted');
    assert.equal(patched.body.data.feature_adopted, true);
    assert.equal(typeof patched.body.data.recommend_feature, 'boolean');
    assert.equal(patched.body.data.canReview, true);

    const alerts = await api(`/alerts?gameId=${gameId}&communityId=c-test-1&page=1&pageSize=100`);
    assert.equal(alerts.status, 200);
    const listedAlert = alerts.body.data.find(item => item.id === alertId);
    const listedEmpty = alerts.body.data.find(item => item.id === emptyAlertId);
    assert.ok(listedAlert);
    assert.ok(listedEmpty);
    assert.equal(listedAlert.independent_reviews.length, 1);
    assert.deepEqual(listedEmpty.independent_reviews, []);
    const review = listedAlert.independent_reviews[0];
    assert.equal(review.candidateId, candidateId);
    assert.equal(review.contentId, contentId);
    assert.equal(review.canReview, true);
    for (const key of ['recommend_home', 'recommend_pin', 'recommend_feature', 'home_adopted', 'pin_adopted', 'feature_adopted']) assert.equal(typeof review[key], 'boolean', key);
    assert.deepEqual([review.recommend_home, review.recommend_pin, review.recommend_feature], [true, false, true]);

    const alertDetail = await api(`/alerts/${alertId}?gameId=${gameId}&communityId=c-test-1`);
    const emptyAlertDetail = await api(`/alerts/${emptyAlertId}?gameId=${gameId}&communityId=c-test-1`);
    assert.equal(alertDetail.status, 200);
    assert.equal(alertDetail.body.data.independent_reviews[0].candidateId, candidateId);
    assert.equal(alertDetail.body.data.independent_reviews[0].canReview, true);
    assert.deepEqual(emptyAlertDetail.body.data.independent_reviews, []);
  } finally {
    await repo.query('DELETE FROM po_alert_contents WHERE alert_id IN (?,?)', [alertId, emptyAlertId]);
    await repo.query('DELETE FROM po_quality_candidates WHERE id=?', [candidateId]);
    await repo.query('DELETE FROM po_alerts WHERE id IN (?,?)', [alertId, emptyAlertId]);
    await repo.query('DELETE FROM po_contents WHERE id IN (?,?)', [contentId, emptyContentId]);
  }
});

test('source responses expose only posts/comments and sanitize historical reply URL aliases', async () => {
  const historicalConfig = { baseUrl: 'https://community.bigplayer.com/', repliesApiUrl: 'https://community.bigplayer.com/legacy-replies', replies_api_url: 'https://community.bigplayer.com/legacy-snake' };
  await repo.query('UPDATE po_sources SET config=? WHERE id=?', [JSON.stringify(historicalConfig), sourceId]);
  const res = await api(`/sources?gameId=${gameId}`);
  assert.equal(res.status, 200);
  const source = res.body.data.find(item => item.id === sourceId);
  assert.deepEqual(Object.keys(source.capabilities).sort(), ['comments', 'posts']);
  const cfg = typeof source.config === 'string' ? JSON.parse(source.config) : source.config;
  assert.equal(cfg.repliesApiUrl, undefined);
  assert.equal(cfg.replies_api_url, undefined);
  const stored = await repo.query('SELECT config FROM po_sources WHERE id=?', [sourceId]);
  assert.equal(JSON.parse(stored[0].config).repliesApiUrl, historicalConfig.repliesApiUrl, '响应脱敏不得改写历史 DB');
});

test('sync status hides historical replies checkpoints', async () => {
  await repo.query('DELETE FROM po_sync_checkpoints WHERE account_id=?', ['a-test-1']);
  await repo.query('INSERT INTO po_sync_checkpoints (id, account_id, sync_scope, root_platform_content_id, status) VALUES (?,?,?,?,?), (?,?,?,?,?)', ['cp-posts', 'a-test-1', 'posts', '', 'idle', 'cp-replies', 'a-test-1', 'replies', 'legacy-comment', 'completed']);
  const res = await api('/accounts/a-test-1/sync-status');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.map(item => item.sync_scope), ['posts']);
  const explicit = await api('/accounts/a-test-1/sync-status?scope=replies');
  assert.equal(explicit.status, 200);
  assert.deepEqual(explicit.body.data, []);
});

test('PATCH /sources/:id 更新采集频率 preserves historical reply config but does not expose it', async () => {
  const before = (await repo.query('SELECT config FROM po_sources WHERE id=?', [sourceId]))[0].config;
  const res = await api(`/sources/${sourceId}`, { method: 'PATCH', body: JSON.stringify({ frequencySeconds: 900 }) });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.frequency_seconds, 900);
  const belowFloor = await api(`/sources/${sourceId}`, { method: 'PATCH', body: JSON.stringify({ frequencySeconds: 600 }) });
  assert.equal(belowFloor.status, 400);
  assert.equal(belowFloor.body.error.code, 'INVALID_INPUT');
  const responseConfig = typeof res.body.data.config === 'string' ? JSON.parse(res.body.data.config) : res.body.data.config;
  assert.equal(responseConfig.repliesApiUrl, undefined);
  const after = (await repo.query('SELECT config FROM po_sources WHERE id=?', [sourceId]))[0].config;
  assert.equal(after, before);
});

test('legacy PATCH repliesApiUrl is accepted and ignored while posts/comments remain configurable', async () => {
  const before = JSON.parse((await repo.query('SELECT config FROM po_sources WHERE id=?', [sourceId]))[0].config);
  const res = await api(`/sources/${sourceId}`, { method: 'PATCH', body: JSON.stringify({
    postsApiUrl: 'https://community.bigplayer.com/posts',
    commentsApiUrl: 'https://community.bigplayer.com/comments',
    repliesApiUrl: 'https://evil.example.com/ignored'
  }) });
  assert.equal(res.status, 200);
  const stored = JSON.parse((await repo.query('SELECT config FROM po_sources WHERE id=?', [sourceId]))[0].config);
  assert.equal(stored.postsApiUrl, 'https://community.bigplayer.com/posts');
  assert.equal(stored.commentsApiUrl, 'https://community.bigplayer.com/comments');
  assert.equal(stored.repliesApiUrl, before.repliesApiUrl, 'legacy reply URL must not overwrite history');
  const responseConfig = typeof res.body.data.config === 'string' ? JSON.parse(res.body.data.config) : res.body.data.config;
  assert.equal(responseConfig.repliesApiUrl, undefined);
});

 test('POST /sources accepts legacy repliesApiUrl but creates no reply config', async () => {
  const res = await api('/sources', { method: 'POST', body: JSON.stringify({
    gameId, communityId: 'c-test-1', platform: 'bigplayer_h5', displayName: 'legacy reply input', platformAccountId: 'tenant-legacy-reply',
    postsApiUrl: 'https://community.bigplayer.com/posts', commentsApiUrl: 'https://community.bigplayer.com/comments',
    repliesApiUrl: 'https://evil.example.com/ignored', apiToken: 'test-token'
  }) });
  assert.equal(res.status, 201);
  const cfg = typeof res.body.data.config === 'string' ? JSON.parse(res.body.data.config) : res.body.data.config;
  assert.equal(cfg.repliesApiUrl, undefined);
  const stored = JSON.parse((await repo.query('SELECT config FROM po_sources WHERE id=?', [res.body.data.id]))[0].config);
  assert.equal(stored.repliesApiUrl, undefined);
});

 test('check-capabilities exposes only posts/comments', async () => {
  const res = await api(`/sources/${sourceId}/check-capabilities`, { method: 'POST' });
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body.data.capabilities).sort(), ['comments', 'posts']);
});

test('PATCH /sources/:id/configuration 原子保存 H5 配置并支持空凭据保留', async () => {
  const before = (await repo.query('SELECT secret_cipher FROM po_credentials WHERE account_id=? AND credential_type=?', ['a-test-1', 'api_token']))[0].secret_cipher;
  const res = await api(`/sources/${sourceId}/configuration`, { method: 'PATCH', body: JSON.stringify({ displayName: 'H5 原子配置', baseUrl: 'https://community.bigplayer.com/', frequencySeconds: 900, syncMode: 'incremental', historyStart: null, enabled: false, credential: {} }) });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.display_name, 'H5 原子配置');
  assert.ok(!JSON.stringify(res.body).includes(before));
  const after = (await repo.query('SELECT secret_cipher FROM po_credentials WHERE account_id=? AND credential_type=?', ['a-test-1', 'api_token']))[0].secret_cipher;
  assert.equal(after, before);
  const legacyHistoryStart = '2026-08-01T00:00:00Z';
  await repo.query('UPDATE po_sources SET config=? WHERE id=?', [JSON.stringify({ baseUrl: 'https://community.bigplayer.com/', syncMode: 'backfill', historyStart: legacyHistoryStart }), sourceId]);
  await repo.query('UPDATE po_accounts SET metadata=? WHERE id=?', [JSON.stringify({ syncMode: 'backfill', historyStart: legacyHistoryStart }), 'a-test-1']);
  const preserved = await api(`/sources/${sourceId}/configuration`, { method: 'PATCH', body: JSON.stringify({ displayName: 'H5 基础配置', baseUrl: 'https://community.bigplayer.com/', frequencySeconds: 3600, credential: {} }) });
  assert.equal(preserved.status, 200, '基础配置保存不应要求历史回溯字段');
  assert.equal(preserved.body.data.display_name, 'H5 基础配置');
  const preservedSourceConfig = JSON.parse((await repo.query('SELECT config FROM po_sources WHERE id=?', [sourceId]))[0].config);
  const preservedAccountMetadata = JSON.parse((await repo.query('SELECT metadata FROM po_accounts WHERE id=?', ['a-test-1']))[0].metadata);
  assert.deepEqual({ syncMode: preservedSourceConfig.syncMode, historyStart: preservedSourceConfig.historyStart }, { syncMode: 'backfill', historyStart: legacyHistoryStart });
  assert.deepEqual({ syncMode: preservedAccountMetadata.syncMode, historyStart: preservedAccountMetadata.historyStart }, { syncMode: 'backfill', historyStart: legacyHistoryStart });
  await repo.query('UPDATE po_sources SET config=? WHERE id=?', [JSON.stringify({ baseUrl: 'https://community.bigplayer.com/', syncMode: 'incremental', historyStart: null }), sourceId]);
  await repo.query('UPDATE po_accounts SET metadata=? WHERE id=?', [JSON.stringify({ syncMode: 'incremental', historyStart: null }), 'a-test-1']);
});
test('PATCH /sources/:id 非法频率返回 400', async () => {
  const res = await api(`/sources/${sourceId}`, { method: 'PATCH', body: JSON.stringify({ frequencySeconds: -5 }) });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_INPUT');
});

test('PATCH /sources/:id 不存在返回 404', async () => {
  const res = await api('/sources/does-not-exist', { method: 'PATCH', body: JSON.stringify({ enabled: true }) });
  assert.equal(res.status, 404);
});

test('PUT /sources/:id/credential 加密落库且响应不回显明文', async () => {
  const secret = 'cookie=SESSION=top-secret-value';
  const res = await api(`/sources/${sourceId}/credential`, { method: 'PUT', body: JSON.stringify({ secret }) });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.configured, true);
  // 响应体任何字段都不得包含明文
  assert.ok(!JSON.stringify(res.body).includes('top-secret-value'), '响应不得回显明文');
  // 库里存的是密文
  const rows = await repo.query('SELECT * FROM po_credentials WHERE account_id=?', ['a-test-1']);
  assert.ok(rows[0].secret_cipher, '密文已落库');
  assert.ok(!rows[0].secret_cipher.includes('top-secret-value'), '密文不含明文');
});

test('PUT /sources/:id/credential 允许同一 source 保存多种账号级凭据并可重复更新', async () => {
  const token = await api(`/sources/${sourceId}/credential`, { method: 'PUT', body: JSON.stringify({ secret: 'token-for-regression' }) });
  assert.equal(token.status, 200);

  const password = 'password-for-regression';
  const first = await api(`/sources/${sourceId}/credential`, {
    method: 'PUT',
    body: JSON.stringify({ credentialType: 'account_password', account: 'test-login-account', password, confirmPassword: password })
  });
  assert.equal(first.status, 200);
  assert.ok(!JSON.stringify(first.body).includes(password), '账号密码响应不得回显密码');

  const secondPassword = 'updated-password-for-regression';
  const second = await api(`/sources/${sourceId}/credential`, {
    method: 'PUT',
    body: JSON.stringify({ credentialType: 'account_password', account: 'test-login-account', password: secondPassword, confirmPassword: secondPassword })
  });
  assert.equal(second.status, 200);
  assert.ok(!JSON.stringify(second.body).includes(secondPassword), '更新响应不得回显密码');

  const rows = await repo.query('SELECT credential_type, COUNT(*) AS total FROM po_credentials WHERE source_id=? GROUP BY credential_type ORDER BY credential_type', [sourceId]);
  assert.deepEqual(rows.map(row => [row.credential_type, Number(row.total)]), [['account_password', 1], ['api_token', 1]]);
});


test('GET /sources returns non-sensitive credential summary without ciphertext', async () => {
  const password = 'summary-password-regression';
  const { encrypt } = require('../src/integrations/credentialCipher');
  await repo.upsertAccountCredential('a-test-1', {
    credentialType: 'account_password',
    secretCipher: encrypt(JSON.stringify({ account: 'summary-login-account', password }), process.env, { aad: `a-test-1:account_password:bigplayer_h5` }),
    status: 'active'
  });
  await repo.updateAccount('a-test-1', { maskedLoginIdentifier: 'su******nt' });

  const res = await api(`/sources?gameId=${gameId}`);
  assert.equal(res.status, 200);
  const source = res.body.data.find(item => item.id === sourceId);
  assert.equal(source.account.hasToken, true);
  assert.equal(source.account.hasAccountPassword, true);
  assert.equal(source.account.maskedAccount, 'su******nt');
  assert.equal(JSON.stringify(source).includes(password), false);
  assert.equal(JSON.stringify(source).includes('secret_cipher'), false);
});

test('internal credential resolver is reachable only with internal auth and never exposes ciphertext', async () => {
  const password = 'resolver-password-regression';
  const account = 'resolver-login-account';
  const { encrypt } = require('../src/integrations/credentialCipher');
  await repo.upsertAccountCredential('a-test-1', {
    credentialType: 'account_password',
    secretCipher: encrypt(JSON.stringify({ account, password }), process.env, { aad: `a-test-1:account_password:bigplayer_h5` }),
    status: 'active'
  });
  await repo.query('UPDATE po_sources SET config=? WHERE id=?', [JSON.stringify({ baseUrl: 'https://community.bigplayer.com/' }), sourceId]);
  const endpoint = base.replace('/api/public-opinion', '/internal/v1/credentials/resolve?request=login');
  const body = JSON.stringify({
    credentialRef: 'credential:a-test-1:account_password',
    sourceId,
    accountId: 'a-test-1',
    platform: 'bigplayer_h5',
    credentialType: 'account_password'
  });

  const denied = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  assert.equal(denied.status, 401);
  assert.equal(denied.headers.get('cache-control'), 'no-store');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.LOGIN_SESSION_INTERNAL_TOKEN}` },
    body
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const payload = await response.json();
  assert.deepEqual(payload.data, { account, password, baseUrl: 'https://community.bigplayer.com/' });
  assert.equal(JSON.stringify(payload).includes('secret_cipher'), false);
});

test('source and account login routes restore the in-memory binding before starting login', async () => {
  const mod = require('../src/app');
  const originalBindAccount = mod.loginSessionClient.bindAccount;
  const originalStartLogin = mod.loginSessionClient.startLogin;
  const calls = [];
  mod.loginSessionClient.bindAccount = async payload => {
    calls.push({ action: 'bind', payload });
    return { status: 'pending_verification' };
  };
  mod.loginSessionClient.startLogin = async payload => {
    calls.push({ action: 'start', payload });
    return { status: 'active', sessionRef: 'opaque-session' };
  };

  try {
    const sourceLogin = await api(`/sources/${sourceId}/login/check`, { method: 'POST', body: '{}' });
    const accountLogin = await api('/accounts/a-test-1/login/start', { method: 'POST', body: '{}' });
    assert.equal(sourceLogin.status, 200);
    assert.equal(accountLogin.status, 200);
    assert.equal(sourceLogin.body.data.status, 'active');
    assert.equal(accountLogin.body.data.status, 'active');
    const binding = {
      sourceId,
      accountId: 'a-test-1',
      platform: 'bigplayer_h5'
    };
    assert.deepEqual(calls.map(call => call.action), ['bind', 'start', 'bind', 'start']);
    for (const index of [0, 2]) {
      assert.equal(calls[index].payload.sourceId, sourceId);
      assert.equal(calls[index].payload.accountId, 'a-test-1');
      assert.equal(calls[index].payload.platform, 'bigplayer_h5');
      assert.equal(calls[index].payload.credentialRef, 'credential:a-test-1:account_password');
      assert.ok(calls[index].payload.maskedPhone == null || /^.{2}\*+.{2}$/.test(calls[index].payload.maskedPhone));
    }
    assert.deepEqual(calls[1].payload, { ...binding, scenario: undefined });
    assert.deepEqual(calls[3].payload, { ...binding, scenario: undefined, reason: 'start' });
  } finally {
    mod.loginSessionClient.bindAccount = originalBindAccount;
    mod.loginSessionClient.startLogin = originalStartLogin;
  }
});

test('POST /sources/:id/collect 已授权源在授权 probe 失败时 fail-closed', async () => {
  await repo.query('UPDATE po_sources SET config=? WHERE id=?', [JSON.stringify({ baseUrl: 'https://community.bigplayer.com/' }), sourceId]);
  const res = await api(`/sources/${sourceId}/collect`, { method: 'POST' });
  assert.equal(res.status, 401);
  const rows = await repo.query('SELECT collect_requested_at FROM po_sources WHERE id=?', [sourceId]);
  assert.ok(!rows[0].collect_requested_at, '授权 probe 失败不得打采集标记');
});

test('POST /sources/:id/collect 未授权源 fail-closed 返回 UNAUTHORIZED', async () => {
  await repo.query('INSERT INTO po_sources (id, game_id, community_id, platform, display_name, enabled, auth_status) VALUES (?,?,?,?,?,?,?)', ['s-unauth', gameId, 'c-test-1', 'bigplayer_h5', '未授权源', 1, 'unauthorized']);
  await repo.query('INSERT INTO po_accounts (id, game_id, community_id, source_id, platform, platform_account_id, account_name, enabled, auth_status, metadata) VALUES (?,?,?,?,?,?,?,?,?,?)', ['a-unauth', gameId, 'c-test-1', 's-unauth', 'bigplayer_h5', 'tenant-unauth', '未授权账号', 1, 'unauthorized', '{}']);
  const res = await api('/sources/s-unauth/collect', { method: 'POST' });
  assert.equal(res.status, 401);
  const rows = await repo.query('SELECT collect_requested_at FROM po_sources WHERE id=?', ['s-unauth']);
  assert.ok(!rows[0].collect_requested_at, '未授权源不得打采集标记');
  await repo.query('DELETE FROM po_accounts WHERE source_id=?', ['s-unauth']);
  await repo.query('DELETE FROM po_sources WHERE id=?', ['s-unauth']);
});

test('BigPlayer legacy gate deterministically selects the id-first legacy account when enabled accounts tie on updated_at', async () => {
  const mod = require('../src/app');
  const connector = mod.connectors.bigplayer_h5;
  const legacySourceId = 's-legacy-account-selection';
  const cleanAccountId = 'z-clean-same-second';
  const legacyAccountId = 'a-legacy-same-second';
  const originalHealth = connector.accountHealth;
  const originalRequestCollect = mod.repo.requestCollect;
  const originalReleaseSyncCheckpoint = mod.repo.releaseSyncCheckpoint;
  const calls = { health: 0, collect: 0, checkpointWrite: 0 };
  connector.accountHealth = async () => { calls.health += 1; return { authorized: true }; };
  mod.repo.requestCollect = async () => { calls.collect += 1; return { affectedRows: 1 }; };
  mod.repo.releaseSyncCheckpoint = async () => { calls.checkpointWrite += 1; return true; };
  try {
    await repo.query('INSERT INTO po_sources (id, game_id, community_id, platform, display_name, enabled, auth_status, config, default_account_id) VALUES (?,?,?,?,?,?,?,?,NULL)', [legacySourceId, gameId, 'c-test-1', 'bigplayer_h5', '无默认账号源', 1, 'authorized', JSON.stringify({ baseUrl: 'https://community.bigplayer.com/' })]);
    await repo.query('INSERT INTO po_accounts (id, game_id, community_id, source_id, platform, platform_account_id, account_name, enabled, auth_status, metadata, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [cleanAccountId, gameId, 'c-test-1', legacySourceId, 'bigplayer_h5', 'tenant-clean', '同秒增量账号', 1, 'authorized', JSON.stringify({ syncMode: 'incremental' }), '2026-09-11 08:30:00']);
    await repo.query('INSERT INTO po_accounts (id, game_id, community_id, source_id, platform, platform_account_id, account_name, enabled, auth_status, metadata, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [legacyAccountId, gameId, 'c-test-1', legacySourceId, 'bigplayer_h5', 'tenant-legacy', '同秒回溯账号', 1, 'authorized', JSON.stringify({ syncMode: 'backfill', historyStart: '2026-09-01' }), '2026-09-11 08:30:00']);

    for (const endpoint of [`/sources/${legacySourceId}/collect`, `/sources/${legacySourceId}/sync/resume`]) {
      const result = await api(endpoint, { method: 'POST' });
      assert.equal(result.status, 400);
      assert.equal(result.body.error.code, 'INVALID_INPUT');
    }
    assert.deepEqual(calls, { health: 0, collect: 0, checkpointWrite: 0 });
  } finally {
    connector.accountHealth = originalHealth;
    mod.repo.requestCollect = originalRequestCollect;
    mod.repo.releaseSyncCheckpoint = originalReleaseSyncCheckpoint;
    await repo.query('DELETE FROM po_accounts WHERE source_id=?', [legacySourceId]);
    await repo.query('DELETE FROM po_sources WHERE id=?', [legacySourceId]);
  }
});

test('POST /sources/:id/sync 仅使用路径 source 精确入队，重复请求返回 reused', async () => {
  const mod = require('../src/app');
  const connector = mod.connectors.bigplayer_h5;
  const originalHealth = connector.accountHealth;
  const originalStartSourceSync = mod.repo.startSourceSync;
  const originalStartBoundedSourceBackfill = mod.repo.startBoundedSourceBackfill;
  const originalValidateBoundedSourceBackfillWindow = mod.repo.validateBoundedSourceBackfillWindow;
  const calls = [];
  const order = [];
  connector.accountHealth = async () => { order.push('external-health'); return { authorized: true }; };
  mod.repo.validateBoundedSourceBackfillWindow = async input => { order.push('db-window'); return { publishedFrom: input.publishedFrom, publishedTo: input.publishedTo }; };
  mod.repo.startSourceSync = async input => {
    order.push('enqueue');
    calls.push(input);
    return {
      enabled: true,
      reused: calls.length > 1,
      run: { id: 'run-manual-exact', source_id: sourceId, account_id: 'a-test-1', status: 'queued', sync_mode: 'backfill', trigger_type: 'manual' }
    };
  };
  mod.repo.startBoundedSourceBackfill = mod.repo.startSourceSync;
  try {
    await repo.query('UPDATE po_sources SET enabled=1, collect_requested_at=NULL WHERE id=?', [sourceId]);
    const request = { method: 'POST', body: JSON.stringify({ mode: 'backfill', publishedFrom: '2026-09-04T08:30:00.000Z', publishedTo: '2026-09-11T08:30:00.000Z' }) };
    const first = await api(`/sources/${sourceId}/sync`, request);
    const duplicate = await api(`/sources/${sourceId}/sync`, request);
    assert.equal(first.status, 200);
    assert.deepEqual(first.body.data, { queued: true, enabled: true, runId: 'run-manual-exact', accountId: 'a-test-1', sourceId, mode: 'backfill', status: 'queued', reused: false, publishedFrom: '2026-09-04T08:30:00.000Z', publishedTo: '2026-09-11T08:30:00.000Z' });
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.body.data.runId, 'run-manual-exact');
    assert.equal(duplicate.body.data.reused, true);
    assert.deepEqual(calls, [
      { sourceId, publishedFrom: '2026-09-04T08:30:00.000Z', publishedTo: '2026-09-11T08:30:00.000Z' },
      { sourceId, publishedFrom: '2026-09-04T08:30:00.000Z', publishedTo: '2026-09-11T08:30:00.000Z' }
    ]);
    assert.deepEqual(order, ['db-window', 'external-health', 'enqueue', 'db-window', 'external-health', 'enqueue']);
    for (const replacement of [{ accountId: 'a-other' }, { sourceId: 's-other' }, { communityId: 'c-other' }, { regionCode: 'overseas' }]) {
      const rejected = await api(`/sources/${sourceId}/sync`, { method: 'POST', body: JSON.stringify({ mode: 'incremental', ...replacement }) });
      assert.equal(rejected.status, 400);
      assert.equal(rejected.body.error.code, 'INVALID_INPUT');
    }
    assert.equal(calls.length, 2, '替换 source/account/scope 的请求不得进入 Repository');
    const source = (await repo.query('SELECT enabled, collect_requested_at FROM po_sources WHERE id=?', [sourceId]))[0];
    assert.equal(source.enabled, 1);
    assert.equal(source.collect_requested_at, null, '精确入队不得写 legacy collect 标记');
  } finally {
    connector.accountHealth = originalHealth;
    mod.repo.startSourceSync = originalStartSourceSync;
    mod.repo.startBoundedSourceBackfill = originalStartBoundedSourceBackfill;
    mod.repo.validateBoundedSourceBackfillWindow = originalValidateBoundedSourceBackfillWindow;
    await repo.query('UPDATE po_sources SET enabled=1, collect_requested_at=NULL WHERE id=?', [sourceId]);
  }
});

test('POST /sources/:id/sync 与 /sync/reset 在任何 probe/Repository 调用前拒绝非普通对象 body', async () => {
  const mod = require('../src/app');
  const connector = mod.connectors.bigplayer_h5;
  const originalListSources = mod.repo.listSources;
  const originalStartSourceSync = mod.repo.startSourceSync;
  const originalResetSourceSync = mod.repo.resetSourceSync;
  const originalHealth = connector.accountHealth;
  const calls = { listSources: 0, start: 0, reset: 0, health: 0 };
  mod.repo.listSources = async () => { calls.listSources += 1; return []; };
  mod.repo.startSourceSync = async () => { calls.start += 1; throw new Error('must not enqueue'); };
  mod.repo.resetSourceSync = async () => { calls.reset += 1; throw new Error('must not reset'); };
  connector.accountHealth = async () => { calls.health += 1; return { authorized: true }; };
  try {
    const invalidBodies = [null, [], 'scalar', 1, true];
    for (const endpoint of [`/sources/${sourceId}/sync`, `/sources/${sourceId}/sync/reset`]) {
      for (const body of invalidBodies) {
        const res = await api(endpoint, { method: 'POST', body: JSON.stringify(body) });
        assert.equal(res.status, 400, `${endpoint} ${JSON.stringify(body)}`);
        assert.equal(res.body.error.code, 'INVALID_INPUT');
      }
    }
    assert.deepEqual(calls, { listSources: 0, start: 0, reset: 0, health: 0 });
  } finally {
    mod.repo.listSources = originalListSources;
    mod.repo.startSourceSync = originalStartSourceSync;
    mod.repo.resetSourceSync = originalResetSourceSync;
    connector.accountHealth = originalHealth;
  }
});

test('POST /sources/:id/sync/reset rejects BigPlayer before resetting checkpoints', async () => {
  const mod = require('../src/app');
  const connector = mod.connectors.bigplayer_h5;
  const originalHealth = connector.accountHealth;
  const originalResetSourceSync = mod.repo.resetSourceSync;
  let captured;
  let resetCalls = 0;
  connector.accountHealth = async () => ({ authorized: true });
  mod.repo.resetSourceSync = async input => {
    resetCalls += 1;
    captured = input;
    return { enabled: true, reset: true, reused: false, run: { id: 'run-reset-exact', source_id: sourceId, account_id: 'a-test-1', status: 'running', sync_mode: 'backfill', trigger_type: 'manual' } };
  };
  try {
    await repo.query('UPDATE po_accounts SET metadata=? WHERE id=?', [JSON.stringify({ historyStart: '2026-01-01T00:00', syncMode: 'incremental' }), 'a-test-1']);
    const res = await api(`/sources/${sourceId}/sync/reset`, { method: 'POST', body: JSON.stringify({}) });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_INPUT');
    assert.equal(resetCalls, 0);
    const rejected = await api(`/sources/${sourceId}/sync/reset`, { method: 'POST', body: JSON.stringify({ historyStart: '2026-01-01T00:00', accountId: 'a-other' }) });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.error.code, 'INVALID_INPUT');
    assert.equal(resetCalls, 0);
  } finally {
    connector.accountHealth = originalHealth;
    mod.repo.resetSourceSync = originalResetSourceSync;
    await repo.query('UPDATE po_sources SET enabled=1, collect_requested_at=NULL WHERE id=?', [sourceId]);
  }
});

test('BigPlayer legacy backfill trigger routes fail closed before probes, collect flags, or checkpoint writes', async () => {
  const mod = require('../src/app');
  const connector = mod.connectors.bigplayer_h5;
  const originalHealth = connector.accountHealth;
  const originalRequestCollect = mod.repo.requestCollect;
  const originalResetSyncCheckpoint = mod.repo.resetSyncCheckpoint;
  const calls = { health: 0, collect: 0, checkpoint: 0 };
  connector.accountHealth = async () => { calls.health += 1; return { authorized: true }; };
  mod.repo.requestCollect = async () => { calls.collect += 1; throw new Error('must not request legacy collection'); };
  mod.repo.resetSyncCheckpoint = async () => { calls.checkpoint += 1; throw new Error('must not reset'); };
  try {
    await repo.query('UPDATE po_sources SET config=?, collect_requested_at=NULL WHERE id=?', [JSON.stringify({ baseUrl: 'https://community.bigplayer.com/', syncMode: 'backfill', historyStart: '2026-01-01T00:00:00Z' }), sourceId]);
    await repo.query('UPDATE po_accounts SET metadata=? WHERE id=?', [JSON.stringify({ syncMode: 'backfill', historyStart: '2026-01-01T00:00:00Z' }), 'a-test-1']);
    for (const endpoint of [
      `/sources/${sourceId}/collect`,
      `/sources/${sourceId}/sync/resume`,
      '/accounts/a-test-1/sync',
      '/accounts/a-test-1/sync/resume',
      '/accounts/a-test-1/sync/reset'
    ]) {
      const res = await api(endpoint, { method: 'POST', body: JSON.stringify({}) });
      assert.equal(res.status, 400, endpoint);
      assert.equal(res.body.error.code, 'INVALID_INPUT', endpoint);
    }
    assert.deepEqual(calls, { health: 0, collect: 0, checkpoint: 0 });
    const state = (await repo.query('SELECT collect_requested_at FROM po_sources WHERE id=?', [sourceId]))[0];
    assert.equal(state.collect_requested_at, null);
  } finally {
    connector.accountHealth = originalHealth;
    mod.repo.requestCollect = originalRequestCollect;
    mod.repo.resetSyncCheckpoint = originalResetSyncCheckpoint;
    await repo.query('UPDATE po_sources SET config=?, collect_requested_at=NULL WHERE id=?', [JSON.stringify({ baseUrl: 'https://community.bigplayer.com/', syncMode: 'incremental', historyStart: null }), sourceId]);
    await repo.query('UPDATE po_accounts SET metadata=? WHERE id=?', [JSON.stringify({ syncMode: 'incremental', historyStart: null }), 'a-test-1']);
  }
});

test('BigPlayer source and account configuration APIs reject legacy backfill state without persistence', async () => {
  const uniqueSourceId = 'legacy-backfill-api-rejected';
  const uniqueAccountId = 'legacy-backfill-account-rejected';
  const beforeSource = (await repo.query('SELECT config FROM po_sources WHERE id=?', [sourceId]))[0];
  const beforeAccount = (await repo.query('SELECT metadata FROM po_accounts WHERE id=?', ['a-test-1']))[0];
  const attempts = [
    ['/sources', { gameId, communityId: 'c-test-1', platform: 'bigplayer_h5', displayName: uniqueSourceId, syncMode: 'backfill', historyStart: '2026-01-01T00:00:00Z' }],
    [`/sources/${sourceId}/configuration`, { displayName: 'blocked', baseUrl: 'https://community.bigplayer.com/', frequencySeconds: 900, syncMode: 'backfill', historyStart: '2026-01-01T00:00:00Z', enabled: false, credential: {} }],
    [`/sources/${sourceId}`, { syncMode: 'backfill', historyStart: '2026-01-01T00:00:00Z' }],
    ['/accounts', { sourceId, platform: 'bigplayer_h5', platformAccountId: uniqueAccountId, accountName: 'blocked', metadata: { syncMode: 'backfill', historyStart: '2026-01-01T00:00:00Z' } }],
    ['/accounts/a-test-1', { metadata: { syncMode: 'backfill', historyStart: '2026-01-01T00:00:00Z' } }]
  ];
  for (const [endpoint, body] of attempts) {
    const res = await api(endpoint, { method: endpoint === '/sources' || endpoint === '/accounts' ? 'POST' : 'PATCH', body: JSON.stringify(body) });
    assert.equal(res.status, 400, endpoint);
    assert.equal(res.body.error.code, 'INVALID_INPUT', endpoint);
  }
  assert.equal((await repo.query('SELECT COUNT(*) AS total FROM po_sources WHERE display_name=?', [uniqueSourceId]))[0].total, 0);
  assert.equal((await repo.query('SELECT COUNT(*) AS total FROM po_accounts WHERE platform_account_id=?', [uniqueAccountId]))[0].total, 0);
  assert.equal((await repo.query('SELECT config FROM po_sources WHERE id=?', [sourceId]))[0].config, beforeSource.config);
  assert.equal((await repo.query('SELECT metadata FROM po_accounts WHERE id=?', ['a-test-1']))[0].metadata, beforeAccount.metadata);
});

test('POST /sources/:id/sync requires a complete bounded UTC window for BigPlayer backfill', async () => {
  const connector = require('../src/app').connectors.bigplayer_h5;
  const originalHealth = connector.accountHealth;
  connector.accountHealth = async () => ({ authorized: true });
  try {
    await repo.query('UPDATE po_accounts SET metadata=? WHERE id=?', [JSON.stringify({}), 'a-test-1']);
    for (const body of [
      { mode: 'backfill' },
      { mode: 'backfill', historyStart: '2026-09-04T08:30:00Z' },
      { mode: 'backfill', publishedFrom: '2026-09-04T08:30:00.000Z' },
      { mode: 'backfill', publishedFrom: '2026-09-04T08:30:00+08:00', publishedTo: '2026-09-11T08:30:00.000Z' },
      { mode: 'backfill', publishedFrom: '2026-09-11T08:30:00.000Z', publishedTo: '2026-09-11T08:30:00.000Z' },
      { mode: 'backfill', publishedFrom: '2026-09-04T08:29:59.999Z', publishedTo: '2026-09-11T08:30:00.000Z' }
    ]) {
      const res = await api(`/sources/${sourceId}/sync`, { method: 'POST', body: JSON.stringify(body) });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'INVALID_INPUT');
    }
  } finally {
    connector.accountHealth = originalHealth;
    await repo.query('UPDATE po_sources SET enabled=1, collect_requested_at=NULL WHERE id=?', [sourceId]);
  }
});

test('GET sync run observability routes return latest state, enforce scope, and validate cursors', async () => {
  const runId = 'run-route-test';
  await repo.query('DELETE FROM po_sync_runs WHERE id=?', [runId]);
  await repo.query(`INSERT INTO po_sync_runs
    (id, account_id, status, sync_mode, fetched_count, inserted_count, changed_count, unchanged_count, comment_count)
    VALUES (?,?,?,?,?,?,?,?,?)`, [runId, 'a-test-1', 'completed', 'incremental', 3, 2, 1, 0, 7]);

  const correctScope = `regionCode=domestic&gameId=${gameId}&communityId=c-test-1&sourceId=${sourceId}`;
  for (const path of [
    `/sync-runs/${runId}`,
    `/sync-runs/${runId}/contents?scope=posts&after=0&limit=50`,
    `/sync-runs/${runId}/delete-preview`
  ]) {
    const separator = path.includes('?') ? '&' : '?';
    for (const wrongScope of ['regionCode=overseas', 'gameId=g-wrong', 'communityId=c-wrong', 'sourceId=s-wrong']) {
      const scoped = await api(`${path}${separator}${wrongScope}`);
      assert.equal(scoped.status, 404, `${path} ${wrongScope}`);
    }
  }

  const detail = await api(`/sync-runs/${runId}?${correctScope}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.id, runId);
  assert.equal(detail.body.data.source_id, sourceId);
  assert.equal(detail.body.data.fetched_count, 3);
  assert.equal(JSON.stringify(detail.body.data).includes('secret'), false);
  assert.equal(JSON.stringify(detail.body.data).includes('raw_payload'), false);

  const latest = await api(`/sources/${sourceId}/sync-runs/latest`);
  assert.equal(latest.status, 200);
  assert.equal(latest.body.data.id, runId);

  const empty = await api(`/sync-runs/${runId}/contents?scope=posts&after=0&limit=50&${correctScope}`);
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.data, []);
  assert.equal(empty.body.meta.nextAfter, 0);

  const preview = await api(`/sync-runs/${runId}/delete-preview?${correctScope}`);
  assert.equal(preview.status, 200);
  assert.equal(preview.body.data.associationCount, 0);
  assert.equal(preview.body.data.confirmationSuffix, runId.slice(-6));

  for (const query of ['scope=replies', 'after=-1', 'after=1.5', 'limit=0', 'limit=101', 'extra=1']) {
    const invalid = await api(`/sync-runs/${runId}/contents?${query}`);
    assert.equal(invalid.status, 400, query);
    assert.equal(invalid.body.error.code, 'INVALID_INPUT');
  }
  const trailing = await api(`/sync-runs/${runId}/contents/extra`);
  assert.equal(trailing.status, 404);
  const detailQuery = await api(`/sync-runs/${runId}?extra=1`);
  assert.equal(detailQuery.status, 400);
  const missing = await api('/sync-runs/missing-run');
  assert.equal(missing.status, 404);
  await repo.query('DELETE FROM po_sync_runs WHERE id=?', [runId]);
});

test('GET /sync-runs lists safely with strict pagination validation', async () => {
  const runId = 'run-list-safe';
  await repo.query('INSERT INTO po_sync_runs (id, account_id, status, sync_mode) VALUES (?,?,?,?)', [runId, 'a-test-1', 'failed', 'incremental']);
  try {
    const list = await api(`/sync-runs?page=1&pageSize=20&runId=${runId}`);
    assert.equal(list.status, 200); assert.equal(list.body.data[0].id, runId); assert.equal(list.body.meta.total, 1);
    assert.equal(JSON.stringify(list.body).includes('secret_cipher'), false); assert.equal(JSON.stringify(list.body).includes('raw_payload'), false);
    for (const query of ['page=0', 'page=1.5', 'pageSize=101', 'mode=unknown', 'limit=101']) { const invalid = await api(`/sync-runs?${query}`); assert.equal(invalid.status, 400, query); assert.equal(invalid.body.error.code, 'INVALID_INPUT'); }
    // limit 是 pageSize 的别名：合法值应返回 200 且生效
    const alias = await api(`/sync-runs?limit=1&runId=${runId}`);
    assert.equal(alias.status, 200); assert.equal(alias.body.meta.pageSize, 1);
  } finally { await repo.query('DELETE FROM po_sync_runs WHERE id=?', [runId]); }
});

test('POST /sources/:id/sync 授权失败时不启用也不入队', async () => {
  const mod = require('../src/app');
  const connector = mod.connectors.bigplayer_h5;
  const originalHealth = connector.accountHealth;
  const originalStartSourceSync = mod.repo.startSourceSync;
  let startCalls = 0;
  connector.accountHealth = async () => ({ authorized: false, reason: 'expired token' });
  mod.repo.startSourceSync = async () => { startCalls += 1; throw new Error('must not enqueue'); };
  try {
    await repo.query('UPDATE po_sources SET enabled=1, collect_requested_at=NULL WHERE id=?', [sourceId]);
    const res = await api(`/sources/${sourceId}/sync`, { method: 'POST', body: JSON.stringify({ mode: 'incremental' }) });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
    const source = (await repo.query('SELECT enabled, collect_requested_at FROM po_sources WHERE id=?', [sourceId]))[0];
    assert.equal(source.enabled, 1);
    assert.ok(!source.collect_requested_at);
    assert.equal(startCalls, 0, '授权 preflight 失败不得入队');
  } finally {
    connector.accountHealth = originalHealth;
    mod.repo.startSourceSync = originalStartSourceSync;
    await repo.query('UPDATE po_sources SET enabled=1, collect_requested_at=NULL WHERE id=?', [sourceId]);
  }
});

test('POST /sources/:id/sync lookbackDays=7 persists and returns one DB-anchored exact window without external probes', async () => {
  const mod = require('../src/app');
  const connector = mod.connectors.bigplayer_h5;
  const originalHealth = connector.accountHealth;
  const originalStartRecentSourceBackfill = mod.repo.startRecentSourceBackfill;
  const calls = [];
  connector.accountHealth = async () => { throw new Error('must not probe before or after atomic DB admission'); };
  mod.repo.startRecentSourceBackfill = async input => {
    calls.push(input);
    return {
      enabled: true,
      reused: false,
      window: { publishedFrom: '2026-09-04T08:30:00.123Z', publishedTo: '2026-09-11T08:30:00.123Z' },
      run: { id: 'run-db-anchored', source_id: sourceId, account_id: 'a-test-1', status: 'queued', sync_mode: 'backfill', trigger_type: 'manual', window_start: '2026-09-04 08:30:00.123', window_end: '2026-09-11 08:30:00.123' }
    };
  };
  try {
    const res = await api(`/sources/${sourceId}/sync`, { method: 'POST', body: JSON.stringify({ mode: 'backfill', lookbackDays: 7 }) });
    assert.equal(res.status, 200);
    assert.deepEqual(calls, [{ sourceId, lookbackDays: 7 }]);
    assert.equal(Date.parse(res.body.data.publishedTo) - Date.parse(res.body.data.publishedFrom), 7 * 24 * 60 * 60 * 1000);
    assert.equal(res.body.data.publishedFrom, '2026-09-04T08:30:00.123Z');
    assert.equal(res.body.data.publishedTo, '2026-09-11T08:30:00.123Z');
    for (const lookbackDays of [1, 6, 8]) {
      const rejected = await api(`/sources/${sourceId}/sync`, { method: 'POST', body: JSON.stringify({ mode: 'backfill', lookbackDays }) });
      assert.equal(rejected.status, 400);
    }
    assert.equal(calls.length, 1);
  } finally {
    connector.accountHealth = originalHealth;
    mod.repo.startRecentSourceBackfill = originalStartRecentSourceBackfill;
  }
});

test('POST /sources/:id/sync returns the Repository authoritative rejection for historical and future BigPlayer windows', async () => {
  const mod = require('../src/app');
  const connector = mod.connectors.bigplayer_h5;
  const originalHealth = connector.accountHealth;
  const originalValidateBoundedSourceBackfillWindow = mod.repo.validateBoundedSourceBackfillWindow;
  const originalStartBoundedSourceBackfill = mod.repo.startBoundedSourceBackfill;
  const calls = [];
  let healthCalls = 0;
  let enqueueCalls = 0;
  connector.accountHealth = async () => { healthCalls += 1; return { authorized: true }; };
  mod.repo.validateBoundedSourceBackfillWindow = async input => {
    calls.push(input);
    const error = new Error(input.publishedTo.endsWith('001Z') ? 'publishedTo must not be in the future' : 'publishedFrom must be within the last 7 days');
    error.code = 'INVALID_INPUT';
    throw error;
  };
  mod.repo.startBoundedSourceBackfill = async () => { enqueueCalls += 1; throw new Error('must not enqueue'); };
  try {
    const runsBefore = Number((await repo.query('SELECT COUNT(*) AS total FROM po_sync_runs WHERE account_id=?', ['a-test-1']))[0].total);
    for (const body of [
      { mode: 'backfill', publishedFrom: '2026-09-03T08:30:00.000Z', publishedTo: '2026-09-04T08:30:00.000Z' },
      { mode: 'backfill', publishedFrom: '2026-09-11T08:29:59.999Z', publishedTo: '2026-09-11T08:30:00.001Z' }
    ]) {
      const res = await api(`/sources/${sourceId}/sync`, { method: 'POST', body: JSON.stringify(body) });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'INVALID_INPUT');
    }
    assert.equal(calls.length, 2, 'valid-shaped windows must reach the Repository authority check');
    assert.deepEqual(calls[0], { sourceId, publishedFrom: '2026-09-03T08:30:00.000Z', publishedTo: '2026-09-04T08:30:00.000Z' });
    assert.equal(healthCalls, 0, 'invalid DB windows must be rejected before external authorization probes');
    assert.equal(enqueueCalls, 0);
    const runsAfter = Number((await repo.query('SELECT COUNT(*) AS total FROM po_sync_runs WHERE account_id=?', ['a-test-1']))[0].total);
    assert.equal(runsAfter, runsBefore);
  } finally {
    connector.accountHealth = originalHealth;
    mod.repo.validateBoundedSourceBackfillWindow = originalValidateBoundedSourceBackfillWindow;
    mod.repo.startBoundedSourceBackfill = originalStartBoundedSourceBackfill;
  }
});

test('POST /sources/:id/sync 停用源/默认账号在外部授权探测前 fail-closed', async () => {
  const mod = require('../src/app');
  const connector = mod.connectors.bigplayer_h5;
  const originalHealth = connector.accountHealth;
  const originalStartSourceSync = mod.repo.startSourceSync;
  let healthCalls = 0;
  let startCalls = 0;
  connector.accountHealth = async () => { healthCalls += 1; return { authorized: true }; };
  mod.repo.startSourceSync = async () => { startCalls += 1; throw new Error('must not enqueue'); };
  await repo.query('UPDATE po_sources SET enabled=0, collect_requested_at=NULL WHERE id=?', [sourceId]);
  try {
    const res = await api(`/sources/${sourceId}/sync`, { method: 'POST', body: JSON.stringify({ mode: 'incremental' }) });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'SOURCE_DISABLED');
    const source = (await repo.query('SELECT enabled, collect_requested_at FROM po_sources WHERE id=?', [sourceId]))[0];
    assert.equal(source.enabled, 0);
    assert.ok(!source.collect_requested_at);
    assert.equal(healthCalls, 0);
    assert.equal(startCalls, 0);

    await repo.query('UPDATE po_sources SET enabled=1 WHERE id=?', [sourceId]);
    await repo.query('UPDATE po_accounts SET enabled=0 WHERE id=?', ['a-test-1']);
    const accountDisabled = await api(`/sources/${sourceId}/sync`, { method: 'POST', body: JSON.stringify({ mode: 'incremental' }) });
    assert.equal(accountDisabled.status, 409);
    assert.equal(accountDisabled.body.error.code, 'ACCOUNT_DISABLED');
    assert.equal(healthCalls, 0);
    assert.equal(startCalls, 0);
  } finally {
    connector.accountHealth = originalHealth;
    mod.repo.startSourceSync = originalStartSourceSync;
    await repo.query('UPDATE po_accounts SET enabled=1 WHERE id=?', ['a-test-1']);
    await repo.query('UPDATE po_sources SET enabled=1, collect_requested_at=NULL WHERE id=?', [sourceId]);
  }
});

test('POST /sources/:id/sync 稳定映射 schema、状态、竞争、lease 与授权错误', async () => {
  const mod = require('../src/app');
  const connector = mod.connectors.bigplayer_h5;
  const originalHealth = connector.accountHealth;
  const originalStartSourceSync = mod.repo.startSourceSync;
  connector.accountHealth = async () => ({ authorized: true });
  const cases = [
    ['UNIFIED_SCHEDULER_SCHEMA_NOT_READY', 503],
    ['UNIFIED_SCHEDULER_SCHEMA_CHECK_FAILED', 503],
    ['SOURCE_DISABLED', 409],
    ['GAME_DISABLED', 409],
    ['COMMUNITY_DISABLED', 409],
    ['ACCOUNT_DISABLED', 409],
    ['SOURCE_UNAUTHORIZED', 409],
    ['SOURCE_AUTH_EXPIRED', 409],
    ['ACCOUNT_UNAUTHORIZED', 409],
    ['ACCOUNT_AUTH_EXPIRED', 409],
    ['CREDENTIAL_SECRET_MISSING', 401],
    ['PREVIOUS_RUN_ACTIVE', 409],
    ['SYNC_CHECKPOINT_ACTIVE', 409],
    ['SOURCE_SCHEDULE_LEASE_ACTIVE', 409],
    ['ACCOUNT_NOT_FOUND', 404],
    ['OWNERSHIP_MISMATCH', 400]
  ];
  try {
    await repo.query('UPDATE po_sources SET enabled=1, collect_requested_at=NULL WHERE id=?', [sourceId]);
    await repo.query("UPDATE po_accounts SET enabled=1, auth_status='authorized' WHERE id=?", ['a-test-1']);
    for (const [code, status] of cases) {
      mod.repo.startSourceSync = async () => { const error = new Error(code); error.code = code; throw error; };
      const res = await api(`/sources/${sourceId}/sync`, { method: 'POST', body: JSON.stringify({ mode: 'incremental' }) });
      assert.equal(res.status, status, code);
      assert.equal(res.body.error.code, code);
    }
  } finally {
    connector.accountHealth = originalHealth;
    mod.repo.startSourceSync = originalStartSourceSync;
  }
});

test('PUT /keyword-rules 按平台替换 + GET 回读分组', async () => {
  const groups = [
    { groupName: '故障', platform: 'taptap', severity: 'urgent', triggerMode: 'immediate', keywords: ['崩溃', '闪退'] },
    { groupName: '退款', platform: 'taptap', severity: 'attention', triggerMode: 'aggregate', windowSeconds: 600, thresholdCount: 3, keywords: ['退款'] }
  ];
  const put = await api('/keyword-rules', { method: 'PUT', body: JSON.stringify({ gameId, platform: 'taptap', groups }) });
  assert.equal(put.status, 200);
  const get = await api(`/keyword-rules?gameId=${gameId}&platform=taptap`);
  assert.equal(get.status, 200);
  const byName = Object.fromEntries(get.body.data.map(g => [g.groupName, g]));
  assert.equal(byName['故障'].triggerMode, 'immediate');
  assert.deepEqual(byName['故障'].keywords.sort(), ['崩溃', '闪退'].sort());
  assert.equal(byName['退款'].thresholdCount, 3);
  assert.equal(byName['退款'].platform, 'taptap');
});

test('PUT /keyword-rules 拒绝空组 / 重复词 / 非法阈值', async () => {
  const emptyGroup = await api('/keyword-rules', { method: 'PUT', body: JSON.stringify({ gameId, groups: [{ groupName: '', keywords: ['x'] }] }) });
  assert.equal(emptyGroup.status, 400);
  const noKw = await api('/keyword-rules', { method: 'PUT', body: JSON.stringify({ gameId, groups: [{ groupName: 'g', keywords: [] }] }) });
  assert.equal(noKw.status, 400);
  const dup = await api('/keyword-rules', { method: 'PUT', body: JSON.stringify({ gameId, groups: [{ groupName: 'g', keywords: ['崩', '崩'] }] }) });
  assert.equal(dup.status, 400);
  const badThreshold = await api('/keyword-rules', { method: 'PUT', body: JSON.stringify({ gameId, groups: [{ groupName: 'g', triggerMode: 'aggregate', thresholdCount: 0, windowSeconds: 60, keywords: ['x'] }] }) });
  assert.equal(badThreshold.status, 400);
});

// ── 采集源 CRUD：新增（白名单校验）/ 软删除 ──

test('POST /sources 创建抖音源并原子生成待验证默认账号与加密凭据', async () => {
  const res = await api('/sources', { method: 'POST', body: JSON.stringify({ gameId, communityId: 'c-test-1', platform: 'douyin', displayName: '测试抖音官方号', frequencySeconds: 1800, syncMode: 'backfill', historyStart: '2026-08-01T00:00', phone: '13800138000', password: 'test-password', confirmPassword: 'test-password' }) });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.platform, 'douyin');
  assert.ok(res.body.data.account, '响应应包含默认账号');
  assert.match(res.body.data.account.platform_account_id, /^pending:/);
  assert.equal(res.body.data.account.auth_status, 'pending_verification');
  assert.equal(res.body.data.account.masked_login_identifier, '138****8000');
  const credentialRows = await repo.query('SELECT secret_cipher FROM po_credentials WHERE account_id=? AND credential_type=?', [res.body.data.account.id, 'account_password']);
  assert.equal(credentialRows.length, 1);
  assert.ok(!credentialRows[0].secret_cipher.includes('test-password'));
  const metadata = typeof res.body.data.account.metadata === 'string' ? JSON.parse(res.body.data.account.metadata) : res.body.data.account.metadata;
  assert.equal(metadata.syncMode, 'backfill');
  assert.equal(metadata.historyStart, '2026-08-01T00:00');
  const accounts = await repo.query('SELECT * FROM po_accounts WHERE source_id=?', [res.body.data.id]);
  assert.equal(accounts.length, 1);
});

test('POST /sources Discord 缺少加密密钥时返回明确 503 且不写入，配置测试密钥后可创建', async () => {
  const originalKey = process.env.CREDENTIAL_ENC_KEY;
  const displayName = 'Discord 配置回归源';
  const token = 'discord-test-token-never-sent';
  const payload = {
    gameId,
    communityId: 'c-test-1',
    platform: 'discord',
    displayName,
    frequencySeconds: 1800,
    guildId: '123456789012345678',
    channelIds: ['223456789012345678'],
    apiToken: token
  };

  try {
    delete process.env.CREDENTIAL_ENC_KEY;
    const missing = await api('/sources', { method: 'POST', body: JSON.stringify(payload) });
    assert.equal(missing.status, 503);
    assert.equal(missing.body.error.code, 'CREDENTIAL_ENC_KEY_MISSING');
    assert.match(missing.body.error.message, /CREDENTIAL_ENC_KEY/);
    assert.equal((await repo.query('SELECT COUNT(*) AS total FROM po_sources WHERE game_id=? AND platform=? AND display_name=?', [gameId, 'discord', displayName]))[0].total, 0);

    process.env.CREDENTIAL_ENC_KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
    const configured = await api('/sources', { method: 'POST', body: JSON.stringify(payload) });
    assert.equal(configured.status, 201);
    assert.equal(configured.body.data.platform, 'discord');
    assert.equal(JSON.stringify(configured.body).includes(token), false);
    const credentials = await repo.query('SELECT secret_cipher FROM po_credentials WHERE account_id=? AND credential_type=?', [configured.body.data.account.id, 'api_token']);
    assert.equal(credentials.length, 1);
    assert.equal(credentials[0].secret_cipher.includes(token), false);
  } finally {
    if (originalKey == null) delete process.env.CREDENTIAL_ENC_KEY;
    else process.env.CREDENTIAL_ENC_KEY = originalKey;
    const sources = await repo.query('SELECT id FROM po_sources WHERE game_id=? AND platform=? AND display_name=?', [gameId, 'discord', displayName]);
    for (const source of sources) {
      await repo.query('DELETE FROM po_credentials WHERE source_id=?', [source.id]);
      await repo.query('DELETE FROM po_accounts WHERE source_id=?', [source.id]);
      await repo.query('DELETE FROM po_sources WHERE id=?', [source.id]);
    }
  }
});

test('POST /sources 拒绝不存在游戏、未知平台、非法频率和缺失回溯起点', async () => {
  const missingGame = await api('/sources', { method: 'POST', body: JSON.stringify({ gameId: 'missing', communityId: 'c-test-1', platform: 'douyin', displayName: 'x' }) });
  assert.equal(missingGame.status, 400); assert.equal(missingGame.body.error.code, 'GAME_NOT_FOUND');
  const badPlatform = await api('/sources', { method: 'POST', body: JSON.stringify({ gameId, communityId: 'c-test-1', platform: 'unknown', displayName: '唯一非法平台测试源' }) });
  assert.equal(badPlatform.status, 400); assert.equal(badPlatform.body.error.code, 'INVALID_PLATFORM');
  const badFrequency = await api('/sources', { method: 'POST', body: JSON.stringify({ gameId, communityId: 'c-test-1', platform: 'douyin', displayName: '唯一非法频率测试源', frequencySeconds: 0 }) });
  assert.equal(badFrequency.status, 400);
  const noHistory = await api('/sources', { method: 'POST', body: JSON.stringify({ gameId, communityId: 'c-test-1', platform: 'douyin', displayName: '唯一缺回溯起点测试源', syncMode: 'backfill' }) });
  assert.equal(noHistory.status, 400);
});

test('POST /sources 白名单内 baseUrl + Token 新增成功（BigPlayer 默认启用，config 落 URL+起始路径）', async () => {
  const token = 'single-url-token';
  const res = await api('/sources', { method: 'POST', body: JSON.stringify({
    gameId, communityId: 'c-test-1', platform: 'bigplayer_h5', displayName: '新增社区源',
    baseUrl: 'https://community.bigplayer.com/', apiToken: token, startPaths: '/forum, /news'
  }) });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.display_name, '新增社区源');
  assert.equal(res.body.data.enabled, 1, '新增 BigPlayer 源默认启用');
  assert.match(res.body.data.account.platform_account_id, /^pending:/);
  const cfg = typeof res.body.data.config === 'string' ? JSON.parse(res.body.data.config) : res.body.data.config;
  assert.equal(cfg.baseUrl, 'https://community.bigplayer.com/');
  assert.deepEqual(cfg.startPaths, ['/forum', '/news']);
  assert.equal(cfg.postsApiUrl, undefined);
  assert.equal(cfg.commentsApiUrl, undefined);
  const credentialRows = await repo.query('SELECT secret_cipher FROM po_credentials WHERE account_id=? AND credential_type=?', [res.body.data.account.id, 'api_token']);
  assert.equal(credentialRows.length, 1);
  assert.doesNotMatch(credentialRows[0].secret_cipher, new RegExp(token));
});

test('POST /sources 接管未配置 legacy H5 源并复用 source/account ID', async () => {
  const legacySourceId = 's-legacy-adopt';
  const legacyAccountId = 'a-legacy-adopt';
  const token = 'legacy-adopt-token';
  await repo.query('INSERT INTO po_sources (id, game_id, community_id, platform, display_name, enabled, auth_status, config) VALUES (?,?,?,?,?,?,?,?)', [legacySourceId, gameId, 'c-test-1', 'bigplayer_h5', '待接管社区源', 1, 'unauthorized', '{}']);
  await repo.query('INSERT INTO po_accounts (id, game_id, community_id, source_id, platform, platform_account_id, account_name, enabled, auth_status, metadata) VALUES (?,?,?,?,?,?,?,?,?,?)', [legacyAccountId, gameId, 'c-test-1', legacySourceId, 'bigplayer_h5', `legacy-source:${legacySourceId}`, '旧账号', 1, 'unauthorized', '{}']);
  const res = await api('/sources', { method: 'POST', body: JSON.stringify({ gameId, communityId: 'c-test-1', platform: 'bigplayer_h5', displayName: '待接管社区源', baseUrl: 'https://community.bigplayer.com/', apiToken: token }) });
  assert.equal(res.status, 200);
  assert.equal(res.body.meta.adopted, true);
  assert.equal(res.body.data.id, legacySourceId);
  assert.equal(res.body.data.account.id, legacyAccountId);
  const sources = await repo.query('SELECT id, enabled, config FROM po_sources WHERE game_id=? AND platform=? AND display_name=?', [gameId, 'bigplayer_h5', '待接管社区源']);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].enabled, 1);
  assert.equal(JSON.parse(sources[0].config).baseUrl, 'https://community.bigplayer.com/');
  const credentials = await repo.query('SELECT secret_cipher FROM po_credentials WHERE account_id=? AND credential_type=?', [legacyAccountId, 'api_token']);
  assert.equal(credentials.length, 1);
  assert.doesNotMatch(credentials[0].secret_cipher, new RegExp(token));
});

test('POST /sources 普通重复源返回 typed 409 而不暴露 SQL', async () => {
  const duplicateId = 's-duplicate-route-test';
  const displayName = '唯一重复源测试';
  await repo.query('DELETE FROM po_sources WHERE id=?', [duplicateId]);
  await repo.query('INSERT INTO po_sources (id, game_id, community_id, platform, display_name, enabled, auth_status) VALUES (?,?,?,?,?,?,?)', [duplicateId, gameId, 'c-test-1', 'bigplayer_h5', displayName, 0, 'unconfigured']);
  try {
    const res = await api('/sources', { method: 'POST', body: JSON.stringify({ gameId, communityId: 'c-test-1', platform: 'bigplayer_h5', displayName, baseUrl: 'https://community.bigplayer.com/', apiToken: 'duplicate-token' }) });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'SOURCE_ALREADY_EXISTS');
    assert.doesNotMatch(res.body.error.message, /Duplicate entry|po_sources_/i);
  } finally {
    await repo.query('DELETE FROM po_sources WHERE id=?', [duplicateId]);
  }
});

test('POST /sources 单地址模式缺 Token 返回 400', async () => {
  const res = await api('/sources', { method: 'POST', body: JSON.stringify({ gameId, communityId: 'c-test-1', platform: 'bigplayer_h5', displayName: '缺 Token', baseUrl: 'https://community.bigplayer.com/' }) });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_INPUT');
});

test('POST /sources 内网/非白名单 baseUrl 被拒 400 URL_OUTSIDE_ALLOWED_HOSTS', async () => {
  for (const baseUrl of ['http://127.0.0.1:8080/', 'http://192.168.1.10/admin', 'https://evil.example.com/', 'https://user:pass@community.bigplayer.com/', 'https://community.bigplayer.com/#private']) {
    const res = await api('/sources', { method: 'POST', body: JSON.stringify({ gameId, communityId: 'c-test-1', platform: 'bigplayer_h5', displayName: '恶意源', baseUrl, apiToken: 'token' }) });
    assert.equal(res.status, 400, `${baseUrl} 应被拒`);
    assert.equal(res.body.error.code, 'URL_OUTSIDE_ALLOWED_HOSTS');
  }
});

test('POST /sources 缺 gameId/communityId/platform/displayName 返回 400', async () => {
  const noGame = await api('/sources', { method: 'POST', body: JSON.stringify({ platform: 'bigplayer_h5', displayName: 'x', baseUrl: 'https://community.bigplayer.com/' }) });
  assert.equal(noGame.status, 400);
  const noCommunity = await api('/sources', { method: 'POST', body: JSON.stringify({ gameId, platform: 'bigplayer_h5', displayName: 'x', baseUrl: 'https://community.bigplayer.com/', apiToken: 'token' }) });
  assert.equal(noCommunity.status, 400);
  assert.equal(noCommunity.body.error.code, 'INVALID_INPUT');
  const noName = await api('/sources', { method: 'POST', body: JSON.stringify({ gameId, communityId: 'c-test-1', platform: 'bigplayer_h5', baseUrl: 'https://community.bigplayer.com/' }) });
  assert.equal(noName.status, 400);
});

test('PATCH /sources/:id 更新 baseUrl 走白名单校验（非白名单 400，白名单内 200 且 config 落库）', async () => {
  const bad = await api(`/sources/${sourceId}`, { method: 'PATCH', body: JSON.stringify({ baseUrl: 'http://127.0.0.1/' }) });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'URL_OUTSIDE_ALLOWED_HOSTS');
  const ok = await api(`/sources/${sourceId}`, { method: 'PATCH', body: JSON.stringify({ baseUrl: 'https://community.bigplayer.com/hub', startPaths: '/a,/b' }) });
  assert.equal(ok.status, 200);
  const cfg = typeof ok.body.data.config === 'string' ? JSON.parse(ok.body.data.config) : ok.body.data.config;
  assert.equal(cfg.baseUrl, 'https://community.bigplayer.com/hub');
  assert.deepEqual(cfg.startPaths, ['/a', '/b']);
});

test('Facebook 来源无需来源 Token 即可停用落库，检测端点返回六项稳定失败详情', async () => {
  const facebookGameId = '00000000-0000-0000-0000-000000000002';
  const facebookCommunityId = '00000000-0000-0000-0000-000000000102';
  const displayName = 'Facebook 无来源 Token 回归源';
  const app = require('../src/app');
  const connector = app.connectors.facebook;
  const originalInstallationHealth = connector.installationHealth;
  const originalAccountHealth = connector.accountHealth;
  let createdSourceId = null;
  try {
    await repo.query('DELETE FROM po_credentials WHERE source_id IN (SELECT id FROM po_sources WHERE game_id=?)', [facebookGameId]);
    await repo.query('DELETE FROM po_source_capabilities WHERE source_id IN (SELECT id FROM po_sources WHERE game_id=?)', [facebookGameId]);
    await repo.query('DELETE FROM po_accounts WHERE game_id=?', [facebookGameId]);
    await repo.query('DELETE FROM po_sources WHERE game_id=?', [facebookGameId]);
    await repo.query('DELETE FROM po_communities WHERE id=?', [facebookCommunityId]);
    await repo.query('DELETE FROM po_games WHERE id=?', [facebookGameId]);
    await repo.query('INSERT INTO po_games (id,name,region_code) VALUES (?,?,?)', [facebookGameId, 'Last Night', 'overseas']);
    await repo.query('INSERT INTO po_communities (id,game_id,name,status,region_code) VALUES (?,?,?,?,?)', [facebookCommunityId, facebookGameId, 'Last Night 海外社区', 'enabled', 'overseas']);
    connector.installationHealth = async () => ({
      platform: 'facebook',
      installed: false,
      configured: false,
      reason: 'disabled by configuration',
      systemCredentialStatus: 'not_configured'
    });
    connector.accountHealth = async () => ({
      platform: 'facebook',
      installed: false,
      configured: false,
      authorized: false,
      reason: 'disabled by configuration',
      systemCredentialStatus: 'not_configured'
    });

    const created = await api('/sources', { method: 'POST', body: JSON.stringify({
      gameId: facebookGameId,
      communityId: facebookCommunityId,
      regionCode: 'overseas',
      platform: 'facebook',
      displayName,
      baseUrl: 'https://www.facebook.com/LastLightSurvival',
      frequencySeconds: 3600,
      syncMode: 'incremental'
    }) });
    assert.equal(created.status, 201);
    createdSourceId = created.body.data.id;
    assert.equal(Number(created.body.data.enabled), 0);
    assert.equal(created.body.data.systemCredentialStatus, 'not_configured');
    assert.deepEqual(Object.keys(created.body.data.capabilities).sort(), ['comments', 'moderate', 'page', 'pageManagement', 'posts', 'replies'].sort());
    for (const detail of Object.values(created.body.data.capabilities)) {
      assert.equal(detail.status, 'unavailable');
      assert.equal(detail.errorCode, 'FACEBOOK_SYSTEM_CREDENTIAL_NOT_CONFIGURED');
    }
    assert.equal((await repo.query('SELECT COUNT(*) AS total FROM po_sources WHERE id=? AND enabled=0', [createdSourceId]))[0].total, 1);
    assert.equal((await repo.query("SELECT COUNT(*) AS total FROM po_accounts WHERE source_id=? AND enabled=0 AND auth_status='unauthorized'", [createdSourceId]))[0].total, 1);
    assert.equal((await repo.query('SELECT COUNT(*) AS total FROM po_credentials WHERE source_id=?', [createdSourceId]))[0].total, 0);

    for (const endpoint of ['check-auth', 'check-capabilities']) {
      const checked = await api(`/sources/${createdSourceId}/${endpoint}`, { method: 'POST', body: '{}' });
      assert.equal(checked.status, 200, endpoint);
      assert.equal(checked.body.data.authorized ?? checked.body.data.authStatus === 'authorized', false, endpoint);
      assert.equal(checked.body.data.reason, 'FACEBOOK_SYSTEM_CREDENTIAL_NOT_CONFIGURED', endpoint);
      assert.equal(checked.body.data.errorCode, 'FACEBOOK_SYSTEM_CREDENTIAL_NOT_CONFIGURED', endpoint);
      assert.equal(checked.body.data.systemCredentialStatus, 'not_configured', endpoint);
      assert.equal(Object.hasOwn(checked.body.data, 'tokenStatus'), false, endpoint);
      assert.equal(Object.hasOwn(checked.body.data, 'expireAt'), false, endpoint);
      for (const detail of Object.values(checked.body.data.capabilities)) {
        assert.equal(detail.status, 'unavailable', endpoint);
        assert.equal(detail.errorCode, 'FACEBOOK_SYSTEM_CREDENTIAL_NOT_CONFIGURED', endpoint);
      }
    }

    connector.installationHealth = async () => ({
      platform: 'facebook',
      installed: true,
      configured: true,
      reason: null,
      systemCredentialStatus: 'configured'
    });
    connector.accountHealth = async () => ({
      platform: 'facebook',
      installed: true,
      configured: false,
      authorized: false,
      reason: 'FACEBOOK_PAGE_MANAGEMENT_REQUIRED',
      errorCode: 'FACEBOOK_PAGE_MANAGEMENT_REQUIRED',
      systemCredentialStatus: 'configured',
      capabilities: {
        page: { status: 'available', pageId: 'page-1', pageName: 'Last Light' },
        pageManagement: { status: 'unavailable', errorCode: 'FACEBOOK_PAGE_MANAGEMENT_REQUIRED' },
        moderate: { status: 'unavailable', errorCode: 'FACEBOOK_MODERATE_CAPABILITY_REQUIRED' },
        posts: { status: 'untested' },
        comments: { status: 'untested' },
        replies: { status: 'untested' }
      }
    });
    const managementBlocked = await api(`/sources/${createdSourceId}/check-capabilities`, { method: 'POST', body: '{}' });
    assert.equal(managementBlocked.status, 200);
    assert.equal(managementBlocked.body.data.reason, 'FACEBOOK_PAGE_MANAGEMENT_REQUIRED');
    assert.equal(managementBlocked.body.data.capabilities.page.status, 'authorized_scope');
    assert.equal(managementBlocked.body.data.capabilities.pageManagement.errorCode, 'FACEBOOK_PAGE_MANAGEMENT_REQUIRED');
    assert.equal(managementBlocked.body.data.capabilities.moderate.errorCode, 'FACEBOOK_MODERATE_CAPABILITY_REQUIRED');
    for (const scope of ['posts', 'comments', 'replies']) {
      assert.equal(managementBlocked.body.data.capabilities[scope].status, 'unavailable', scope);
      assert.equal(managementBlocked.body.data.capabilities[scope].errorCode, 'FACEBOOK_CAPABILITY_MISSING', scope);
    }

    const account = (await repo.query('SELECT id FROM po_accounts WHERE source_id=?', [createdSourceId]))[0];
    const sourceCredential = await api(`/sources/${createdSourceId}/credential`, { method: 'PUT', body: JSON.stringify({ credentialType: 'api_token', secret: 'must-not-save' }) });
    const accountCredential = await api(`/accounts/${account.id}/credential`, { method: 'PUT', body: JSON.stringify({ credentialType: 'api_token', secret: 'must-not-save' }) });
    assert.equal(sourceCredential.status, 400);
    assert.equal(accountCredential.status, 400);
    assert.equal((await repo.query('SELECT COUNT(*) AS total FROM po_credentials WHERE source_id=?', [createdSourceId]))[0].total, 0);

    connector.accountHealth = async () => ({
      platform: 'facebook', installed: true, configured: true, authorized: true,
      reason: null, errorCode: null, systemCredentialStatus: 'configured',
      capabilities: Object.fromEntries(['page', 'pageManagement', 'moderate', 'posts', 'comments', 'replies'].map(scope => [scope, { status: 'available', ...(scope === 'page' ? { pageId: 'page-1', pageName: 'Last Light' } : {}) }]))
    });
    const authorized = await api(`/sources/${createdSourceId}/check-auth`, { method: 'POST', body: '{}' });
    assert.equal(authorized.status, 200);
    assert.equal(authorized.body.data.authStatus, 'authorized');
    assert.equal((await repo.query('SELECT enabled FROM po_accounts WHERE id=?', [account.id]))[0].enabled, 1);
    const enabled = await api(`/sources/${createdSourceId}`, { method: 'PATCH', body: JSON.stringify({ enabled: true }) });
    assert.equal(enabled.status, 200);
    assert.equal(Number(enabled.body.data.enabled), 1);
  } finally {
    connector.installationHealth = originalInstallationHealth;
    connector.accountHealth = originalAccountHealth;
    if (createdSourceId) {
      await repo.query('DELETE FROM po_source_capabilities WHERE source_id=?', [createdSourceId]);
      await repo.query('DELETE FROM po_credentials WHERE source_id=?', [createdSourceId]);
      await repo.query('DELETE FROM po_accounts WHERE source_id=?', [createdSourceId]);
      await repo.query('DELETE FROM po_sources WHERE id=?', [createdSourceId]);
    }
    await repo.query('DELETE FROM po_communities WHERE id=?', [facebookCommunityId]);
    await repo.query('DELETE FROM po_games WHERE id=?', [facebookGameId]);
  }
});

test('Facebook baseUrl 变化原子失效旧目标状态，规范化未变化时不误清', async () => {
  const facebookGameId = '00000000-0000-0000-0000-000000000002';
  const facebookCommunityId = '00000000-0000-0000-0000-000000000102';
  const facebookSourceId = 'facebook-target-change-source';
  const facebookAccountId = 'facebook-target-change-account';
  const facebookRunId = 'facebook-target-change-run';
  await repo.query(`CREATE TABLE IF NOT EXISTS po_source_schedule_state (
    source_id VARCHAR(64) PRIMARY KEY, schedule_version BIGINT NOT NULL DEFAULT 1, effective_at DATETIME NOT NULL,
    last_scheduled_at DATETIME NULL, next_scheduled_at DATETIME NULL, last_scan_at DATETIME NULL,
    lease_run_id VARCHAR(64) NULL, lease_owner VARCHAR(160) NULL, lease_epoch BIGINT NOT NULL DEFAULT 0,
    lease_until DATETIME NULL, last_status VARCHAR(30) NULL, last_reason_code VARCHAR(80) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  const cleanup = async () => {
    await repo.query('DELETE FROM po_sync_checkpoints WHERE account_id=?', [facebookAccountId]);
    await repo.query('DELETE FROM po_sync_runs WHERE account_id=?', [facebookAccountId]);
    await repo.query('DELETE FROM po_source_schedule_state WHERE source_id=?', [facebookSourceId]);
    await repo.query('DELETE FROM po_source_capabilities WHERE source_id=?', [facebookSourceId]);
    await repo.query('DELETE FROM po_credentials WHERE source_id=?', [facebookSourceId]);
    await repo.query('DELETE FROM po_accounts WHERE id=?', [facebookAccountId]);
    await repo.query('DELETE FROM po_sources WHERE id=?', [facebookSourceId]);
    await repo.query('DELETE FROM po_communities WHERE id=?', [facebookCommunityId]);
    await repo.query('DELETE FROM po_games WHERE id=?', [facebookGameId]);
  };
  await cleanup();
  try {
    await repo.query('INSERT INTO po_games (id,name,region_code) VALUES (?,?,?)', [facebookGameId, 'Last Night', 'overseas']);
    await repo.query('INSERT INTO po_communities (id,game_id,name,status,region_code) VALUES (?,?,?,?,?)', [facebookCommunityId, facebookGameId, 'Last Night 海外社区', 'enabled', 'overseas']);
    await repo.query('INSERT INTO po_sources (id,game_id,community_id,platform,display_name,enabled,config,auth_status,collect_requested_at) VALUES (?,?,?,?,?,1,?,\'authorized\',NOW())', [facebookSourceId, facebookGameId, facebookCommunityId, 'facebook', 'Facebook 地址变更源', JSON.stringify({ baseUrl: 'https://www.facebook.com/old-page' })]);
    await repo.query('INSERT INTO po_accounts (id,game_id,community_id,source_id,platform,platform_account_id,account_name,enabled,auth_status,profile_url,last_full_sync_at,last_incremental_sync_at,metadata) VALUES (?,?,?,?,?,?,?,?,?,?,NOW(),NOW(),?)', [facebookAccountId, facebookGameId, facebookCommunityId, facebookSourceId, 'facebook', 'page-123', 'Facebook Page', 1, 'authorized', 'https://www.facebook.com/old-page', '{}']);
    await repo.query('INSERT INTO po_credentials (id,account_id,source_id,credential_type,secret_cipher,status) VALUES (?,?,?,?,?,?)', ['facebook-target-change-credential', facebookAccountId, facebookSourceId, 'api_token', 'encrypted-token-kept', 'active']);
    for (const capability of ['page', 'posts', 'comments', 'replies']) await repo.query('INSERT INTO po_source_capabilities (id,source_id,capability,status) VALUES (?,?,?,?)', [`facebook-cap-${capability}`, facebookSourceId, capability, 'authorized_scope']);
    await repo.query('INSERT INTO po_sync_runs (id,account_id,status,sync_mode,lease_owner,lease_until) VALUES (?,?,\'running\',\'incremental\',?,DATE_ADD(NOW(), INTERVAL 1 HOUR))', [facebookRunId, facebookAccountId, 'old-worker']);
    await repo.query('INSERT INTO po_sync_checkpoints (id,account_id,sync_scope,root_platform_content_id,status,task_kind,task_key,`cursor`) VALUES (?,?,?,?,?,?,?,?)', ['facebook-target-change-checkpoint', facebookAccountId, 'posts', '', 'running', 'sync', '', 'old-cursor']);
    await repo.query('INSERT INTO po_source_schedule_state (source_id,schedule_version,effective_at,next_scheduled_at,lease_run_id,lease_owner,lease_epoch,lease_until) VALUES (?,1,NOW(),DATE_ADD(NOW(), INTERVAL 1 HOUR),?,?,1,DATE_ADD(NOW(), INTERVAL 1 HOUR))', [facebookSourceId, facebookRunId, 'scheduler-old']);

    const changed = await api(`/sources/${facebookSourceId}`, { method: 'PATCH', body: JSON.stringify({ baseUrl: 'https://www.facebook.com/new-page' }) });
    assert.equal(changed.status, 200);
    const source = (await repo.query('SELECT enabled,auth_status,collect_requested_at,config FROM po_sources WHERE id=?', [facebookSourceId]))[0];
    const account = (await repo.query('SELECT platform_account_id,profile_url,auth_status,auth_expire_at,last_full_sync_at,last_incremental_sync_at FROM po_accounts WHERE id=?', [facebookAccountId]))[0];
    const run = (await repo.query('SELECT status,error_code,lease_owner,lease_until FROM po_sync_runs WHERE id=?', [facebookRunId]))[0];
    const schedule = (await repo.query('SELECT next_scheduled_at,lease_run_id,lease_owner,lease_epoch,last_reason_code FROM po_source_schedule_state WHERE source_id=?', [facebookSourceId]))[0];
    assert.equal(source.enabled, 0); assert.equal(source.auth_status, 'unconfigured'); assert.equal(source.collect_requested_at, null);
    assert.equal(JSON.parse(source.config).baseUrl, 'https://www.facebook.com/new-page');
    assert.equal(account.platform_account_id, `pending:${facebookAccountId}`); assert.equal(account.profile_url, null); assert.equal(account.auth_status, 'unconfigured');
    assert.equal(account.last_full_sync_at, null); assert.equal(account.last_incremental_sync_at, null);
    assert.equal(run.status, 'failed'); assert.equal(run.error_code, 'FACEBOOK_TARGET_CHANGED'); assert.equal(run.lease_owner, null);
    assert.equal(schedule.next_scheduled_at, null); assert.equal(schedule.lease_run_id, null); assert.equal(schedule.lease_owner, null); assert.equal(Number(schedule.lease_epoch), 2); assert.equal(schedule.last_reason_code, 'FACEBOOK_TARGET_CHANGED');
    assert.equal((await repo.query('SELECT COUNT(*) AS total FROM po_source_capabilities WHERE source_id=?', [facebookSourceId]))[0].total, 0);
    assert.equal((await repo.query('SELECT COUNT(*) AS total FROM po_sync_checkpoints WHERE account_id=?', [facebookAccountId]))[0].total, 0);
    assert.equal((await repo.query('SELECT COUNT(*) AS total FROM po_credentials WHERE account_id=?', [facebookAccountId]))[0].total, 1);

    await repo.query("UPDATE po_sources SET enabled=1, auth_status='authorized' WHERE id=?", [facebookSourceId]);
    await repo.query("UPDATE po_accounts SET platform_account_id='page-456', auth_status='authorized' WHERE id=?", [facebookAccountId]);
    await repo.query('INSERT INTO po_source_capabilities (id,source_id,capability,status) VALUES (?,?,?,?)', ['facebook-cap-same-page', facebookSourceId, 'page', 'authorized_scope']);
    await repo.query('INSERT INTO po_sync_checkpoints (id,account_id,sync_scope,root_platform_content_id,status,task_kind,task_key,`cursor`) VALUES (?,?,?,?,?,?,?,?)', ['facebook-target-same-checkpoint', facebookAccountId, 'posts', '', 'completed', 'sync', '', 'safe-cursor']);
    const unchanged = await api(`/sources/${facebookSourceId}`, { method: 'PATCH', body: JSON.stringify({ baseUrl: 'https://facebook.com/new-page/?utm_source=admin' }) });
    assert.equal(unchanged.status, 200);
    assert.equal((await repo.query('SELECT enabled FROM po_sources WHERE id=?', [facebookSourceId]))[0].enabled, 1);
    assert.equal((await repo.query('SELECT platform_account_id FROM po_accounts WHERE id=?', [facebookAccountId]))[0].platform_account_id, 'page-456');
    assert.equal((await repo.query('SELECT COUNT(*) AS total FROM po_source_capabilities WHERE source_id=?', [facebookSourceId]))[0].total, 1);
    assert.equal((await repo.query('SELECT COUNT(*) AS total FROM po_sync_checkpoints WHERE account_id=?', [facebookAccountId]))[0].total, 1);

    const sourceCredentialRunId = 'facebook-source-credential-run';
    await repo.query('INSERT INTO po_sync_runs (id,account_id,status,sync_mode,lease_owner,lease_until) VALUES (?,?,\'running\',\'incremental\',?,DATE_ADD(NOW(), INTERVAL 1 HOUR))', [sourceCredentialRunId, facebookAccountId, 'source-credential-worker']);
    await repo.query('UPDATE po_source_schedule_state SET next_scheduled_at=DATE_ADD(NOW(), INTERVAL 1 HOUR),lease_run_id=?,lease_owner=?,lease_until=DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE source_id=?', [sourceCredentialRunId, 'source-credential-scheduler', facebookSourceId]);
    const sourceCredential = await api(`/sources/${facebookSourceId}/credential`, { method: 'PUT', body: JSON.stringify({ credentialType: 'api_token', secret: 'replacement-source-token' }) });
    assert.equal(sourceCredential.status, 400);
    assert.equal((await repo.query('SELECT enabled FROM po_sources WHERE id=?', [facebookSourceId]))[0].enabled, 1);
    assert.equal((await repo.query('SELECT status FROM po_sync_runs WHERE id=?', [sourceCredentialRunId]))[0].status, 'running');
    assert.equal((await repo.query('SELECT COUNT(*) AS total FROM po_source_capabilities WHERE source_id=?', [facebookSourceId]))[0].total, 1);
    assert.equal((await repo.query('SELECT COUNT(*) AS total FROM po_sync_checkpoints WHERE account_id=?', [facebookAccountId]))[0].total, 1);
    assert.equal((await repo.query('SELECT platform_account_id FROM po_accounts WHERE id=?', [facebookAccountId]))[0].platform_account_id, 'page-456');

    const accountCredentialRunId = 'facebook-account-credential-run';
    await repo.query("UPDATE po_sources SET enabled=1, auth_status='authorized' WHERE id=?", [facebookSourceId]);
    await repo.query("UPDATE po_accounts SET auth_status='authorized' WHERE id=?", [facebookAccountId]);
    await repo.query("UPDATE po_source_capabilities SET status='authorized_scope' WHERE source_id=? AND capability='page'", [facebookSourceId]);
    await repo.query('INSERT INTO po_sync_runs (id,account_id,status,sync_mode,lease_owner,lease_until) VALUES (?,?,\'running\',\'incremental\',?,DATE_ADD(NOW(), INTERVAL 1 HOUR))', [accountCredentialRunId, facebookAccountId, 'account-credential-worker']);
    const accountCredential = await api(`/accounts/${facebookAccountId}/credential`, { method: 'PUT', body: JSON.stringify({ credentialType: 'api_token', secret: 'replacement-account-token' }) });
    assert.equal(accountCredential.status, 400);
    assert.equal((await repo.query('SELECT enabled FROM po_sources WHERE id=?', [facebookSourceId]))[0].enabled, 1);
    assert.equal((await repo.query('SELECT status FROM po_sync_runs WHERE id=?', [accountCredentialRunId]))[0].status, 'running');
    assert.equal((await repo.query('SELECT COUNT(*) AS total FROM po_source_capabilities WHERE source_id=?', [facebookSourceId]))[0].total, 1);
    assert.equal((await repo.query('SELECT COUNT(*) AS total FROM po_sync_checkpoints WHERE account_id=?', [facebookAccountId]))[0].total, 1);
  } finally { await cleanup(); }
});

test('DELETE /sources/:id 软删除：列表消失但 DB 行仍在（历史数据保留）', async () => {
  const created = await api('/sources', { method: 'POST', body: JSON.stringify({ gameId, communityId: 'c-test-1', platform: 'bigplayer_h5', displayName: '待删源', baseUrl: 'https://community.bigplayer.com/', apiToken: 'delete-token' }) });
  const delId = created.body.data.id;
  const del = await api(`/sources/${delId}`, { method: 'DELETE' });
  assert.equal(del.status, 200);
  assert.equal(del.body.data.deleted, true);
  // 列表接口不再返回该源
  const list = await api(`/sources?gameId=${gameId}`);
  assert.ok(!list.body.data.some(s => s.id === delId), '软删除后列表不含该源');
  // 但物理行仍在，config.deleted=true
  const rows = await repo.query('SELECT config FROM po_sources WHERE id=?', [delId]);
  assert.equal(rows.length, 1, '物理行保留');
  const cfg = typeof rows[0].config === 'string' ? JSON.parse(rows[0].config) : rows[0].config;
  assert.equal(cfg.deleted, true);
});

test('DELETE /sources/:id 不存在返回 404', async () => {
  const res = await api('/sources/does-not-exist', { method: 'DELETE' });
  assert.equal(res.status, 404);
});
