'use strict';

const credentialCipher = require('../integrations/credentialCipher');
const { ConnectorError } = require('../connectors/baseConnector');

class AuthRefreshCoordinator {
  constructor({ repo, loginSessionClient, env = process.env, cipher = credentialCipher } = {}) {
    if (!repo || typeof repo.acquireAdvisoryLock !== 'function') throw new TypeError('repo advisory lock is required');
    if (!loginSessionClient) throw new TypeError('loginSessionClient is required');
    this.repo = repo;
    this.loginSessionClient = loginSessionClient;
    this.env = env;
    this.cipher = cipher;
    this.lockWaitSeconds = Math.max(0, Number(env.AUTH_REFRESH_LOCK_WAIT_SECONDS || 0));
  }

  async refresh({ source, account }) {
    if (!source?.id || !account?.id) throw new ConnectorError('AUTH_REFRESH_FAILED', 'account refresh binding is incomplete');
    const lockName = `po-auth-refresh:${account.id}`;
    const acquired = await this.repo.acquireAdvisoryLock(lockName, this.lockWaitSeconds);
    if (!acquired) throw new ConnectorError('AUTH_REFRESH_ALREADY_RUNNING', 'account authorization refresh is already running');
    try {
      const binding = { sourceId: source.source_id || source.sourceId || source.id, accountId: account.id, platform: source.platform };
      const passwordCredential = await this.repo.getCredentialByAccount(account.id, 'account_password');
      if (!passwordCredential || passwordCredential.status !== 'active') throw new ConnectorError('AUTH_REFRESH_CREDENTIAL_NOT_CONFIGURED', 'account password credential is not configured');
      if (typeof this.loginSessionClient.configured === 'function' && !this.loginSessionClient.configured()) {
        throw new ConnectorError('LOGIN_SESSION_SERVICE_NOT_CONFIGURED', 'login session service is not configured');
      }
      if (typeof this.loginSessionClient.bindAccount === 'function') {
        await this.loginSessionClient.bindAccount({ ...binding, credentialRef: `credential:${account.id}:account_password`, maskedPhone: account.masked_login_identifier || null });
      }
      const started = await this.loginSessionClient.startLogin({ ...binding, scenario: this.env.LOGIN_SESSION_MOCK_SCENARIO || undefined, reason: 'api_token_expired' });
      if (started?.status === 'manual_verification' || started?.challengeId) throw new ConnectorError('AUTH_REFRESH_CHALLENGE_REQUIRED', 'manual login verification is required');
      if (started?.status !== 'active') {
        const failureCode = typeof started?.failureCode === 'string' && started.failureCode
          ? started.failureCode
          : 'AUTH_REFRESH_FAILED';
        throw new ConnectorError(failureCode, 'login session did not become active');
      }
      const result = await this.loginSessionClient.claimAuthResult(binding);
      const apiToken = result?.apiToken || result?.accessToken;
      if (typeof apiToken !== 'string' || !apiToken.trim()) throw new ConnectorError('AUTH_REFRESH_FAILED', 'login session returned no API token');
      const secretCipher = this.cipher.encrypt(apiToken, this.env, { aad: `${account.id}:api_token:${account.platform}`, kid: this.env.CREDENTIAL_ENC_KEY_ID || 'primary' });
      await this.repo.upsertAccountCredential(account.id, { credentialType: 'api_token', secretCipher, status: 'active', expireAt: result.expiresAt || null });
      await this.repo.updateAccount(account.id, { authStatus: 'authorized', authExpireAt: result.expiresAt || null });
      await this.repo.updateSourceAuth(source.id, { authStatus: 'authorized', authExpireAt: result.expiresAt || null });
      return { refreshed: true, expiresAt: result.expiresAt || null };
    } catch (error) {
      if (error instanceof ConnectorError) throw error;
      const code = typeof error?.code === 'string' && (
        /^LOGIN_SESSION_/.test(error.code) ||
        /^LOGIN_/.test(error.code) ||
        /^CAPABILITY_/.test(error.code) ||
        /^ADAPTER_/.test(error.code)
      )
        ? error.code
        : 'AUTH_REFRESH_FAILED';
      throw new ConnectorError(code, 'authorization refresh failed');
    } finally {
      await this.repo.releaseAdvisoryLock(lockName);
    }
  }
}

module.exports = { AuthRefreshCoordinator };
