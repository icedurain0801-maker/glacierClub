const SOCIAL_PLATFORMS = new Set(['douyin', 'xiaohongshu']);
const SOURCE_PLATFORMS = new Set(['bigplayer_h5', 'douyin', 'taptap', 'bilibili', 'xiaohongshu', 'weibo', 'tieba']);
const MAINLAND_PHONE = /^1[3-9]\d{9}$/;

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

module.exports = {
  MAINLAND_PHONE,
  SOCIAL_PLATFORMS,
  SOURCE_PLATFORMS,
  isSocialPlatform,
  maskPhone,
  normalizePhone,
  normalizePlatform,
  socialSecret,
  validateEndpoint,
  validateSocialCredential
};
