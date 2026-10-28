const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const https = require('node:https');
const tls = require('node:tls');
const cipher = require('../integrations/credentialCipher');
// Fixed application's public key; the worker runtime does not ship HTTP SSO middleware.
const BAAS_APP_KEY = 'pk_2baf095458a842a080b8faa613ce1855';
const AAD = 'public-opinion:baas-dingtalk:authorization:v1';
function failure(code, status = 503) { return Object.assign(new Error(code), { code, status }); }
function expiration(token) {
  try { const exp = JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).exp; return Number.isFinite(exp) ? exp * 1000 : 0; } catch { return 0; }
}
function request(token, method, endpoint, data) {
  if (!/^v1\/(?:auth\/me|dingtalk\/robots(?:\/[a-zA-Z0-9_-]{1,64})?|dingtalk\/robot\/send)$/.test(endpoint)) throw failure('BAAS_DINGTALK_INVALID_ENDPOINT', 400);
  const body = data === undefined ? null : JSON.stringify(data);
  const ca = typeof tls.getCACertificates === 'function' ? [...tls.getCACertificates('default'), ...tls.getCACertificates('system')] : tls.rootCertificates;
  return new Promise((resolve, reject) => {
    const req = https.request(new URL(endpoint, 'https://chat.q1.com/baas/'), { method, ca, rejectUnauthorized: true, headers: { 'X-App-Key': BAAS_APP_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}) } }, res => {
      const chunks = []; let size = 0;
      res.on('data', value => { size += value.length; if (size > 1048576) req.destroy(failure('BAAS_DINGTALK_RESPONSE_TOO_LARGE')); else chunks.push(value); });
      res.on('error', () => reject(failure('BAAS_DINGTALK_NETWORK_ERROR')));
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(failure(`BAAS_DINGTALK_HTTP_${res.statusCode}`));
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch { reject(failure('BAAS_DINGTALK_INVALID_RESPONSE')); }
      });
    });
    req.setTimeout(15000, () => req.destroy(failure('BAAS_DINGTALK_TIMEOUT')));
    req.on('error', error => reject(error.code?.startsWith('BAAS_DINGTALK_') ? error : failure('BAAS_DINGTALK_NETWORK_ERROR')));
    if (body) req.write(body); req.end();
  });
}
class BaasDingTalk {
  constructor({ env = process.env, repo, requestImpl = request, directory } = {}) {
    this.env = env; this.repo = repo; this.request = requestImpl;
    this.directory = directory || path.join(env.ProgramData || 'C:/ProgramData', 'PublicOpinion', 'baas-dingtalk');
    this.file = path.join(this.directory, 'config.json'); this.busy = false;
  }
  async read() { try { return JSON.parse(await fs.readFile(this.file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return { routes: {} }; throw failure('BAAS_DINGTALK_STORAGE_ERROR'); } }
  async change(fn) {
    if (this.busy) throw failure('BAAS_DINGTALK_BUSY', 409); this.busy = true;
    try { const current = await this.read(); const next = await fn(current); await fs.mkdir(this.directory, { recursive: true }); const temp = `${this.file}.${crypto.randomUUID()}.tmp`; try { await fs.writeFile(temp, JSON.stringify(next), { mode: 0o600 }); await fs.rename(temp, this.file); } finally { await fs.unlink(temp).catch(() => {}); } return next; } finally { this.busy = false; }
  }
  token(value) {
    if (!value.tokenCipher || !value.expiresAt || Date.parse(value.expiresAt) <= Date.now()) throw failure('BAAS_DINGTALK_AUTH_EXPIRED', 409);
    return cipher.decrypt(value.tokenCipher, this.env, { aad: AAD });
  }
  async status() { const c = await this.read(); let lastRun = null; try { lastRun = JSON.parse(await fs.readFile(path.join(this.directory, 'last-run.json'), 'utf8')); } catch {} return { provider: 'baas', authorized: Boolean(c.tokenCipher && Date.parse(c.expiresAt) > Date.now()), expiresAt: c.expiresAt || null, authorizedAt: c.authorizedAt || null, authorizedBy: c.authorizedBy || null, lastRun }; }
  async authorize(token, identity) {
    const me = await this.request(token, 'GET', 'v1/auth/me');
    if (me.is_anonymous !== false || !me.roles?.includes('admin') || me.end_user_id !== identity.id) throw failure('BAAS_FORBIDDEN', 403);
    const expires = expiration(token); if (expires <= Date.now()) throw failure('BAAS_DINGTALK_AUTH_EXPIRED', 409);
    await this.change(c => ({ ...c, tokenCipher: cipher.encrypt(token, this.env, { aad: AAD }), expiresAt: new Date(expires).toISOString(), authorizedAt: new Date().toISOString(), authorizedBy: identity.displayName }));
    return this.status();
  }
  async renewExistingAuthorization(token, identity) {
    // Only refresh an already delegated service session from the same verified admin.
    // A different admin logging in must never take over the service identity.
    if (!identity?.roles?.includes('admin') || identity.pendingRoleMapping) return false;
    const config = await this.read();
    if (!config.tokenCipher) return false;
    const previous = cipher.decrypt(config.tokenCipher, this.env, { aad: AAD });
    if (previous === token) return false;
    let subject;
    try { subject = JSON.parse(Buffer.from(previous.split('.')[1], 'base64url')).sub; } catch { return false; }
    if (!subject || subject !== identity.id) return false;
    await this.authorize(token, identity);
    return true;
  }
  async robots(token) {
    const result = await this.request(token, 'GET', 'v1/dingtalk/robots');
    if (!Array.isArray(result.robots)) throw failure('BAAS_DINGTALK_INVALID_RESPONSE');
    return result.robots.map(r => ({ alias: r.alias, remark: r.remark || '' }));
  }
  async bind(token, body) {
    if (!body || Object.keys(body).some(k => !['alias', 'webhookUrl', 'secret', 'remark'].includes(k)) || !/^[a-zA-Z0-9_-]{1,64}$/.test(body.alias || '')) throw failure('INVALID_INPUT', 400);
    let url; try { url = new URL(body.webhookUrl); } catch { throw failure('INVALID_INPUT', 400); }
    if (url.origin !== 'https://oapi.dingtalk.com' || url.pathname !== '/robot/send' || url.username || url.password || !url.searchParams.get('access_token') || !/^SEC[\x21-\x7e]{8,256}$/.test(body.secret || '') || typeof body.remark !== 'string' || body.remark.length > 100) throw failure('INVALID_INPUT', 400);
    await this.request(token, 'PUT', `v1/dingtalk/robots/${body.alias}`, { webhookUrl: body.webhookUrl, secret: body.secret, remark: body.remark });
    return this.robots(token);
  }
  async accounts(sourceId) { return this.repo.query('SELECT id,account_name FROM po_accounts WHERE source_id=? ORDER BY id', [sourceId]); }
  async community(sourceId) {
    const [source] = await this.repo.query('SELECT community_id,game_id,platform FROM po_sources WHERE id=?', [sourceId]);
    if (!source?.community_id || !source.game_id) throw failure('INVALID_INPUT', 400);
    return { communityId: source.community_id, gameId: source.game_id, platform: source.platform, key: `${source.game_id}:${source.community_id}` };
  }
  async routes(sourceId, token) {
    const scope = await this.community(sourceId); const c = await this.read();
    const inheritedRoute = c.communityRoutes?.[scope.key] || null;
    return { communityId: scope.communityId, sourceSpecific: scope.platform === 'facebook', mode: c.sourceRoutes?.[sourceId] ? 'custom' : 'inherit', inheritedRoute, route: c.sourceRoutes?.[sourceId] || inheritedRoute, robots: await this.robots(token), authorization: await this.status() };
  }
  async saveRoute(sourceId, token, body) {
    if (!body || Object.keys(body).some(k => !['robot', 'enabled', 'pushTypes', 'mode'].includes(k)) || typeof body.enabled !== 'boolean' || typeof body.robot !== 'string' || (body.mode !== undefined && !['inherit','custom'].includes(body.mode))) throw failure('INVALID_INPUT', 400);
    const pushTypes = body.pushTypes === undefined ? ['urgent'] : body.pushTypes;
    if (!Array.isArray(pushTypes) || pushTypes.some(t => !['urgent', 'attention', 'quality'].includes(t)) || new Set(pushTypes).size !== pushTypes.length || (body.enabled && !pushTypes.length)) throw failure('INVALID_INPUT', 400);
    const scope = await this.community(sourceId);
    if (body.mode !== undefined && scope.platform !== 'facebook') throw failure('INVALID_INPUT', 400);
    if (body.mode === 'inherit') {
      await this.change(c => { const sourceRoutes = { ...c.sourceRoutes }; delete sourceRoutes[sourceId]; return { ...c, sourceRoutes }; });
      return { saved: true };
    }
    if (body.enabled) {
      this.token(await this.read());
      const robots = await this.robots(token); if (!robots.some(r => r.alias === body.robot)) throw failure('BAAS_DINGTALK_ROBOT_REQUIRED', 400);
    }
    if (scope.platform === 'facebook') {
      await this.change(c => {
        const prior = c.sourceRoutes?.[sourceId], stamp = new Date().toISOString();
        const active = prior?.enabled && prior.robot === body.robot;
        const pushTypeEnabledAt = Object.fromEntries(pushTypes.map(type => [type, body.enabled ? (active && (prior.pushTypes || ['urgent']).includes(type) ? prior.pushTypeEnabledAt?.[type] || prior.enabledAt : stamp) : null]));
        return { ...c, sourceRoutes: { ...c.sourceRoutes, [sourceId]: { sourceId, gameId: scope.gameId, communityId: scope.communityId, robot: body.robot, enabled: body.enabled, pushTypes, pushTypeEnabledAt, enabledAt: body.enabled ? active ? prior.enabledAt : stamp : null } } };
      }); return { saved: true };
    }
    const sources = await this.repo.query('SELECT id FROM po_sources WHERE game_id=? AND community_id=?', [scope.gameId, scope.communityId]);
    const sourceIds = new Set(sources.map(s => s.id));
    await this.change(c => {
      const prior = c.communityRoutes?.[scope.key];
      const active = prior?.enabled && prior.robot === body.robot;
      const stamp = new Date().toISOString();
      const pushTypeEnabledAt = Object.fromEntries(pushTypes.map(type => [type, body.enabled ? (active && (prior.pushTypes || ['urgent']).includes(type) ? (prior.pushTypeEnabledAt?.[type] || prior.enabledAt) : stamp) : null]));
      const routes = Object.fromEntries(Object.entries(c.routes || {}).filter(([, route]) => !sourceIds.has(route.sourceId)));
      return { ...c, routes, communityRoutes: { ...c.communityRoutes, [scope.key]: { communityId: scope.communityId, gameId: scope.gameId, robot: body.robot, enabled: body.enabled, pushTypes, pushTypeEnabledAt, enabledAt: body.enabled ? (prior?.enabled && prior.robot === body.robot ? prior.enabledAt : new Date().toISOString()) : null } } };
    }); return { saved: true };
  }
}
module.exports = { BaasDingTalk, request, expiration };
