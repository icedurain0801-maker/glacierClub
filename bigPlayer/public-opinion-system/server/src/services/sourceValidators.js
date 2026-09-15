const SOCIAL_PLATFORMS = new Set(['douyin', 'xiaohongshu']);
const SOURCE_PLATFORMS = new Set(['bigplayer_h5', 'douyin', 'taptap', 'bilibili', 'xiaohongshu', 'weibo', 'tieba', 'discord', 'facebook']);
const FACEBOOK_PAGE_HOSTS = new Set(['facebook.com', 'www.facebook.com']);
const FACEBOOK_TRACKING_PARAMS = new Set(['fbclid', 'ref', 'refsrc', 'mibextid']);
const FACEBOOK_RESERVED_PATHS = new Set([
  'business', 'events', 'gaming', 'groups', 'help', 'login', 'marketplace',
  'pages', 'people', 'photo', 'profile.php', 'reel', 'settings', 'share', 'watch'
]);
const MAINLAND_PHONE = /^1[3-9]\d{9}$/;
const OVERSEAS_LAST_NIGHT_GAME_ID = '00000000-0000-0000-0000-000000000002';
const OVERSEAS_LAST_NIGHT_COMMUNITY_ID = '00000000-0000-0000-0000-000000000102';
const OVERSEAS_LAST_NIGHT_BASE_URL = 'https://club-en.q1.com/?env=web&gameId=2177&gameVersion=2177-US-ZS&lang=en-US&languageId=2';
const OVERSEAS_LAST_NIGHT_START_PATHS = ['/'];
const WESTERN_EDITION_SCOPE = 'western';

function parseSourceConfig(value = {}) {
  const raw = value.config ?? value;
  if (raw && typeof raw === 'object') return raw;
  if (!raw) return {};
  try { const parsed = JSON.parse(String(raw)); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; }
}

function allowedHostSet(value) {
  const entries = value instanceof Set ? [...value] : Array.isArray(value) ? value : String(value || '').split(',');
  return new Set(entries.map(item => String(item || '').trim().toLowerCase()).filter(Boolean));
}

function westernSourceScope(value = {}, { allowedHosts = [] } = {}) {
  const config = parseSourceConfig(value);
  const platform = normalizePlatform(value.platform);
  const regionCode = String(value.regionCode ?? value.region_code ?? '').trim().toLowerCase();
  const editionScope = String(value.editionScope ?? config.editionScope ?? '').trim().toLowerCase();
  const baseUrl = String(value.baseUrl ?? value.apiUrl ?? config.baseUrl ?? '').trim();
  let parsed = null;
  try { parsed = new URL(baseUrl); } catch {}
  const hosts = allowedHostSet(allowedHosts);
  const hostAllowed = Boolean(parsed) && hosts.has(parsed.hostname.toLowerCase()) && (!parsed.port || parsed.port === '443');
  return {
    allowed: platform === 'bigplayer_h5' && regionCode === 'overseas' && editionScope === WESTERN_EDITION_SCOPE
      && Boolean(parsed) && parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.hash && hostAllowed,
    platform,
    regionCode,
    editionScope,
    baseUrl,
    parsed,
    hostAllowed
  };
}

function isWesternOverseasSource(value, options) { return westernSourceScope(value, options).allowed; }

function validateWesternSourceUrl(value, { allowedHosts = [] } = {}) {
  let parsed;
  try { parsed = new URL(String(value || '').trim()); } catch { return '欧美版地址不是合法 URL'; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash || (parsed.port && parsed.port !== '443')) return '欧美版地址不符合 HTTPS 安全要求';
  if (!allowedHostSet(allowedHosts).has(parsed.hostname.toLowerCase())) return '欧美版地址域名不在允许名单内';
  return null;
}

function isOverseasLastNightSource(value = {}) {
  return String(value.gameId ?? value.game_id) === OVERSEAS_LAST_NIGHT_GAME_ID
    && String(value.communityId ?? value.community_id) === OVERSEAS_LAST_NIGHT_COMMUNITY_ID
    && normalizePlatform(value.platform) === 'bigplayer_h5';
}

function validateOverseasLastNightUrl(value) {
  if (String(value || '').trim() !== OVERSEAS_LAST_NIGHT_BASE_URL) return '固定欧美版地址不匹配';
  let parsed;
  try { parsed = new URL(String(value)); } catch { return '固定欧美版地址不是合法 URL'; }
  if (parsed.protocol !== 'https:' || parsed.host !== 'club-en.q1.com' || parsed.username || parsed.password || parsed.hash) return '固定欧美版地址不符合安全要求';
  return null;
}

