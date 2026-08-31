'use strict';

class CommunityProviderError extends Error {
  constructor(code, message, status = 503, details) {
    super(message);
    this.name = 'CommunityProviderError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function normalizeCommunity(item, index) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new CommunityProviderError('COMMUNITY_PROVIDER_INVALID_RESPONSE', `community at index ${index} must be an object`, 502);
  const id = String(item.id || '').trim();
  const gameId = String(item.gameId || '').trim();
  const name = String(item.name || '').trim();
  const status = String(item.status || '').trim();
  const regionCode = item.regionCode == null ? null : String(item.regionCode).trim();
  const sortOrder = item.sortOrder == null ? 0 : Number(item.sortOrder);
  if (!id || id.length > 36) throw new CommunityProviderError('COMMUNITY_PROVIDER_INVALID_RESPONSE', `community at index ${index} has an invalid id`, 502);
  if (!gameId || gameId.length > 36) throw new CommunityProviderError('COMMUNITY_PROVIDER_INVALID_RESPONSE', `community at index ${index} has an invalid gameId`, 502);
  if (!name || name.length > 160) throw new CommunityProviderError('COMMUNITY_PROVIDER_INVALID_RESPONSE', `community at index ${index} has an invalid name`, 502);
  if (!['enabled', 'disabled'].includes(status)) throw new CommunityProviderError('COMMUNITY_PROVIDER_INVALID_RESPONSE', `community at index ${index} has an invalid status`, 502);
  if (!Number.isSafeInteger(sortOrder)) throw new CommunityProviderError('COMMUNITY_PROVIDER_INVALID_RESPONSE', `community at index ${index} has an invalid sortOrder`, 502);
  if (regionCode != null && !regionCode) throw new CommunityProviderError('COMMUNITY_PROVIDER_INVALID_RESPONSE', `community at index ${index} has an invalid regionCode`, 502);
  return { id, gameId, name, status, sortOrder, regionCode };
}

class CommunityProvider {
  constructor(env = process.env, { fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
    this.url = String(env.COMMUNITY_PROVIDER_URL || '').trim();
    this.token = String(env.COMMUNITY_PROVIDER_TOKEN || '').trim();
    this.timeoutMs = Number(env.COMMUNITY_PROVIDER_TIMEOUT_MS || 5000);
    this.cacheTtlMs = Number(env.COMMUNITY_PROVIDER_CACHE_TTL_MS || 60000);
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.cache = null;
    this.cacheExpiresAt = 0;
    this.pending = null;
  }

  configured() {
    if (!this.url || !this.token || !this.fetchImpl) return false;
    try { return new URL(this.url).protocol === 'https:'; } catch { return false; }
  }

  async getCommunities({ force = false } = {}) {
    if (!this.configured()) throw new CommunityProviderError('COMMUNITY_PROVIDER_NOT_CONFIGURED', 'Community provider is not configured with a valid HTTPS URL and token', 503);
    if (!force && this.cache && this.now() < this.cacheExpiresAt) return this.cache;
    if (this.pending) return this.pending;
    this.pending = this.fetchCommunities();
    try {
      const items = await this.pending;
      this.cache = items;
      this.cacheExpiresAt = this.now() + Math.max(0, this.cacheTtlMs);
      return items;
    } finally {
      this.pending = null;
    }
  }

  async fetchCommunities() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1, this.timeoutMs));
    try {
      const response = await this.fetchImpl(this.url, {
        method: 'GET',
        headers: { accept: 'application/json', authorization: `Bearer ${this.token}` },
        redirect: 'error',
        signal: controller.signal
      });
      if (!response.ok) throw new CommunityProviderError('COMMUNITY_PROVIDER_ERROR', 'Community provider request failed', response.status >= 500 ? 503 : 502, { providerStatus: response.status });
      const body = await response.json().catch(() => { throw new CommunityProviderError('COMMUNITY_PROVIDER_INVALID_RESPONSE', 'Community provider returned invalid JSON', 502); });
      const raw = Array.isArray(body) ? body : body && Array.isArray(body.data) ? body.data : null;
      if (!raw) throw new CommunityProviderError('COMMUNITY_PROVIDER_INVALID_RESPONSE', 'Community provider response must be an array', 502);
      const items = raw.map(normalizeCommunity);
      const ids = new Set();
      for (const item of items) {
        if (ids.has(item.id)) throw new CommunityProviderError('COMMUNITY_PROVIDER_INVALID_RESPONSE', `Community provider returned duplicate id: ${item.id}`, 502);
        ids.add(item.id);
      }
      return items;
    } catch (error) {
      if (error instanceof CommunityProviderError) throw error;
      if (error.name === 'AbortError') throw new CommunityProviderError('COMMUNITY_PROVIDER_TIMEOUT', 'Community provider request timed out', 504);
      throw new CommunityProviderError('COMMUNITY_PROVIDER_UNAVAILABLE', 'Community provider is unavailable', 503);
    } finally {
      clearTimeout(timeout);
    }
  }
}

class CommunityDirectory {
  constructor({ provider, repo }) {
    this.provider = provider;
    this.repo = repo;
    this.syncedItems = null;
    this.pendingSync = null;
  }

  async refresh() {
    const items = await this.provider.getCommunities();
    if (items === this.syncedItems) return items;
    if (!this.pendingSync) this.pendingSync = this.repo.syncCommunityMirror(items).then(() => { this.syncedItems = items; }).finally(() => { this.pendingSync = null; });
    await this.pendingSync;
    return items;
  }

  async list(filters) {
    try { await this.refresh(); }
    catch (error) {
      console.error(error.code || error.name || 'COMMUNITY_PROVIDER_ERROR', error.message);
    }
    return this.repo.listCommunities(filters);
  }

  async requireEnabled({ communityId, gameId, regionCode }) {
    await this.refresh();
    const community = await this.repo.getCommunityForGame(communityId, gameId, { enabledOnly: true });
    if (!community || (regionCode && community.region_code !== regionCode)) {
      const error = new Error('社区不存在、与区域或游戏不匹配，或已停用');
      error.code = 'COMMUNITY_NOT_FOUND';
      error.status = 400;
      throw error;
    }
    return community;
  }
}

module.exports = { CommunityProvider, CommunityProviderError, CommunityDirectory, normalizeCommunity };
