const { BaseConnector, ConnectorNotConfiguredError } = require('./baseConnector');
const { DouyinConnector } = require('./douyinConnector');
const { DouyinOAuthService } = require('../services/douyinOAuthService');
const { XiaohongshuConnector } = require('./xiaohongshuConnector');
const { TapTapConnector } = require('./taptapConnector');

class ExternalPlatformConnector extends BaseConnector {
  constructor(platform, envKey, env = process.env) { super({ platform }); this.enabled = env[`${envKey}_ENABLED`] === 'true' || env[`${envKey}_ENABLED`] === '1'; this.apiBaseUrl = env[`${envKey}_API_BASE_URL`] || ''; this.token = env[`${envKey}_API_TOKEN`] || ''; }
  async installationHealth() { const installed = this.enabled && Boolean(this.apiBaseUrl); return { platform: this.platform, installed, configured: installed, reason: this.enabled ? (installed ? null : 'official API endpoint required') : 'disabled by configuration', capabilities: this.capabilities }; }
  async accountHealth() { const installation = await this.installationHealth(); const authorized = installation.installed && Boolean(this.token); return { ...installation, authorized, configured: authorized, reason: authorized ? null : (installation.reason || 'official API credentials required') }; }
  async healthCheck() { const health = await this.accountHealth(); return { platform: health.platform, configured: health.configured, reason: health.reason }; }
  async collect() { throw new ConnectorNotConfiguredError(this.platform); }
}
function buildExternalConnectors(env = process.env, dependencies = {}) {
  const oauthService = dependencies.douyinOAuthService || new DouyinOAuthService(env, dependencies);
  return {
    taptap: new TapTapConnector(env, dependencies),
    bilibili: new ExternalPlatformConnector('bilibili', 'BILIBILI', env),
    douyin: new DouyinConnector(env, { ...dependencies, oauthService }),
    xiaohongshu: new XiaohongshuConnector(env, dependencies),
    weibo: new ExternalPlatformConnector('weibo', 'WEIBO', env),
    tieba: new ExternalPlatformConnector('tieba', 'TIEBA', env)
  };
}
module.exports = { ExternalPlatformConnector, buildExternalConnectors, DouyinConnector, XiaohongshuConnector };
