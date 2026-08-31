const crypto = require('node:crypto');
const { ConnectorError } = require('../connectors/baseConnector');

class DouyinOAuthService {
  constructor(env = process.env, { fetchImpl = globalThis.fetch, stateStore = null, randomBytes = crypto.randomBytes, now = () => Date.now() } = {}) {
    this.clientKey = env.DOUYIN_CLIENT_KEY || '';
    this.clientSecret = env.DOUYIN_CLIENT_SECRET || '';
    this.redirectUri = env.DOUYIN_REDIRECT_URI || '';
    this.authorizeUrl = env.DOUYIN_OAUTH_AUTHORIZE_URL || '';
    this.tokenUrl = env.DOUYIN_OAUTH_TOKEN_URL || '';
    this.fetchImpl = fetchImpl;
    this.stateStore = stateStore || new Map();
    this.randomBytes = randomBytes;
    this.now = now;
    this.stateTtlMs = Number(env.DOUYIN_OAUTH_STATE_TTL_MS || 600000);
  }
  configured() { return Boolean(this.clientKey && this.clientSecret && this.redirectUri && this.authorizeUrl && this.tokenUrl); }
  assertConfigured() { if (!this.configured()) throw new ConnectorError('DOUYIN_OAUTH_NOT_CONFIGURED', 'Douyin OAuth is not configured'); }
  createAuthorizationUrl({ accountId, scopes = ['user_info', 'video.list'] } = {}) {
    this.assertConfigured();
    if (!accountId) throw new ConnectorError('ACCOUNT_ID_REQUIRED', 'accountId is required');
    const state = this.randomBytes(24).toString('hex');
    this.stateStore.set(state, { accountId, expiresAt: this.now() + this.stateTtlMs });
    const url = new URL(this.authorizeUrl);
    url.searchParams.set('client_key', this.clientKey); url.searchParams.set('response_type', 'code'); url.searchParams.set('scope', scopes.join(',')); url.searchParams.set('redirect_uri', this.redirectUri); url.searchParams.set('state', state);
    return { url: url.toString(), state };
  }
  consumeState(state) {
    const record = state && this.stateStore.get(state); if (state) this.stateStore.delete(state);
    if (!record || record.expiresAt <= this.now()) throw new ConnectorError('OAUTH_STATE_INVALID', 'OAuth state is invalid or expired');
    return record;
  }
  async exchangeCode({ code, state } = {}) {
    this.assertConfigured();
    if (!code) throw new ConnectorError('OAUTH_CODE_REQUIRED', 'OAuth code is required');
    const stateRecord = this.consumeState(state);
    const body = new URLSearchParams({ client_key: this.clientKey, client_secret: this.clientSecret, code, grant_type: 'authorization_code', redirect_uri: this.redirectUri });
    const response = await this.fetchImpl(this.tokenUrl, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' }, body });
    if (!response.ok) throw new ConnectorError(`DOUYIN_OAUTH_HTTP_${response.status}`, 'Douyin OAuth token exchange failed');
    const payload = await response.json(); const data = payload.data || payload;
    if (!data.access_token) throw new ConnectorError('DOUYIN_OAUTH_TOKEN_MISSING', 'Douyin OAuth response did not include an access token');
    const rawScopes = data.scope || data.scopes || '';
    const scopes = Array.isArray(rawScopes) ? rawScopes : String(rawScopes).split(/[ ,]+/).filter(Boolean);
    return { accountId: stateRecord.accountId, accessToken: data.access_token, refreshToken: data.refresh_token || null, openId: data.open_id || null, expiresIn: Number(data.expires_in || 0) || null, scopes };
  }
}
module.exports = { DouyinOAuthService };
