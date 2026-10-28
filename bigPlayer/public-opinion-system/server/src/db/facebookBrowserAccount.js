'use strict';
const crypto = require('node:crypto');
const { configOf } = require('../../../shared/facebookBrowser');

async function saveFacebookBrowserAccount(repo, sourceId, patch) {
  const conn = await repo.pool.getConnection();
  try {
    await conn.beginTransaction();
    const [sources] = await conn.query("SELECT * FROM po_sources WHERE id=? AND platform='facebook' FOR UPDATE", [sourceId]);
    const source = sources[0];
    if (!source || configOf(source).deleted) throw failure('NOT_FOUND', '采集源不存在');
    const [accounts] = await conn.query('SELECT * FROM po_accounts WHERE source_id=? ORDER BY (id=?) DESC,created_at DESC,id DESC LIMIT 1 FOR UPDATE', [sourceId, source.default_account_id || '']);
    const account = accounts[0]; if (!account) throw failure('ACCOUNT_NOT_FOUND', '未找到本社区账号');
    if ((source.default_account_id && source.default_account_id !== account.id) || account.platform !== 'facebook' || account.game_id !== source.game_id || account.community_id !== source.community_id) throw failure('OWNERSHIP_MISMATCH', '账号不属于当前社区采集源');
    const [running] = await conn.query("SELECT id FROM po_sync_runs WHERE account_id=? AND status IN ('running','queued','pausing','cancelling') LIMIT 1 FOR UPDATE", [account.id]);
    if (running.length) throw failure('SOURCE_RUN_ACTIVE', '采集任务尚未结束，请完成或取消后修改账号配置');
    // Older browser sources were created without the unified scheduler binding.
    // Only the verified account belonging to this exact source/community can repair it.
    if (!source.default_account_id) await conn.query('UPDATE po_sources SET default_account_id=? WHERE id=? AND default_account_id IS NULL', [account.id,sourceId]);
    const config = { ...configOf(source), collectionMode: 'browser', baseUrl: patch.baseUrl };
    const invalidated = configOf(source).collectionMode !== 'browser' || configOf(source).baseUrl !== patch.baseUrl || Boolean(patch.secretCipher);
    await conn.query('UPDATE po_sources SET display_name=?,frequency_seconds=?,config=?,enabled=IF(?,0,enabled),auth_status=IF(?,\'pending_verification\',auth_status),collect_requested_at=IF(?,NULL,collect_requested_at),updated_at=UTC_TIMESTAMP() WHERE id=?', [patch.displayName, patch.frequencySeconds, JSON.stringify(config), invalidated, invalidated, invalidated, sourceId]);
    if (patch.secretCipher) {
      await conn.query("INSERT INTO po_credentials(id,account_id,source_id,credential_type,secret_ref,secret_cipher,status) VALUES(?,?,?,'account_password','',?,'active') ON DUPLICATE KEY UPDATE secret_cipher=VALUES(secret_cipher),secret_ref='',status='active',expire_at=NULL,failure_reason=NULL,updated_at=UTC_TIMESTAMP()", [crypto.randomUUID(), account.id, sourceId, patch.secretCipher]);
      await conn.query('UPDATE po_accounts SET masked_login_identifier=? WHERE id=?', [patch.maskedAccount, account.id]);
    }
    if (invalidated) {
      await conn.query("UPDATE po_accounts SET enabled=1,auth_status='pending_verification',auth_expire_at=NULL,updated_at=UTC_TIMESTAMP() WHERE id=?", [account.id]);
      await conn.query('DELETE FROM po_source_capabilities WHERE source_id=?', [sourceId]);
      await conn.query('DELETE FROM po_sync_checkpoints WHERE account_id=?', [account.id]);
    }
    await conn.query('INSERT INTO po_audit_events (id,game_id,source_id,account_id,actor_type,event_type,outcome,detail) VALUES (?,?,?,?,?,?,?,?)', [crypto.randomUUID(), source.game_id, source.id, account.id, 'user', 'facebook_browser_configuration_saved', 'success', JSON.stringify({ credentialsChanged: Boolean(patch.secretCipher), authorizationInvalidated: invalidated })]);
    await conn.commit(); return { invalidated, accountId: account.id };
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
}
function failure(code, message) { return Object.assign(new Error(message), { code, status: code === 'NOT_FOUND' ? 404 : 409 }); }
module.exports = { saveFacebookBrowserAccount };
