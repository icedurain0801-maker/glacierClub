'use strict';
const { ConnectorError } = require('./baseConnector');
const fail = code => { throw new ConnectorError(code, 'Q1 site language could not be resolved'); };
// Match the official H5 startup: languageId resolves through configuration center
// and overrides the page lang. Never substitute the machine/browser language.
function createQ1LanguageResolver(fetchImpl, { now = Date.now, ttlMs = 600000, timeoutMs = 10000 } = {}) {
  let cached = null;
  return async function resolve(base, fallback, signal) {
    if (base.hostname !== 'club-en.q1.com' || !base.searchParams.has('languageId')) return fallback;
    if (signal?.aborted) fail('COLLECTION_CANCELLED');
    if (base.origin !== 'https://club-en.q1.com' || base.username || base.password || base.hash) fail('H5_URL_OUTSIDE_ALLOWED_HOSTS');
    const ids = base.searchParams.getAll('languageId');
    if (ids.length !== 1 || !/^[1-9]\d*$/.test(ids[0])) fail('Q1_LANGUAGE_ID_INVALID');
    if (!cached || cached.expires <= now()) {
      const timeout = AbortSignal.timeout(timeoutMs);
      const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
      try {
        const url = new URL('/api/club/v1/setting/language', base.origin);
        const response = await fetchImpl(url, { redirect: 'manual', headers: { accept: 'application/json' }, signal: requestSignal });
        if (response.url && new URL(response.url).origin !== base.origin) fail('H5_REDIRECT_OUTSIDE_ALLOWED_HOSTS');
        if (!response.ok) fail('Q1_LANGUAGE_CONFIG_UNAVAILABLE');
        const payload = await response.json();
        if (payload?.code !== 0 || !Array.isArray(payload.data)) fail('Q1_LANGUAGE_CONFIG_INVALID');
        const languages = new Map();
        for (const row of payload.data) {
          const id = String(row.languageID), code = String(row.code || '').trim();
          if (languages.has(id)) fail('Q1_LANGUAGE_CONFIG_INVALID');
          languages.set(id, code);
        }
        if (requestSignal.aborted) fail(signal?.aborted ? 'COLLECTION_CANCELLED' : 'Q1_LANGUAGE_CONFIG_UNAVAILABLE');
        cached = { languages, expires: now() + ttlMs };
      } catch (error) {
        if (signal?.aborted) fail('COLLECTION_CANCELLED');
        if (error instanceof ConnectorError) throw error;
        fail('Q1_LANGUAGE_CONFIG_UNAVAILABLE');
      }
    }
    const code = cached.languages.get(ids[0]);
    if (!code || !/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(code)) fail('Q1_LANGUAGE_NOT_SUPPORTED');
    return code;
  };
}
module.exports = { createQ1LanguageResolver };
