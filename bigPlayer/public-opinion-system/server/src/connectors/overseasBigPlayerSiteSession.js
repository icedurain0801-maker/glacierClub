'use strict';
const crypto = require('node:crypto');
const { ConnectorError } = require('./baseConnector');
const ORIGIN = 'https://club-en.q1.com';
const fail = code => { throw new ConnectorError(code, 'Overseas BigPlayer site authorization failed'); };
function contextOf(source) {
  let config = source?.config;
  try { if (typeof config === 'string') config = JSON.parse(config); } catch { fail('Q1_SITE_CONTEXT_INVALID'); }
  const account = source?.account;
  const siteId = source?.siteId || source?.site_id;
  if (source?.platform !== 'bigplayer_h5' || source?.region_code !== 'overseas' || !source.id || !source.game_id || !source.community_id
    || !account?.id || account.source_id !== source.id || account.platform !== source.platform
    || (source.account_id && source.account_id !== account.id)
    || account.game_id !== source.game_id || account.community_id !== source.community_id
    || !/^[A-Za-z0-9._:-]{1,120}$/.test(siteId || '') || !/^[1-9]\d*$/.test(String(config?.boardId || ''))
    || !Number.isSafeInteger(Number(config.boardId))) fail('Q1_SITE_CONTEXT_INVALID');
  let base, snapshot;
  try { base = new URL(config.baseUrl); snapshot = new URL(source.siteUrl || source.site_url_snapshot); }
  catch { fail('Q1_SITE_CONTEXT_INVALID'); }
  if (base.toString() !== snapshot.toString()) fail('Q1_SITE_SNAPSHOT_MISMATCH');
  if (base.origin !== ORIGIN || base.username || base.password || base.hash) fail('H5_URL_OUTSIDE_ALLOWED_HOSTS');
  for (const key of ['env', 'gameId', 'gameVersion', 'languageId']) {
    if (base.searchParams.getAll(key).length !== 1 || !base.searchParams.get(key)?.trim()) fail('Q1_SITE_CONTEXT_INVALID');
  }
  if (!/^[1-9]\d*$/.test(base.searchParams.get('gameId')) || !/^[1-9]\d*$/.test(base.searchParams.get('languageId'))) fail('Q1_SITE_CONTEXT_INVALID');
  // api_token is a community credential. SDK login exchange must be explicit;
  // a second exchange of a valid community token can produce a tourist token.
  const tokenKind = config.overseasTokenKind || 'community';
  if (!['community', 'sdk'].includes(tokenKind)) fail('Q1_SITE_TOKEN_KIND_INVALID');
  return { base, siteId, boardId: String(config.boardId), tokenKind };
}
function createOverseasBigPlayerSiteSession({ transport, timeoutMs = 10000 } = {}) {
  if (typeof transport !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new TypeError('bounded transport required');
  const sessions = new Map();
  const keyOf = (source, token) => {
    const { base, siteId, boardId, tokenKind } = contextOf(source);
    if (typeof token !== 'string' || !token.trim() || /[\r\n]/.test(token)) fail('AUTHORIZATION_MISSING');
    return JSON.stringify([source.id, source.account.id, source.game_id, source.community_id, siteId, boardId,
      base.toString(), tokenKind, crypto.createHash('sha256').update(token).digest('hex')]);
  };
  async function authorizeCommunity(source, token, signal) {
    const { base, boardId } = contextOf(source);
    if (signal?.aborted) fail('COLLECTION_CANCELLED');
    const bearer = /^Bearer\s+/i.test(token.trim()) ? `Bearer ${token.trim().replace(/^Bearer\s+/i, '')}` : `Bearer ${token.trim()}`;
    const url = new URL('/api/club/v1/auth/user/context', ORIGIN);
    const timeout = AbortSignal.timeout(timeoutMs);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      await source.__recordHttpRequest?.({ url: url.toString(), capability: 'site_authorization', page: 1 });
      if (requestSignal.aborted) fail(signal?.aborted ? 'COLLECTION_CANCELLED' : 'Q1_SITE_EXCHANGE_TIMEOUT');
      const response = await transport(url, { method: 'GET', redirect: 'manual', headers: {
        accept: 'application/json', authorization: bearer, 'content-language': base.searchParams.get('lang') || 'en-US',
        'user-agent': 'PublicOpinionSystem/1.0'
      }, signal: requestSignal });
      if (response.url) {
        let final; try { final = new URL(response.url); } catch { fail('H5_REDIRECT_OUTSIDE_ALLOWED_HOSTS'); }
        if (final.origin !== ORIGIN || final.username || final.password || final.hash) fail('H5_REDIRECT_OUTSIDE_ALLOWED_HOSTS');
      }
      if (!response.ok) fail(response.status === 401 ? 'UNAUTHORIZED' : response.status === 403 ? 'PERMISSION_DENIED' : 'Q1_SITE_AUTH_REJECTED');
      let payload; try { payload = await response.json(); } catch { fail('MALFORMED_RESPONSE'); }
      if (requestSignal.aborted) fail(signal?.aborted ? 'COLLECTION_CANCELLED' : 'Q1_SITE_EXCHANGE_TIMEOUT');
      if (payload?.code === 1) fail('Q1_TOURIST_LOGIN');
      if (payload?.code !== 0) fail('Q1_SITE_AUTH_REJECTED');
      if (!Array.isArray(payload.data?.boards)) fail('MALFORMED_RESPONSE');
      if (!payload.data.boards.some(b => String(b?.id ?? b?.boardId ?? '') === boardId)) fail('BOARD_NOT_ACCESSIBLE');
      return bearer;
    } catch (error) {
      if (signal?.aborted) fail('COLLECTION_CANCELLED');
      if (timeout.aborted) fail('Q1_SITE_EXCHANGE_TIMEOUT');
      if (/^OVERSEAS_(DISPATCH|NETWORK_CONTRACT)_/.test(error?.code || '')) throw error;
      if (error instanceof ConnectorError) throw error;
      fail('Q1_SITE_AUTH_REJECTED');
    }
  }
  async function exchange(source, token, signal) {
    const { base } = contextOf(source);
    if (signal?.aborted) fail('COLLECTION_CANCELLED');
    const url = new URL('/api/club/v1/login/token', ORIGIN);
    for (const [name, value] of Object.entries({ token, sdkToken: '', gameId: base.searchParams.get('gameId'),
      gameVersion: base.searchParams.get('gameVersion'), languageId: base.searchParams.get('languageId') })) url.searchParams.set(name, value);
    const safeUrl = new URL(url); safeUrl.searchParams.set('token', '[REDACTED]'); safeUrl.searchParams.set('sdkToken', '[REDACTED]');
    const timeout = AbortSignal.timeout(timeoutMs);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      await source.__recordHttpRequest?.({ url: safeUrl.toString(), capability: 'site_authorization', page: 1 });
      if (requestSignal.aborted) fail(signal?.aborted ? 'COLLECTION_CANCELLED' : 'Q1_SITE_EXCHANGE_TIMEOUT');
      const response = await transport(url, { method: 'GET', redirect: 'manual',
        headers: { accept: 'application/json', authorization: token }, signal: requestSignal });
      if (response.url) {
        let final; try { final = new URL(response.url); } catch { fail('H5_REDIRECT_OUTSIDE_ALLOWED_HOSTS'); }
        if (final.origin !== ORIGIN || final.username || final.password || final.hash) fail('H5_REDIRECT_OUTSIDE_ALLOWED_HOSTS');
      }
      if (!response.ok) fail(response.status === 401 ? 'UNAUTHORIZED' : response.status === 403 ? 'PERMISSION_DENIED' : 'Q1_SITE_EXCHANGE_FAILED');
      let payload; try { payload = await response.json(); } catch { fail('MALFORMED_RESPONSE'); }
      if (requestSignal.aborted) fail(signal?.aborted ? 'COLLECTION_CANCELLED' : 'Q1_SITE_EXCHANGE_TIMEOUT');
      if (payload?.code === 1) fail('Q1_TOURIST_LOGIN');
      if (payload?.code !== 0) fail('Q1_SITE_AUTH_REJECTED');
      if (typeof payload.data?.token !== 'string' || !payload.data.token.trim()) fail('MALFORMED_RESPONSE');
      return payload.data.token;
    } catch (error) {
      if (signal?.aborted) fail('COLLECTION_CANCELLED');
      if (timeout.aborted) fail('Q1_SITE_EXCHANGE_TIMEOUT');
      if (/^OVERSEAS_(DISPATCH|NETWORK_CONTRACT)_/.test(error?.code || '')) throw error;
      if (error instanceof ConnectorError) throw error;
      fail('Q1_SITE_EXCHANGE_FAILED');
    }
  }
  return Object.freeze({
    async tokenFor(source, token, signal) {
      if (signal?.aborted) fail('COLLECTION_CANCELLED');
      const key = keyOf(source, token);
      if (!sessions.has(key)) {
        const pending = contextOf(source).tokenKind === 'sdk' ? exchange(source, token, signal) : authorizeCommunity(source, token, signal);
        sessions.set(key, pending);
        pending.catch(() => { if (sessions.get(key) === pending) sessions.delete(key); });
      }
      const value = await sessions.get(key);
      if (signal?.aborted) fail('COLLECTION_CANCELLED');
      return value;
    },
    invalidate(source, token) { sessions.delete(keyOf(source, token)); },
    clear() { sessions.clear(); }
  });
}
module.exports = { createOverseasBigPlayerSiteSession, contextOf };
