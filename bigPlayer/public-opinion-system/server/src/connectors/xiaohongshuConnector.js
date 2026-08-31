const { BaseConnector, ConnectorNotConfiguredError, ConnectorCapabilityError } = require('./baseConnector');

class XiaohongshuConnector extends BaseConnector {
  constructor(env = process.env, { loginSessionClient = null } = {}) {
    super({ platform: 'xiaohongshu', capabilities: [] });
    this.enabled = env.XIAOHONGSHU_DIRECT_LOGIN_ENABLED === 'true' || env.XIAOHONGSHU_DIRECT_LOGIN_ENABLED === '1';
    this.loginSessionClient = loginSessionClient;
  }
  async installationHealth() {
    return {
      platform: this.platform,
      installed: false,
      configured: false,
      reason: this.enabled ? 'real Xiaohongshu adapter is not configured in phase one' : 'disabled by configuration',
      capabilities: this.capabilities
    };
  }
  async accountHealth() { return { ...(await this.installationHealth()), authorized: false }; }
  async listOwnedContents() { throw new ConnectorCapabilityError(this.platform, 'owned_content'); }
  async searchContents() { throw new ConnectorCapabilityError(this.platform, 'keyword_search'); }
  async listComments() { throw new ConnectorCapabilityError(this.platform, 'comments'); }
  async collect() { throw new ConnectorNotConfiguredError(this.platform); }
}

module.exports = { XiaohongshuConnector };
