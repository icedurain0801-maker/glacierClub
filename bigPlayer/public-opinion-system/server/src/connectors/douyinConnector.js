const { BaseConnector, ConnectorError, ConnectorPageError, ConnectorPageResult } = require('./baseConnector');

function truthy(value) { return value === 'true' || value === '1'; }
function firstDefined(object, keys, fallback = null) { for (const key of keys) if (object?.[key] != null) return object[key]; return fallback; }

class DouyinConnector extends BaseConnector {
  constructor(env = process.env, { credentialContext = null, oauthService = null, fetchImpl = globalThis.fetch } = {}) {
    const commentCapability = truthy(env.DOUYIN_COMMENTS_ENABLED);
    super({ platform: 'douyin', capabilities: ['posts', ...(commentCapability ? ['comments'] : [])] });
    this.enabled = truthy(env.DOUYIN_ENABLED);
    this.apiBaseUrl = env.DOUYIN_API_BASE_URL || '';
    this.videoListPath = env.DOUYIN_VIDEO_LIST_PATH || '/video/list/';
    this.credentialContext = credentialContext;
    this.oauthService = oauthService;
    this.fetchImpl = fetchImpl;
  }
  async installationHealth() {
    const installed = this.enabled && Boolean(this.apiBaseUrl) && Boolean(this.oauthService?.configured?.());
    const reason = !this.enabled ? 'disabled by configuration' : !this.apiBaseUrl ? 'apiBaseUrl not configured' : !this.oauthService?.configured?.() ? 'OAuth not configured' : null;
    return { platform: this.platform, installed, configured: installed, reason, capabilities: this.capabilities };
  }
  async accountHealth(source) {
    const installation = await this.installationHealth();
    if (!installation.installed) return { ...installation, authorized: false, configured: false };
    if (!this.credentialContext) return { ...installation, authorized: false, configured: false, reason: 'account credential context required' };
    try { await this.credentialContext.load(source, 'oauth_access_refresh'); return { ...installation, authorized: true, configured: true, reason: null }; }
    catch (error) { return { ...installation, authorized: false, configured: false, reason: error.code || 'account credential invalid' }; }
  }
  async listOwnedContents(input = {}) { return this.listPosts(input); }
  async searchContents() { throw new ConnectorError('CAPABILITY_UNSUPPORTED', 'Douyin keyword search requires the phase-two authorized adapter'); }
  async detectCapabilities() {
    const installed = await this.installationHealth();
    return {
      posts: { status: installed.installed ? 'authorized_scope' : 'unsupported' },
      keyword_search: { status: 'unsupported' },
      comments: { status: this.hasCapability('comments') ? 'configured' : 'unsupported' }
    };
  }
  async listPosts({ source, credentialContext = this.credentialContext, cursor = 0, limit = 20 } = {}) {
    this.assertCapability('posts');
    const health = await this.installationHealth();
    if (!health.installed) throw new ConnectorError('CONNECTOR_NOT_CONFIGURED', health.reason || 'Douyin connector is not installed');
    if (!credentialContext) throw new ConnectorError('CREDENTIAL_CONTEXT_REQUIRED', 'account credential context is required');
    const loaded = typeof credentialContext.load === 'function' ? await credentialContext.load(source, 'oauth_access_refresh') : credentialContext;
    const apiToken = loaded?.apiToken; if (!apiToken) throw new ConnectorError('CREDENTIAL_SECRET_MISSING', 'account API token is required');
    const url = new URL(this.videoListPath, this.apiBaseUrl);
    url.searchParams.set('cursor', String(cursor)); url.searchParams.set('count', String(limit));
    let response;
    try { response = await this.fetchImpl(url, { headers: { accept: 'application/json', authorization: `Bearer ${apiToken}` }, signal: AbortSignal.timeout(15000) }); }
    catch (error) { throw new ConnectorPageError(this.platform, 'posts', cursor, error); }
    if (!response.ok) throw new ConnectorPageError(this.platform, 'posts', cursor, new ConnectorError(`DOUYIN_HTTP_${response.status}`, 'Douyin video request failed'));
    const payload = await response.json(); const data = payload.data || payload;
    const items = firstDefined(data, ['list', 'items', 'videos'], []);
    return new ConnectorPageResult({ items: Array.isArray(items) ? items : [], nextCursor: firstDefined(data, ['cursor', 'next_cursor']), hasMore: firstDefined(data, ['has_more', 'hasMore'], false), capability: 'authorized_scope', raw: payload });
  }
  async listComments() { this.assertCapability('comments'); throw new ConnectorError('DOUYIN_COMMENTS_NOT_IMPLEMENTED', 'Douyin comments capability is not implemented'); }
}
module.exports = { DouyinConnector };
