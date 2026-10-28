'use strict';

const cipher = require('../integrations/credentialCipher');
const { parseSecret } = require('./credentialContext');
const { tokenClaimExpiry } = require('./tokenExpiry');
const { ConnectorError } = require('../connectors/baseConnector');
const HOSTS = new Set(['club.q1.com', 'club-en.q1.com', 'club.iyogames.cn']);
const DAY = 86400000;
const object = value => typeof value === 'string' ? JSON.parse(value || '{}') : value || {};
const fail = code => { const error = new ConnectorError(code, 'Token 自动续期验证失败，原授权已保留，请重新检测授权'); error.status = 400; throw error; };
const bare = value => String(value || '').trim().replace(/^Bearer\s+/i, '');

function tokenMode(account, passwordActive = false) {
  const mode = object(account?.metadata).bigplayerAuthMode;
  return mode ? mode === 'api_token' : !passwordActive;
}

class BigPlayerTokenRenewal {
  constructor({ repo, fetchImpl = globalThis.fetch, env = process.env, now = Date.now } = {}) {
    this.repo = repo; this.fetchImpl = fetchImpl; this.env = env; this.now = now;
    this.nextScan = 0;
  }

  async exchange(source, input, signal) {
    const config = object(source.config);
    let base;
    try { base = new URL(config.baseUrl); } catch { fail('TOKEN_RENEWAL_SITE_INVALID'); }
    if (source.platform !== 'bigplayer_h5' || base.protocol !== 'https:' || !HOSTS.has(base.hostname)
      || base.username || base.password || base.hash || (base.port && base.port !== '443')) fail('TOKEN_RENEWAL_SITE_INVALID');
    const token = bare(input);
    if (!token || token.length > 8192 || /\s/.test(token)) fail('AUTHORIZATION_MISSING');
    const language = base.searchParams.get('lang') || 'zh-Hans';
    const request = async (path, authorization, params = {}) => {
      const url = new URL(path, base);
      for (const [key, value] of Object.entries(params)) if (value != null) url.searchParams.set(key, value);
      // Do not forward raw URLs/errors to logging: login query contains a credential.
      try {
        const response = await this.fetchImpl(url, { method: 'GET', redirect: 'manual', headers: {
          accept: 'application/json', authorization: `Bearer ${authorization}`, 'content-language': language
        }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
        if (!response.ok || (response.url && new URL(response.url).origin !== base.origin)) fail('TOKEN_RENEWAL_REJECTED');
        const payload = await response.json();
        if (payload?.code !== 0 || !payload.data) fail(payload?.code === 1 ? 'TOKEN_RENEWAL_TOURIST' : 'TOKEN_RENEWAL_REJECTED');
        return payload.data;
      } catch (error) {
        if (error instanceof ConnectorError) throw error;
        fail(signal?.aborted ? 'COLLECTION_CANCELLED' : 'TOKEN_RENEWAL_REQUEST_FAILED');
      }
    };
    const before = await request('/api/club/v1/auth/user/context', token);
    const params = { token, gameId: base.searchParams.get('gameId') || '-1' };
    for (const key of ['gameVersion', 'languageId']) if (base.searchParams.has(key)) params[key] = base.searchParams.get(key);
    const result = await request('/api/club/v1/login/token', token, params);
    const next = bare(result.token);
    if (!next || /\s/.test(next)) fail('TOKEN_RENEWAL_RESPONSE_INVALID');
    const expiresAt = tokenClaimExpiry(next);
    const oldExpiry = tokenClaimExpiry(token);
    if (!expiresAt || Date.parse(expiresAt) <= this.now() || (oldExpiry && Date.parse(expiresAt) < Date.parse(oldExpiry))) fail('TOKEN_RENEWAL_EXPIRY_INVALID');
    const after = await request('/api/club/v1/auth/user/context', next);
    const boardId = String(config.boardId || '');
    if (before.account?.id == null || after.account?.id == null || String(before.account.id) !== String(after.account.id)) fail('TOKEN_RENEWAL_IDENTITY_CHANGED');
    if (!boardId || !Array.isArray(after.boards) || !after.boards.some(b => String(b.id ?? b.boardId) === boardId)) fail('TOKEN_RENEWAL_BOARD_MISSING');
    // Claims are only expiry/safety metadata; remote authenticated identity is mandatory above.
    try {
      const claims = JSON.parse(Buffer.from(next.split('.')[1], 'base64url'));
      if (!['0', 'false'].includes(String(claims.IsTourist).toLowerCase())) fail('TOKEN_RENEWAL_TOURIST');
    } catch (error) { if (error instanceof ConnectorError) throw error; fail('TOKEN_RENEWAL_RESPONSE_INVALID'); }
    return { apiToken: next, expiresAt };
  }

  async renew({ source, account, force = false }) {
    const lock = `po-auth-refresh:${account.id}`;
    if (!await this.repo.acquireAdvisoryLock(lock, 0)) return { skipped: true, reason: 'AUTH_REFRESH_ALREADY_RUNNING' };
    try {
      account = await this.repo.getAccount(account.id);
      if (!account || account.source_id !== source.id) fail('ACCOUNT_SCOPE_MISMATCH');
      const password = await this.repo.getCredentialByAccount(account.id, 'account_password');
      if (!tokenMode(account, password?.status === 'active') && !force) return { skipped: true, reason: 'PASSWORD_AUTH_UNCHANGED' };
      const credential = await this.repo.getCredentialByAccount(account.id, 'api_token', { includeSecret: true });
      if (!credential?.secret_cipher || credential.status !== 'active') return { skipped: true, reason: 'TOKEN_NOT_CONFIGURED' };
      const envelope = object(credential.secret_cipher);
      const options = envelope.v === 2 && envelope.aad ? { aad: `${account.id}:api_token:${account.platform}` } : {};
      const old = parseSecret(cipher.decrypt(credential.secret_cipher, this.env, options)).apiToken;
      const expiry = tokenClaimExpiry(bare(old));
      if (!force && expiry && Date.parse(expiry) - this.now() > DAY) return { skipped: true, reason: 'TOKEN_NOT_DUE' };
      const result = await this.exchange(source, old);
      if (!force && expiry && Date.parse(result.expiresAt) <= Date.parse(expiry)) fail('TOKEN_RENEWAL_NOT_EXTENDED');
      const secretCipher = cipher.encrypt(result.apiToken, this.env, { aad: `${account.id}:api_token:${account.platform}`, kid: this.env.CREDENTIAL_ENC_KEY_ID || 'primary' });
      const conn = await this.repo.pool.getConnection();
      try {
        await conn.beginTransaction();
        // Same source -> account -> credential lock order as configuration saves.
        const [sources] = await conn.query('SELECT id,config FROM po_sources WHERE id=? FOR UPDATE', [source.id]);
        const [accounts] = await conn.query('SELECT id,metadata FROM po_accounts WHERE id=? AND source_id=? FOR UPDATE', [account.id, source.id]);
        const [rows] = await conn.query("SELECT secret_cipher FROM po_credentials WHERE id=? AND status='active' FOR UPDATE", [credential.id]);
        if (!sources[0] || !accounts[0] || JSON.stringify(object(sources[0].config)) !== JSON.stringify(object(source.config))
          || !rows[0] || JSON.stringify(object(rows[0].secret_cipher)) !== JSON.stringify(envelope)
          || JSON.stringify(object(accounts[0].metadata)) !== JSON.stringify(object(account.metadata))
          || (!force && object(accounts[0].metadata).bigplayerAuthMode === 'account_password')) fail('TOKEN_RENEWAL_CONFIGURATION_CHANGED');
        const date = new Date(result.expiresAt);
        await conn.query("UPDATE po_credentials SET secret_cipher=?,expire_at=?,failure_reason=NULL,last_checked_at=UTC_TIMESTAMP(3),updated_at=UTC_TIMESTAMP(3) WHERE id=?", [secretCipher, date, credential.id]);
        await conn.query("UPDATE po_accounts SET auth_status='authorized',auth_expire_at=?,updated_at=UTC_TIMESTAMP(3) WHERE id=?", [date, account.id]);
        await conn.query("UPDATE po_sources SET auth_status='authorized',auth_expire_at=?,updated_at=UTC_TIMESTAMP(3) WHERE id=?", [date, source.id]);
        await conn.commit();
      } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
      return { refreshed: true, expiresAt: result.expiresAt };
    } finally { await this.repo.releaseAdvisoryLock(lock); }
  }

  async runDue() {
    if (this.now() < this.nextScan) return;
    this.nextScan = this.now() + 3600000;
    const accounts = await this.repo.listAccounts({ platform: 'bigplayer_h5', enabled: true });
    const sources = await this.repo.listSources(null, { platform: 'bigplayer_h5' });
    for (const account of accounts) {
      const source = sources.find(s => s.id === account.source_id);
      if (!source?.enabled) continue;
      try { await this.renew({ source, account }); }
      catch (error) {
        // Preserve both encrypted token and authorization status on failure.
        const code = /^TOKEN_RENEWAL_[A-Z_]+$/.test(error.code || '') ? error.code : 'TOKEN_RENEWAL_FAILED';
        await this.repo.query("UPDATE po_credentials SET failure_reason=?,last_checked_at=UTC_TIMESTAMP(3) WHERE account_id=? AND credential_type='api_token'", [code, account.id]);
      }
    }
  }
}

module.exports = { BigPlayerTokenRenewal, tokenMode };
