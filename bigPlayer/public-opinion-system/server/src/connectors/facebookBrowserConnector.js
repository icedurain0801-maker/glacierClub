'use strict';
const { FacebookGraphConnector } = require('./facebookGraphConnector');
const { LoginSessionClient } = require('../services/loginSessionClient');
const { isFacebookBrowser, normalizeFacebookWebUrl } = require('../../../shared/facebookBrowser');
const { ConnectorError } = require('./baseConnector');

class FacebookBrowserConnector extends FacebookGraphConnector {
  constructor(env = process.env, deps = {}) { super(env, deps); this.loginClient = deps.loginSessionClient || new LoginSessionClient(env, deps); this.renewals = new Map(); this.retryAt = new Map(); }
  hasSourceCapability(capability, source) { return isFacebookBrowser(source) ? ['posts', 'comments', 'replies', 'owned_content'].includes(capability) : this.hasCapability(capability); }
  async installationHealth(source) {
    if (!isFacebookBrowser(source)) return super.installationHealth(source);
    const configured = this.loginClient.configured();
    return { platform: 'facebook', installed: configured, configured, mode: 'browser', reason: configured ? null : 'LOGIN_SESSION_SERVICE_NOT_CONFIGURED', capabilities: ['posts', 'comments', 'replies'] };
  }
  async accountHealth(input = {}) {
    const { source, account } = input;
    if (!isFacebookBrowser(source)) return super.accountHealth(input);
    const installation = await this.installationHealth(source);
    if (['pending_verification', 'unconfigured', 'revoked'].includes(account?.auth_status)) return { ...installation, authorized: false, configured: false, reason: 'LOGIN_REQUIRED' };
    if (!installation.configured || !account?.id) return { ...installation, authorized: false, configured: false, reason: installation.reason || 'ACCOUNT_NOT_FOUND' };
    try {
      const status = await this.ensureSession(source, account);
      return { ...installation, capabilities: Object.fromEntries(['posts', 'comments', 'replies'].map(scope => [scope, { status: status.status === 'active' ? 'authorized_scope' : 'unavailable' }])), authorized: status.status === 'active', configured: status.status === 'active', reason: status.status === 'active' ? null : status.status === 'manual_verification' ? 'MANUAL_VERIFICATION_REQUIRED' : status.failureCode || 'SESSION_EXPIRED' };
    } catch (error) { return { ...installation, authorized: false, configured: false, reason: error.code || 'LOGIN_SESSION_SERVICE_UNAVAILABLE' }; }
  }
  async ensureSession(source, account) {
    const binding = { sourceId: source.id, accountId: account.id, platform: 'facebook' };
    let status;
    try { status = await this.loginClient.getStatus(binding); }
    catch (error) { if (error.code !== 'ACCOUNT_NOT_FOUND') throw error; status = { status: 'expired' }; }
    if (['active', 'manual_verification', 'verifying', 'invalid_credentials', 'revoked'].includes(status.status)) return status;
    // One bounded renewal per account; challenges and bad credentials require an administrator.
    const key = account.id;
    if (this.renewals.has(key)) return this.renewals.get(key);
    if ((this.retryAt.get(key) || 0) > Date.now()) return status;
    const renewal = (async () => {
      this.retryAt.set(key, Date.now() + 30 * 60 * 1000);
      await this.loginClient.bindAccount({ ...binding, credentialRef: 'credential:' + account.id + ':account_password' });
      const restored = await this.loginClient.startLogin({ ...binding, scenario: 'resume_external' });
      if (restored.status === 'active') this.retryAt.delete(key);
      return restored;
    })();
    this.renewals.set(key, renewal);
    try { return await renewal; } finally { this.renewals.delete(key); }
  }
  async browserPage(scope, input) {
    normalizeFacebookWebUrl(require('../../../shared/facebookBrowser').configOf(input.source).baseUrl);
    const binding = { sourceId: input.source.id, accountId: input.account.id, platform: 'facebook' };
    const reference = await this.loginClient.getSessionReference(binding);
    try { return await this.loginClient.collectFacebook({ ...binding, sessionRef: reference.sessionRef, scope, postId: input.postId, commentId: input.commentId, cursor: input.cursor, limit: input.limit, publishedFrom:input.publishedFrom, publishedTo:input.publishedTo, allVisible:input.allVisible===true }); }
    catch (error) { throw new ConnectorError(error.code || 'FACEBOOK_BROWSER_FAILED', error.message); }
  }
  listPosts(input) { return isFacebookBrowser(input.source) ? this.browserPage('posts', input) : super.listPosts(input); }
  listOwnedContents(input) { return this.listPosts(input); }
  listComments(input) { return isFacebookBrowser(input.source) ? this.browserPage('comments', input) : super.listComments(input); }
  listReplies(input) { return isFacebookBrowser(input.source) ? this.browserPage('replies', input) : super.listReplies(input); }
  async detectCapabilities(input) {
    if (!isFacebookBrowser(input?.source)) return super.detectCapabilities(input);
    const health = await this.accountHealth(input);
    return Object.fromEntries(['posts', 'comments', 'replies'].map(scope => [scope, { status: health.authorized ? 'authorized_scope' : 'unavailable', errorCode: health.reason || null }]));
  }
}
module.exports = { FacebookBrowserConnector };