function normalizePlatform(value) {
  const platform = String(value || '').trim().toLowerCase();
  return platform === 'xhs' ? 'xiaohongshu' : platform;
}

function isSocialPlatform(value) { return SOCIAL_PLATFORMS.has(normalizePlatform(value)); }

function normalizePhone(value) { return String(value || '').replace(/[\s-]/g, ''); }

function maskPhone(value) {
  const phone = normalizePhone(value);
  return MAINLAND_PHONE.test(phone) ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : '';
}

function validateSocialCredential(body = {}, { partial = false } = {}) {
  const hasPassword = body.password !== undefined && body.password !== '';
  const hasConfirmation = body.confirmPassword !== undefined && body.confirmPassword !== '';
  if (partial && !hasPassword && !hasConfirmation && body.phone == null && body.countryCode == null) return null;
  if ((body.countryCode || '+86') !== '+86') return '首期仅支持中国大陆 +86 手机号';
  const phone = normalizePhone(body.phone);
  if (!MAINLAND_PHONE.test(phone)) return '请输入有效的 11 位中国大陆手机号';
  if (!partial && !hasPassword) return 'password is required';
  if (hasPassword !== hasConfirmation) return 'password and confirmPassword must be provided together';
  if (hasPassword && body.password !== body.confirmPassword) return '两次输入的密码不一致';
  if (hasPassword && String(body.password).length > 512) return 'password is too long';
  return null;
}

function socialSecret(body = {}) {
  return { countryCode: '+86', phone: normalizePhone(body.phone), password: String(body.password ?? '') };
}

function validateEndpoint(value, { required = false } = {}) {
  if (!value || !String(value).trim()) return required ? '接口地址必填' : null;
  let parsed;
  try { parsed = new URL(String(value)); } catch { return '接口地址不是合法 URL'; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return '接口地址必须是 http(s) 链接';
  if (parsed.username || parsed.password) return '接口地址不能包含用户名或密码';
  if (parsed.hash) return '接口地址不能包含 fragment';
  return null;
}

function parseFacebookPageUrl(value) {
  let parsed;
  try { parsed = new URL(String(value || '').trim()); } catch { return { error: '请输入有效的 Facebook 主页 HTTPS 地址' }; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash || (parsed.port && parsed.port !== '443')) return { error: '请输入有效的 Facebook 主页 HTTPS 地址' };
  if (!FACEBOOK_PAGE_HOSTS.has(parsed.hostname.toLowerCase())) return { error: '请输入 Facebook 官方主页域名' };
  for (const key of [...parsed.searchParams.keys()]) {
    const normalized = key.toLowerCase();
    if (normalized.startsWith('utm_') || FACEBOOK_TRACKING_PARAMS.has(normalized)) parsed.searchParams.delete(key);
  }
  if ([...parsed.searchParams.keys()].length) return { error: 'Facebook 主页地址不能包含非跟踪查询参数' };
  let parts;
  try { parts = parsed.pathname.split('/').filter(Boolean).map(part => decodeURIComponent(part)); } catch { return { error: '请输入有效的 Facebook 主页地址' }; }
  if (parts.length !== 1 || FACEBOOK_RESERVED_PATHS.has(parts[0].toLowerCase()) || !/^[A-Za-z0-9._-]{2,100}$/.test(parts[0])) return { error: '请输入有效的 Facebook 主页地址' };
  return { url: `https://www.facebook.com/${encodeURIComponent(parts[0])}` };
}

function validateFacebookPageUrl(value) { return parseFacebookPageUrl(value).error || null; }

function normalizeFacebookPageUrl(value) { return parseFacebookPageUrl(value).url || null; }

module.exports = {
  FACEBOOK_PAGE_HOSTS,
  MAINLAND_PHONE,
  SOURCE_PLATFORMS,
  SOCIAL_PLATFORMS,
  OVERSEAS_LAST_NIGHT_GAME_ID,
  OVERSEAS_LAST_NIGHT_COMMUNITY_ID,
  OVERSEAS_LAST_NIGHT_BASE_URL,
  OVERSEAS_LAST_NIGHT_START_PATHS,
  WESTERN_EDITION_SCOPE,
  isOverseasLastNightSource,
  isWesternOverseasSource,
  isSocialPlatform,
  maskPhone,
  normalizePhone,
  normalizeFacebookPageUrl,
  normalizePlatform,
  socialSecret,
  validateEndpoint,
  validateFacebookPageUrl,
  validateOverseasLastNightUrl,
  validateSocialCredential,
  validateWesternSourceUrl,
  westernSourceScope
};
