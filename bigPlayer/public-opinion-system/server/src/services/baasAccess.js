const https = require('node:https');
const tls = require('node:tls');
const BAAS_BASE_URL = 'https://chat.q1.com/baas';
const BAAS_APP_KEY = 'pk_2baf095458a842a080b8faa613ce1855';
const ROLES = new Set(['admin', 'analyst', 'reviewer', 'viewer']);

// Verify the identity endpoint even if a legacy connector disables global TLS checks.
function verifiedIdentityFetch(url, options) {
  const ca = typeof tls.getCACertificates === 'function'
    ? [...tls.getCACertificates('default'), ...tls.getCACertificates('system')]
    : tls.rootCertificates;
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: options.headers, signal: options.signal, rejectUnauthorized: true, ca }, response => {
      const chunks = []; let size = 0;
      response.on('data', chunk => { size += chunk.length; if (size > 65536) request.destroy(new Error('Identity response too large')); else chunks.push(chunk); });
      response.on('error', reject);
      response.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: response.statusCode })));
    });
    request.on('error', reject);
  });
}

function accessError(code, status, message) { return Object.assign(new Error(message), { code, status }); }
function permissionsFor(roles) {
  const admin = roles.includes('admin');
  return { read: roles.some(role => ROLES.has(role)), review: admin || roles.includes('reviewer'), manage: admin };
}

function requiredPermission(method, pathname) {
  const path = pathname.replace(/^\/api\/public-opinion/, '');
  if (method === 'GET' && path === '/auth/session') return 'read';
  if (method === 'GET' && path === '/sources') return 'read'; // Overview refresh frequency uses source summaries.
  // Configuration, credentials and login challenges are never exposed to read-only roles.
  if (/^\/(?:sources|accounts|credentials|keyword-rules|oauth|sync-runs|collection-runs)(?:\/|$)/.test(path)) return 'manage';
  if (method === 'GET' && /^(?:\/(?:overview|overview-trend|games|communities|analysis\/progress)|\/(?:contents|quality-contents|alerts)(?:\/[^/]+)?)$/.test(path)) return 'read';
  if (method === 'PATCH' && /^\/(?:quality-contents|alerts)\/[^/]+$/.test(path)) return 'review';
  if (method === 'POST' && path === '/contents/batch-handle') return 'review';
  if (method === 'POST' && /^\/contents\/[^/]+\/translation$/.test(path)) return 'read';
  return 'manage';
}

function publicSourceSummary(source) {
  const { id, display_name, source_name, platform, enabled, frequency_seconds } = source;
  return { id, display_name, source_name, platform, enabled, frequency_seconds };
}

class BaasAccess {
  constructor({ env = process.env, fetchImpl = verifiedIdentityFetch } = {}) {
    this.enabled = env.PUBLIC_OPINION_BAAS_ENABLED === 'true';
    this.fetch = fetchImpl;
  }
  publicConfig() {
    return { enabled: this.enabled, appKey: BAAS_APP_KEY, baseUrl: BAAS_BASE_URL, sdkUrl: `${BAAS_BASE_URL}/glacier-baas-sdk.js` };
  }
  async authenticate(req) {
    const authorization = req.headers.authorization;
    if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/.test(authorization) || authorization.length > 8192) {
      throw accessError('BAAS_LOGIN_REQUIRED', 401, '请先登录冰川账号');
    }
    let response;
    try {
      response = await this.fetch(`${BAAS_BASE_URL}/v1/auth/me`, {
        headers: { 'X-App-Key': BAAS_APP_KEY, Authorization: authorization },
        redirect: 'error', signal: AbortSignal.timeout(5000)
      });
    } catch {
      throw accessError('BAAS_UNAVAILABLE', 503, '冰川身份服务暂不可用，请稍后重试');
    }
    if (response.status === 401 || response.status === 403) throw accessError('BAAS_LOGIN_REQUIRED', 401, '登录已失效或不属于本应用，请重新登录');
    if (!response.ok) throw accessError('BAAS_UNAVAILABLE', 503, '冰川身份服务暂不可用，请稍后重试');
    let me;
    try { me = await response.json(); } catch { throw accessError('BAAS_INVALID_IDENTITY', 503, '冰川身份服务返回异常'); }
    if (!me || typeof me.end_user_id !== 'string' || !me.end_user_id || me.is_anonymous !== false) {
      throw accessError('BAAS_REALNAME_REQUIRED', 403, '仅实名冰川用户可以访问舆情系统');
    }
    // Roles come only from the fixed application's /me response, never client headers or claims.
    const roles = [...new Set((Array.isArray(me.roles) ? me.roles : []).filter(role => ROLES.has(role)))];
    if (me.role === 'owner' && !roles.includes('admin')) roles.push('admin');
    const permissions = permissionsFor(roles);
    if (!permissions.read) throw accessError('BAAS_ROLE_REQUIRED', 403, '尚未分配舆情系统角色，请联系应用管理员');
    return Object.freeze({ id: me.end_user_id, externalId: typeof me.external_id === 'string' ? me.external_id : null, displayName: String(me.display_name || ''), roles, permissions });
  }
  async authorize(req, pathname) {
    const identity = await this.authenticate(req);
    if (!identity.permissions[requiredPermission(req.method, pathname)]) throw accessError('BAAS_FORBIDDEN', 403, '当前角色没有此操作权限');
    return identity;
  }
}

module.exports = { BaasAccess, permissionsFor, requiredPermission, publicSourceSummary, BAAS_APP_KEY, BAAS_BASE_URL };
