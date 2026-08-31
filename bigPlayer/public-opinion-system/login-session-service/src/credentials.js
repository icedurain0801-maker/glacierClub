'use strict';

const { ServiceError } = require('./errors');

function createCredentialResolver(options = {}) {
  const baseUrl = options.baseUrl || options.PUBLIC_OPINION_SERVER_URL || options.LOGIN_SESSION_SERVER_URL;
  const internalToken = options.internalToken || options.LOGIN_SESSION_INTERNAL_TOKEN;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const timeoutMs = Number(options.timeoutMs || options.LOGIN_SESSION_REQUEST_TIMEOUT_MS || 5000);
  if (!baseUrl || !internalToken || typeof fetchImpl !== 'function') return null;
  return async ({ credentialRef, sourceId, accountId, platform }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${String(baseUrl).replace(/\/$/, '')}/internal/v1/credentials/resolve`, {
        method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${internalToken}` },
        body: JSON.stringify({ credentialRef, sourceId, accountId, platform, credentialType: 'account_password' }), signal: controller.signal
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new ServiceError(body.error?.code || 'CREDENTIAL_RESOLVE_FAILED', 'Credential resolution failed', response.status);
      return body.data;
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(error.name === 'AbortError' ? 'CREDENTIAL_RESOLVE_TIMEOUT' : 'CREDENTIAL_RESOLVE_UNAVAILABLE', 'Credential resolution failed', error.name === 'AbortError' ? 504 : 503);
    } finally { clearTimeout(timer); }
  };
}

module.exports = { createCredentialResolver };
