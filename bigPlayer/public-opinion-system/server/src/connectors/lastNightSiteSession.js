'use strict';

const crypto = require('node:crypto');
const { ConnectorError } = require('./baseConnector');
const SOURCE_ID = '081a16d2-5545-4afd-9c65-e04777e4540b';

// No env switch or production transport: this candidate is injected only by
// isolated fixtures. Existing direct api_token and domestic flows are unchanged.
function createIsolatedLastNightSiteSession({ isolated, transport } = {}) {
  if (isolated !== true || typeof transport !== 'function' || transport === globalThis.fetch) {
    throw new ConnectorError('PRODUCTION_EXECUTION_DISABLED', 'site session requires an isolated transport');
  }
  return createSiteSession(transport);
}

function createApprovedLastNightSiteSession({ authorizationMode, transport } = {}) {
  if (authorizationMode !== 'lastnight-bounded-current-runtime' || typeof transport !== 'function') {
    throw new ConnectorError('PRODUCTION_EXECUTION_DISABLED', 'explicit Last Night bounded authorization required');
  }
  return createSiteSession(transport);
}

function createSiteSession(transport) {
  const sessions = new Map();
  const reject = (code, details = {}) => { throw new ConnectorError(code, 'Last Night site authorization failed', details); };
  function context(source) {
    let config = source?.config || {};
    if (typeof config === 'string') { try { config = JSON.parse(config); } catch { reject('CONNECTOR_NOT_CONFIGURED'); } }
    let base;
    try { base = new URL(config.baseUrl); } catch { reject('CONNECTOR_NOT_CONFIGURED'); }
    const languageId = base.searchParams.get('languageId');
    if (source?.id !== SOURCE_ID || base.origin !== 'https://club-en.q1.com' || base.username || base.password || base.hash
      || !/^[1-9]\d*$/.test(languageId || '') || base.searchParams.get('gameId') !== '2177'
      || base.searchParams.get('gameVersion') !== '2177-US-ZS' || String(config.boardId) !== '100017') reject('LAST_NIGHT_SITE_SCOPE_MISMATCH');
    return { base, languageId };
  }
  function key(source, token) {
    const { base, languageId } = context(source);
    return JSON.stringify([source.id, source.account?.id || source.account_id || '', base.origin,
      base.searchParams.get('gameId'), base.searchParams.get('gameVersion'), languageId,
      crypto.createHash('sha256').update(token).digest('hex')]);
  }
  async function exchange(source, token, signal) {
    const { base, languageId } = context(source);
    if (signal?.aborted) reject('COLLECTION_CANCELLED');
    if (typeof token !== 'string' || !token.trim()) reject('AUTHORIZATION_MISSING');
    const url = new URL('/api/club/v1/login/token', base);
    // Public web runtime: GET data is query; null sdkToken becomes empty.
    for (const [name, value] of Object.entries({ token, sdkToken: '', gameId: '2177', gameVersion: '2177-US-ZS', languageId })) url.searchParams.set(name, value);
    const safeUrl = new URL(url); safeUrl.searchParams.set('token', '[REDACTED]'); safeUrl.searchParams.set('sdkToken', '[REDACTED]');
    let response;
    try {
      if (typeof source.__recordHttpRequest === 'function') await source.__recordHttpRequest({ url: safeUrl.toString(), capability: 'site_authorization', page: 1 });
      const timeout = AbortSignal.timeout(10000);
      response = await transport(url, { method: 'GET', redirect: 'manual',
        headers: { accept: 'application/json', authorization: token },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    } catch { reject(signal?.aborted ? 'COLLECTION_CANCELLED' : 'Q1_SITE_EXCHANGE_FAILED'); }
    if (response.url) {
      let final;
      try { final = new URL(response.url); } catch { reject('H5_REDIRECT_OUTSIDE_ALLOWED_HOSTS'); }
      if (final.origin !== base.origin || final.username || final.password || final.hash) reject('H5_REDIRECT_OUTSIDE_ALLOWED_HOSTS');
    }
    if (!response.ok) reject(response.status === 401 ? 'UNAUTHORIZED' : response.status === 403 ? 'PERMISSION_DENIED' : 'Q1_SITE_EXCHANGE_FAILED', { httpStatus: response.status });
    let payload;
    try { payload = await response.json(); } catch { reject('MALFORMED_RESPONSE'); }
    if (payload?.code === 1) reject('Q1_TOURIST_LOGIN', { providerCode: 1 });
    if (payload?.code !== 0) reject('Q1_SITE_AUTH_REJECTED');
    if (typeof payload.data?.token !== 'string' || !payload.data.token.trim()) reject('MALFORMED_RESPONSE');
    return payload.data.token;
  }
  return Object.freeze({
    async tokenFor(source, token, signal) {
      if (signal?.aborted) reject('COLLECTION_CANCELLED');
      if (typeof token !== 'string' || !token.trim()) reject('AUTHORIZATION_MISSING');
      const id = key(source, token);
      if (!sessions.has(id)) {
        const pending = exchange(source, token, signal);
        sessions.set(id, pending);
        pending.catch(() => { if (sessions.get(id) === pending) sessions.delete(id); });
      }
      return sessions.get(id);
    },
    invalidate(source, token) { sessions.delete(key(source, token)); },
    clear() { sessions.clear(); }
  });
}

module.exports = { createIsolatedLastNightSiteSession, createApprovedLastNightSiteSession };
