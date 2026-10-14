const crypto = require('node:crypto');
const { normalizeSiteUrls } = require('./bigplayerSiteConfig');

function fail(code, message) { throw Object.assign(new Error(message), { code, status: 400 }); }
function prepare(source, body, allowedHosts) {
  const config = typeof source.config === 'string' ? JSON.parse(source.config || '{}') : source.config || {};
  const boardId = String(body.boardId ?? config.boardId ?? '');
  if (!/^[1-9]\d*$/.test(boardId) || !Number.isSafeInteger(Number(boardId))) fail('INVALID_BOARD_ID', '版块 ID 必须为正整数');
  const sites = normalizeSiteUrls({ siteUrls: body.siteUrls ?? config.siteUrls, baseUrl: body.baseUrl ?? config.baseUrl }, { allowedHosts });
  if (body.baseUrl && normalizeSiteUrls({ baseUrl: body.baseUrl }, { allowedHosts }).baseUrl !== sites.baseUrl) fail('SITE_URL_BASE_MISMATCH', '站点地址与首站不一致');
  if (source.region_code === 'overseas' && sites.siteUrls.some(site => new URL(site.url).origin !== 'https://club-en.q1.com')) fail('URL_OUTSIDE_ALLOWED_HOSTS', '海外 BigPlayer 必须使用 https://club-en.q1.com');
  if (body.credential != null && (typeof body.credential !== 'object' || Array.isArray(body.credential))) fail('INVALID_CREDENTIALS', '授权凭据格式无效');
  const credential = body.credential && Object.keys(body.credential).length ? body.credential : null;
  if (credential) {
    if (credential.credentialType === 'api_token') {
      if (typeof credential.secret !== 'string' || !credential.secret.trim() || credential.secret.length > 8192 || /^[*•]+$/.test(credential.secret.trim())) fail('INVALID_CREDENTIALS', '请输入有效 Token');
    } else if (credential.credentialType === 'account_password') {
      if (!String(credential.account || '').trim() || typeof credential.password !== 'string' || !credential.password) fail('INVALID_CREDENTIALS', '请填写账号和密码');
    } else fail('INVALID_CREDENTIALS', '不支持的授权方式');
  }
  return { config: { ...config, ...sites, boardId }, credential };
}

class SourceAuthorizationCheck {
  constructor({ now = Date.now, ttl = 300000 } = {}) { this.now = now; this.ttl = ttl; this.key = crypto.randomBytes(32); this.receipts = new Map(); this.previews = new Map(); }
  fingerprint(source, account, prepared) {
    return crypto.createHmac('sha256', this.key).update(JSON.stringify({ sourceId: source.id, accountId: account.id,
      baseline: source.config, updatedAt: source.updated_at, config: prepared.config, credential: prepared.credential })).digest('hex');
  }
  issue(source, account, prepared, capabilities) {
    for (const [key, value] of this.receipts) if (value.expires <= this.now()) this.receipts.delete(key);
    const token = crypto.randomUUID();
    this.receipts.set(token, { fingerprint: this.fingerprint(source, account, prepared), expires: this.now() + this.ttl, capabilities });
    return token;
  }
  require(token, source, account, prepared) {
    const receipt = this.receipts.get(token);
    if (!receipt || receipt.expires <= this.now() || receipt.fingerprint !== this.fingerprint(source, account, prepared)) fail('AUTH_CHECK_REQUIRED', '请先检测当前配置的授权，通过后才能保存');
    return receipt;
  }
  resolvePreview(binding) {
    const preview = this.previews.get(binding.accountId);
    if (!preview || preview.sourceId !== binding.sourceId || preview.expires <= this.now()) return null;
    return preview.credentials;
  }
  async check({ source, account, prepared, connector, credentialContext }) {
    if (this.active?.has(account.id)) fail('AUTH_CHECK_BUSY', '该账号正在检测，请稍后重试');
    this.active ||= new Set();
    this.active.add(account.id);
    const context = Object.create(credentialContext);
    let cachedToken;
    const loaded = async type => {
      if (prepared.credential) {
        if (type !== prepared.credential.credentialType) throw Object.assign(new Error('credential not found'), { code: 'CREDENTIAL_NOT_FOUND' });
        return { apiToken: prepared.credential.secret, secretObject: prepared.credential };
      }
      return credentialContext.load(account, type);
    };
    context.load = (_, type) => loaded(type);
    context.loadApiToken = async () => cachedToken || (await loaded('api_token')).apiToken;
    context.saveApiAuthorization = async (_, __, result) => { cachedToken = result.apiToken || result.accessToken; };
    const probe = Object.create(connector);
    probe.credentialContext = context;
    probe.authRefreshCoordinator = null; // Never refresh or replace saved credentials during a draft probe.
    const previewId = `auth-preview-${crypto.randomUUID()}`;
    const draft = { ...source, account, account_id: account.id, config: prepared.config };
    let password;
    try { password = await loaded('account_password'); } catch (error) { if (error.code !== 'CREDENTIAL_NOT_FOUND') { this.active.delete(account.id); throw error; } }
    if (password) {
      this.previews.set(previewId, { sourceId: previewId, expires: this.now() + this.ttl,
        credentials: { account: password.secretObject.account, password: password.secretObject.password, baseUrl: prepared.config.baseUrl } });
      const binding = input => ({ ...input, accountId: previewId, sourceId: previewId });
      const client = connector.loginSessionClient;
      probe.loginSessionClient = Object.fromEntries(['bindAccount', 'startLogin', 'getStatus', 'claimAuthResult'].map(method => [method, input => client[method](binding(input))]));
      const originalLoad = context.load;
      context.load = async (subject, type) => type === 'account_password' && cachedToken ? Promise.reject(Object.assign(new Error('using checked token'), { code: 'CREDENTIAL_NOT_FOUND' })) : originalLoad(subject, type);
    }
    try {
      const capabilities = {};
      for (const site of prepared.config.siteUrls) {
        const siteSource = { ...draft, config: { ...prepared.config, baseUrl: site.url } };
        const preview = this.previews.get(previewId);
        if (preview) preview.credentials.baseUrl = site.url;
        cachedToken = undefined;
        const health = await probe.accountHealth(siteSource);
        if (!health.authorized) return { authStatus: 'unauthorized', reason: health.reason || 'AUTHORIZATION_FAILED', capabilities };
        const detected = await probe.detectCapabilities({ source: siteSource, account, credentialContext: context });
        capabilities[site.siteId] = detected;
      }
      return { authStatus: 'authorized', capabilities, checked: true };
    } finally {
      this.previews.delete(previewId);
      this.active.delete(account.id);
      if (password && typeof connector.loginSessionClient?.revokeSession === 'function') {
        await connector.loginSessionClient.revokeSession({ accountId: previewId, sourceId: previewId, platform: 'bigplayer_h5' }).catch(() => {});
      }
    }
  }
}
module.exports = { SourceAuthorizationCheck, prepare };
