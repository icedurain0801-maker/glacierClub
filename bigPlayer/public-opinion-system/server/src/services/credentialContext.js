const credentialCipher = require('../integrations/credentialCipher');
const { ConnectorError } = require('../connectors/baseConnector');

class CredentialContextError extends ConnectorError {
  constructor(code, message, details = {}) { super(code, message, details); this.name = 'CredentialContextError'; }
}
function parseSecret(secret) {
  const value = String(secret || '').trim();
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') return { apiToken: parsed.apiToken || parsed.accessToken || parsed.access_token || '', accessToken: parsed.accessToken || parsed.access_token || parsed.apiToken || '', refreshToken: parsed.refreshToken || parsed.refresh_token || null };
  } catch {}
  return { apiToken: value, accessToken: value, refreshToken: null };
}

class CredentialContext {
  constructor({ repo, cipher = credentialCipher, env = process.env, now = () => new Date(), allowLegacySourceFallback = true } = {}) {
    if (!repo || (typeof repo.getCredentialByAccount !== 'function' && typeof repo.getCredential !== 'function')) throw new TypeError('repo.getCredentialByAccount is required');
    this.repo = repo;
    this.cipher = cipher;
    this.env = env;
    this.now = now;
    this.allowLegacySourceFallback = allowLegacySourceFallback;
  }

  async load(accountOrId, credentialType = 'api_token') {
    const accountId = typeof accountOrId === 'string' ? accountOrId : (accountOrId?.accountId || accountOrId?.account_id || accountOrId?.id);
    if (!accountId) throw new CredentialContextError('CREDENTIAL_ACCOUNT_REQUIRED', 'credential account id is required');
    let credential;
    let legacy = false;
    if (typeof this.repo.getCredentialByAccount === 'function') credential = await this.repo.getCredentialByAccount(accountId, credentialType, { includeSecret: true });
    else if (this.allowLegacySourceFallback && typeof this.repo.getCredential === 'function') { credential = await this.repo.getCredential(accountId); legacy = true; }
    if (!credential) throw new CredentialContextError('CREDENTIAL_NOT_FOUND', 'account credential is not configured', { accountId, credentialType });
    if (credential.status !== 'active') throw new CredentialContextError('CREDENTIAL_INACTIVE', 'account credential is not active', { accountId, credentialType, status: credential.status });
    const expireValue = credential.expires_at || credential.expire_at;
    const expiresAt = expireValue ? new Date(expireValue) : null;
    if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= this.now().getTime())) throw new CredentialContextError('CREDENTIAL_EXPIRED', 'account credential has expired', { accountId, credentialType, expiresAt: expireValue });
    const secretCipher = credential.secret_cipher || credential.secretCipher;
    if (!secretCipher) throw new CredentialContextError('CREDENTIAL_SECRET_MISSING', 'encrypted account credential is missing', { accountId, credentialType });
    let secret;
    try {
      let options = {};
      const envelope = typeof secretCipher === 'string' ? JSON.parse(secretCipher) : secretCipher;
      if (envelope?.v === 2 && envelope.aad && typeof this.repo.getAccount === 'function') {
        const account = await this.repo.getAccount(accountId);
        if (!account) throw new Error('account not found');
        options = { aad: `${accountId}:${credential.credential_type || credentialType}:${account.platform}` };
      }
      secret = this.cipher.decrypt(secretCipher, this.env, options);
    } catch { throw new CredentialContextError('CREDENTIAL_DECRYPT_FAILED', 'account credential could not be decrypted', { accountId, credentialType }); }
    const tokens = parseSecret(secret);
    const secretObject = parseSecretObject(secret);
    const resolvedCredentialType = credential.credential_type || credential.type || credentialType;
    const validSecret = resolvedCredentialType === 'account_password'
      ? Boolean(String(secretObject.account || '').trim() && String(secretObject.password || ''))
      : Boolean(tokens.apiToken || tokens.accessToken);
    if (!validSecret) throw new CredentialContextError('CREDENTIAL_SECRET_EMPTY', 'account credential is empty', { accountId, credentialType: resolvedCredentialType });
    return Object.freeze({ accountId, credentialType: resolvedCredentialType, apiToken: tokens.apiToken || tokens.accessToken, accessToken: tokens.accessToken || tokens.apiToken, refreshToken: tokens.refreshToken, secretObject, expiresAt, credentialId: credential.id || null, ...(legacy ? { legacySourceFallback: true } : {}) });
  }

  async loadApiToken(accountOrId, credentialType = 'api_token') {
    const loaded = await this.load(accountOrId, credentialType);
    return loaded.apiToken;
  }

  async loadSecretObject(accountOrId, credentialType = 'api_token') {
    const loaded = await this.load(accountOrId, credentialType);
    return loaded.secretObject;
  }

  async saveApiAuthorization(source, accountOrId, result) {
    const accountId = typeof accountOrId === 'string' ? accountOrId : accountOrId?.id;
    const account = accountId && await this.repo.getAccount(accountId);
    if (!source?.id || !account || String(account.source_id) !== String(source.id) || String(account.platform) !== String(source.platform)) {
      throw new CredentialContextError('ACCOUNT_SCOPE_MISMATCH', 'authorization account does not belong to source');
    }
    const apiToken = result?.apiToken || result?.accessToken;
    if (typeof apiToken !== 'string' || !apiToken.trim()) throw new CredentialContextError('AUTHORIZATION_MISSING', 'login returned no usable API token');
    const expiresAt = result.expiresAt ? new Date(result.expiresAt) : null;
    if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= this.now().getTime())) throw new CredentialContextError('CREDENTIAL_EXPIRED', 'login returned an expired authorization');
    const secretCipher = this.cipher.encrypt(apiToken, this.env, { aad: `${account.id}:api_token:${account.platform}`, kid: this.env.CREDENTIAL_ENC_KEY_ID || 'primary' });
    const saved = await this.repo.upsertAccountCredential(account.id, { credentialType: 'api_token', secretCipher, status: 'active', expireAt: result.expiresAt || null, replaceExpireAt: true });
    if (!saved) throw new CredentialContextError('ACCOUNT_SCOPE_MISMATCH', 'authorization account is no longer available');
  }
}

function parseSecretObject(secret) {
  try { const value = JSON.parse(String(secret)); return value && typeof value === 'object' && !Array.isArray(value) ? value : { value: secret }; }
  catch { return { value: secret }; }
}

module.exports = { CredentialContext, CredentialContextError, parseSecret, parseSecretObject };
