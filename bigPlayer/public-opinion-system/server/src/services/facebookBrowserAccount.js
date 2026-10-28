'use strict';
const crypto = require('node:crypto');
const cipher = require('../integrations/credentialCipher');
const { configOf, isFacebookBrowser, normalizeFacebookWebUrl } = require('../../../shared/facebookBrowser');
const { saveFacebookBrowserAccount } = require('../db/facebookBrowserAccount');

class FacebookBrowserAccountService {
  constructor({ repo, loginClient, resolveScope, requireCommunity, assertCommunityScope, sourceById, env = process.env }) {
    Object.assign(this, { repo, loginClient, resolveScope, requireCommunity, assertCommunityScope, sourceById, env });
  }
  async scope(source, identity) {
    if (source.platform !== 'facebook' || source.region_code !== 'overseas' || !source.community_id) throw failure('FACEBOOK_SCOPE_MISMATCH', '仅支持境外社区 Facebook 采集源', 400);
    this.assertCommunityScope(identity, source.community_id); await this.requireCommunity(source);
  }
  validate(body, required = false) {
    const displayName = String(body.displayName || '').trim();
    if (!displayName || displayName.length > 100) throw failure('INVALID_INPUT', '采集源名称须为 1–100 字', 400);
    const baseUrl = normalizeFacebookWebUrl(body.baseUrl);
    const frequencySeconds = Number(body.frequencySeconds || 21600);
    if (![3600, 21600, 86400].includes(frequencySeconds)) throw failure('INVALID_INPUT', '请选择有效采集频率', 400);
    const account = String(body.account || '').trim(); const password = String(body.password || '');
    if ((required || account || password) && (!account || !password || account.length > 256 || password.length > 512)) throw failure('INVALID_CREDENTIALS', '请同时填写有效登录账号和密码', 400);
    if (body.confirmPassword !== undefined && body.confirmPassword !== password) throw failure('INVALID_CREDENTIALS', '两次密码输入不一致', 400);
    const allowed = new Set(['communityId', 'collectionMode', 'platform', 'displayName', 'baseUrl', 'frequencySeconds', 'account', 'password', 'confirmPassword']);
    if (Object.keys(body).some(key => !allowed.has(key))) throw failure('INVALID_INPUT', '包含不支持的配置字段', 400);
    return { displayName, baseUrl, frequencySeconds, account, password };
  }
  secret(accountId, value) {
    return cipher.encrypt(JSON.stringify({ account: value.account, password: value.password }), this.env, { aad: `${accountId}:account_password:facebook`, kid: this.env.CREDENTIAL_ENC_KEY_ID || 'primary' });
  }
  mask(account) { return account.length < 3 ? account.slice(0, 1) + '***' : account.slice(0, 2) + '***' + account.slice(-2); }
  async details(source) {
    const accounts = await this.repo.listAccounts({ sourceId: source.id });
    const account = accounts.find(row => row.id === source.default_account_id) || accounts[0];
    const credentials = account ? await this.repo.getAccountCredentialSummary(account.id) : [];
    return { ...source, config: configOf(source), account: account ? { id: account.id, auth_status: account.auth_status, enabled: account.enabled, maskedAccount: account.masked_login_identifier || '', hasAccountPassword: credentials.some(row => row.credential_type === 'account_password' && (row.has_secret_cipher || row.has_secret_ref)) } : null };
  }
  async create(body, identity) {
    const value = this.validate(body, true); const scope = await this.resolveScope({ regionCode: 'overseas', communityId: body.communityId });
    const source = { platform: 'facebook', region_code: scope.regionCode, game_id: scope.gameId, community_id: scope.communityId };
    await this.scope(source, identity);
    const sourceId = crypto.randomUUID(); const accountId = crypto.randomUUID();
    const created = await this.repo.createSourceWithAccount({ sourceId, accountId, gameId: scope.gameId, communityId: scope.communityId, platform: 'facebook', collectionMode: 'browser', displayName: value.displayName, baseUrl: value.baseUrl, frequencySeconds: value.frequencySeconds, sourceEnabled: false, accountEnabled: true, authStatus: 'pending_verification', accountName: value.displayName, maskedLoginIdentifier: this.mask(value.account), credentialType: 'account_password', secretCipher: this.secret(accountId, value), metadata: { syncMode: 'incremental', facebookAuthMode: 'account_password' } });
    return this.details({ ...created.source, region_code: 'overseas' });
  }
  async handle(source, action, method, body, identity) {
    await this.scope(source, identity);
    const details = await this.details(source); const account = details.account;
    if (!account) throw failure('ACCOUNT_NOT_FOUND', '未找到该社区登录账号', 404);
    const binding = { sourceId: source.id, accountId: account.id, platform: 'facebook' };
    if (method === 'GET' && !action) return details;
    if (method === 'PATCH' && !action) {
      const value = this.validate(body, !account.hasAccountPassword);
      const result = await saveFacebookBrowserAccount(this.repo, source.id, { ...value, secretCipher: value.account ? this.secret(account.id, value) : null, maskedAccount: this.mask(value.account) });
      if (result.invalidated && this.loginClient.configured()) {
        // Close the previous browser before acknowledging new credentials. An
        // unavailable service leaves DB authorization revoked and source off.
        try { await this.loginClient.revokeSession(binding); } catch (error) { if (!['ACCOUNT_NOT_FOUND', 'BINDING_NOT_FOUND', 'SESSION_NOT_FOUND'].includes(error.code)) return { ...await this.details(await this.sourceById(source.id)), warning: '配置已保存并停用；旧登录服务未响应，重新登录前不可采集' }; }
      }
      return this.details(await this.sourceById(source.id));
    }
    if (!isFacebookBrowser(source)) throw failure('FACEBOOK_MODE_MISMATCH', '请先保存网页登录配置', 409);
    if (method === 'GET' && action === 'status') {
      try {
        let result = await this.loginClient.getStatus(binding);
        if (result.status === 'active' && account.auth_status === 'pending_verification') return { status: 'pending_verification' };
        if (result.status === 'manual_verification' && result.challengeId) {
          const challenge = await this.loginClient.getChallenge({ ...binding, challengeId: result.challengeId });
          result = challenge.requiresPolling && challenge.type === 'external_browser'
            ? await this.loginClient.pollChallenge({ ...binding, challengeId: result.challengeId }) : { ...result, challenge };
        }
        return this.persistLogin(source, account, result);
      } catch (error) { if (['ACCOUNT_NOT_FOUND', 'BINDING_NOT_FOUND', 'SESSION_NOT_FOUND'].includes(error.code)) return { status: 'pending_verification' }; throw error; }
    }
    if (method === 'POST' && ['login', 'external-login'].includes(action)) {
      if (!account.hasAccountPassword) throw failure('CREDENTIAL_NOT_FOUND', '请先保存本社区账密', 409);
      await this.loginClient.bindAccount({ ...binding, credentialRef: `credential:${account.id}:account_password`, maskedPhone: account.maskedAccount });
      try { return await this.persistLogin(source, account, await this.loginClient.startLogin({ ...binding, ...(action === 'external-login' ? { scenario: 'external_browser' } : {}) })); } catch (error) { await this.persistLogin(source, account, { status: 'expired' }); throw error; }
    }
    if (method === 'POST' && action === 'challenge-view') { const result = await this.loginClient.inspectFacebookChallenge({ ...binding, challengeId: body.challengeId, action: body.action, x: body.x, y: body.y }); return result.approved ? this.persistLogin(source, account, result) : result; }
    if (method === 'POST' && action === 'challenge') {
      const input = { ...binding, challengeId: body.challengeId };
      const result = body.poll ? await this.loginClient.pollChallenge(input) : await this.loginClient.submitChallenge({ ...input, answer: String(body.answer || '') });
      return this.persistLogin(source, account, result);
    }
    throw failure('NOT_FOUND', '接口不存在', 404);
  }
  async persistLogin(source, account, result) {
    const status = result.status === 'active' ? 'authorized' : result.status === 'manual_verification' ? 'manual_verification' : 'unauthorized';
    await this.repo.updateAccount(account.id, { enabled: true, authStatus: status });
    await this.repo.updateSourceAuth(source.id, { authStatus: status });
    return result;
  }
}
function failure(code, message, status) { return Object.assign(new Error(message), { code, status }); }
module.exports = { FacebookBrowserAccountService };
