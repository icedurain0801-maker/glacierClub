'use strict';

class LoginSessionClientError extends Error {
  constructor(code, message, status, details) {
    super(message);
    this.name = 'LoginSessionClientError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

class LoginSessionClient {
  constructor(env = process.env, { fetchImpl = globalThis.fetch } = {}) {
    this.baseUrl = String(env.LOGIN_SESSION_SERVICE_URL || '').replace(/\/$/, '');
    this.internalToken = env.LOGIN_SESSION_INTERNAL_TOKEN || '';
    this.timeoutMs = Number(env.LOGIN_SESSION_REQUEST_TIMEOUT_MS || 60000);
    this.fetchImpl = fetchImpl;
  }

  configured() { return Boolean(this.baseUrl && this.internalToken && this.fetchImpl); }

  async request(method, path, payload) {
    if (!this.configured()) {
      throw new LoginSessionClientError('LOGIN_SESSION_SERVICE_NOT_CONFIGURED', 'Login session service client is not configured', 503);
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers = { accept: 'application/json', authorization: `Bearer ${this.internalToken}` };
    const options = { method, headers, signal: controller.signal };
    let url = `${this.baseUrl}${path}`;
    if (method === 'GET') {
      const query = new URLSearchParams(Object.entries(payload || {}).filter(([, value]) => value !== undefined && value !== null));
      if (query.size) url += `?${query}`;
    } else {
      headers['content-type'] = 'application/json';
      options.body = JSON.stringify(payload || {});
    }
    try {
      const response = await this.fetchImpl(url, options);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = body.error || {};
        throw new LoginSessionClientError(error.code || 'LOGIN_SESSION_SERVICE_ERROR', error.message || 'Login session service request failed', response.status, error.details);
      }
      return body.data;
    } catch (error) {
      if (error instanceof LoginSessionClientError) throw error;
      if (error.name === 'AbortError') throw new LoginSessionClientError('LOGIN_SESSION_SERVICE_TIMEOUT', 'Login session service request timed out', 504);
      throw new LoginSessionClientError('LOGIN_SESSION_SERVICE_UNAVAILABLE', 'Login session service is unavailable', 503);
    } finally {
      clearTimeout(timeout);
    }
  }

  bindAccount(payload) { return this.request('PUT', '/internal/v1/accounts/binding', payload); }
  startLogin(payload) { return this.request('POST', '/internal/v1/login/start', payload); }
  getStatus(payload) { return this.request('GET', '/internal/v1/login/status', payload); }
  getChallenge(payload) { return this.request('GET', '/internal/v1/challenges/current', payload); }
  submitChallenge(payload) { return this.request('POST', '/internal/v1/challenges/submit', payload); }
  pollChallenge(payload) { return this.request('POST', '/internal/v1/challenges/poll', payload); }
  getSessionReference(payload) { return this.request('GET', '/internal/v1/sessions/reference', payload); }
  getSessionRef(payload) { return this.getSessionReference(payload); }
  claimAuthResult(payload) { return this.request('POST', '/internal/v1/sessions/result/claim', payload); }
  refreshSession(payload) { return this.startLogin({ ...payload, scenario: 'relogin' }); }
  relogin(payload) { return this.refreshSession(payload); }
  revokeSession(payload) { return this.request('POST', '/internal/v1/sessions/revoke', payload); }
}

module.exports = { LoginSessionClient, LoginSessionClientError };
