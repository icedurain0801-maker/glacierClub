'use strict';

function configOf(source = {}) {
  if (source.config && typeof source.config === 'object') return source.config;
  try { return JSON.parse(source.config || '{}'); } catch { return {}; }
}
function isFacebookBrowser(source) { return source?.platform === 'facebook' && configOf(source).collectionMode === 'browser'; }
function normalizeFacebookWebUrl(value) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { throw invalidUrl(); }
  if (url.protocol !== 'https:' || !['facebook.com', 'www.facebook.com', 'm.facebook.com'].includes(url.hostname) || url.username || url.password || url.hash || (url.port && url.port !== '443')) throw invalidUrl();
  let parts;
  try { parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent); } catch { throw invalidUrl(); }
  if (parts.some(part => !/^[A-Za-z0-9._-]+$/.test(part) || part === '.' || part === '..')) throw invalidUrl();
  if (!parts.length || ['login', 'checkpoint', 'settings', 'logout', 'dialog', 'recover', 'login.php', 'l.php'].includes(parts[0].toLowerCase())) throw invalidUrl();
  if (parts[0] === 'groups' && (!parts[1] || parts.length > 2)) throw invalidUrl();
  if (parts[0] !== 'groups' && parts.length !== 1 && !(['people', 'pages'].includes(parts[0]) && parts.length === 3)) throw invalidUrl();
  if (parts[0] === 'profile.php' && !/^\d+$/.test(url.searchParams.get('id') || '')) throw invalidUrl();
  for (const key of [...url.searchParams.keys()]) if (!['id', 'story_fbid'].includes(key)) url.searchParams.delete(key);
  url.hostname = 'www.facebook.com';
  url.pathname = '/' + parts.join('/');
  return url.toString();
}
function invalidUrl() { return Object.assign(new Error('请填写 Facebook 主页或群组的 HTTPS 地址'), { code: 'FACEBOOK_URL_INVALID', status: 400 }); }
function bindingKey({ sourceId, accountId, platform }) {
  if (!sourceId || !accountId || platform !== 'facebook') throw Object.assign(new Error('Facebook 账号绑定无效'), { code: 'BINDING_REQUIRED', status: 400 });
  return JSON.stringify([sourceId, accountId, platform]);
}
module.exports = { configOf, isFacebookBrowser, normalizeFacebookWebUrl, bindingKey };
