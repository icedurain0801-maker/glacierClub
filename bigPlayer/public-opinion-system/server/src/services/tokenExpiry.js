const cipher = require('../integrations/credentialCipher');
const { parseSecret } = require('./credentialContext');

function tokenClaimExpiry(secret) {
  try {
    const parts = String(parseSecret(secret).apiToken || '').split('.');
    if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
    const exp = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).exp;
    if (typeof exp !== 'number' || !Number.isSafeInteger(exp) || exp <= 0) return null;
    return new Date(exp * 1000).toISOString();
  } catch { return null; }
}

// Display metadata only: unverified JWT claims never grant authorization.
async function tokenExpiry(repo, account, summaries, { credentialCipher = cipher, env = process.env } = {}) {
  const summary = summaries.find(item => ['api_token', 'oauth_access_refresh'].includes(item.credential_type) && (item.has_secret_cipher || item.has_secret_ref));
  if (!summary) return null;
  const unknown = { expiresAt: null, basis: 'unknown' };
  // Repository uses MySQL timezone Z and dateStrings; database timestamps are UTC.
  if (typeof summary.expire_at === 'string' && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d+)?$/.test(summary.expire_at)) {
    const utc = new Date(summary.expire_at.replace(' ', 'T') + 'Z');
    if (Number.isFinite(utc.getTime())) return { expiresAt: utc.toISOString(), basis: 'platform' };
  }
  if (summary.expire_at instanceof Date && Number.isFinite(summary.expire_at.getTime())) return { expiresAt: summary.expire_at.toISOString(), basis: 'platform' };
  if (typeof summary.expire_at === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(summary.expire_at) && Number.isFinite(Date.parse(summary.expire_at))) return { expiresAt: new Date(summary.expire_at).toISOString(), basis: 'platform' };
  try {
    const credential = await repo.getCredentialByAccount(account.id, summary.credential_type, { includeSecret: true });
    if (!credential?.secret_cipher) return unknown;
    const envelope = typeof credential.secret_cipher === 'string' ? JSON.parse(credential.secret_cipher) : credential.secret_cipher;
    const options = envelope?.v === 2 && envelope.aad ? { aad: `${account.id}:${summary.credential_type}:${account.platform}` } : {};
    const expiresAt = tokenClaimExpiry(credentialCipher.decrypt(credential.secret_cipher, env, options));
    return expiresAt ? { expiresAt, basis: 'token_claim' } : unknown;
  } catch { return unknown; }
}
module.exports = { tokenExpiry, tokenClaimExpiry };
