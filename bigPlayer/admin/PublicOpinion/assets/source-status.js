(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SourceStatus = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const PLATFORM_ALIASES = { xhs: 'xiaohongshu', xiaohongshu: 'xiaohongshu' };
  const LOGIN_ALIASES = {
    unconfigured: 'pending_verification', pending: 'pending_verification', pending_verification: 'pending_verification',
    checking: 'verifying', logging_in: 'verifying', verifying: 'verifying', authorized: 'healthy', logged_in: 'healthy',
    active: 'healthy', healthy: 'healthy', challenge_required: 'manual_verification', requires_verification: 'manual_verification',
    manual_verification: 'manual_verification', awaiting_manual_verification: 'manual_verification', invalid_credentials: 'credential_error', invalid: 'credential_error', credential_error: 'credential_error',
    expired: 'session_expired', session_expired: 'session_expired', relogin: 'verifying', revoked: 'pending_verification', paused: 'paused', disabled: 'paused', collection_error: 'collection_error', failed: 'collection_error'
  };
  const LOGIN_META = {
    pending_verification: { label: '待验证', tone: 'pending', attention: false },
    verifying: { label: '验证中', tone: 'running', attention: false },
    healthy: { label: '正常', tone: 'healthy', attention: false },
    manual_verification: { label: '待人工验证', tone: 'attention', attention: true },
    credential_error: { label: '凭据错误', tone: 'error', attention: true },
    session_expired: { label: '会话失效', tone: 'error', attention: true },
    paused: { label: '已暂停', tone: 'paused', attention: false },
    collection_error: { label: '采集异常', tone: 'error', attention: true }
  };
  const AUTH_LABELS = { unconfigured: '待配置', authorized: '已授权', unauthorized: '未授权', expired: '已过期', failed: '检测失败', unsupported: '不支持', awaiting_manual_verification: '待人工验证', pending_verification: '待验证' };
  const CHALLENGE_ALIASES = {
    qr: 'qr_code', qrcode: 'qr_code', qr_code: 'qr_code', scan: 'qr_code',
    image: 'image_captcha', captcha: 'image_captcha', image_captcha: 'image_captcha',
    sms: 'sms_code', sms_code: 'sms_code', device: 'device_confirmation', device_confirm: 'device_confirmation', device_confirmation: 'device_confirmation'
  };
  const CHALLENGE_META = {
    qr_code: { label: '扫码验证', acceptsCode: false, polls: true },
    image_captcha: { label: '图片验证码', acceptsCode: true, polls: false },
    sms_code: { label: '短信验证码', acceptsCode: true, polls: false },
    device_confirmation: { label: '设备确认', acceptsCode: false, polls: true }
  };
  function normalizePlatform(value) { return PLATFORM_ALIASES[value] || value || ''; }
  function isSocialLoginPlatform(value) { return ['douyin', 'xiaohongshu'].includes(normalizePlatform(value)); }
  function read(source, keys) {
    for (const object of [source, source && (source.loginStatus || source.login_status), source && (source.account || source.platform_account || source.platformAccount), source && (source.session || source.login_session)]) {
      if (!object) continue;
      for (const key of keys) if (object[key] !== undefined && object[key] !== null) return object[key];
    }
    return undefined;
  }
  function loginStateOf(source) {
    if (!source) return 'pending_verification';
    const login = source.loginStatus || source.login_status || {};
    const account = source.account || source.platform_account || source.platformAccount || {};
    const session = source.session || source.login_session || {};
    const raw = source.login_state ?? source.loginState ?? login.login_state ?? login.loginState ?? login.status ?? session.session_status ?? session.sessionStatus ?? session.status ?? account.login_state ?? account.loginState ?? account.auth_status ?? account.authStatus ?? source.auth_status ?? source.authStatus ?? source.status;
    return LOGIN_ALIASES[String(raw || '').toLowerCase()] || (String(raw || '').toLowerCase() === 'unauthorized' ? 'pending_verification' : 'pending_verification');
  }
  function loginMeta(value) { const state = typeof value === 'string' ? (LOGIN_ALIASES[value] || value) : loginStateOf(value); return { state, ...(LOGIN_META[state] || LOGIN_META.pending_verification) }; }
  function explicitCredentialState(value) {
    const source = value || {};
    const account = source.account || source.platform_account || source.platformAccount || {};
    for (const object of [account, source]) {
      for (const key of ['hasCredential', 'has_credential', 'credentialConfigured', 'credential_configured']) {
        if (typeof object[key] === 'boolean') return object[key];
      }
    }
    return undefined;
  }
  function h5CredentialMeta(value) {
    const source = value || {};
    const account = source.account || source.platform_account || source.platformAccount || {};
    const rawCredentials = account.credentials || source.credentials || source.credentialSummary || source.credential_summary || {};
    const credentialList = Array.isArray(rawCredentials) ? rawCredentials : [rawCredentials];
    const credentials = credentialList.reduce((result, item) => ({ ...result, ...(item || {}) }), {});
    const configured = source.credentialConfigured || source.credential_configured || credentials.configured || {};
    const explicitConfigured = explicitCredentialState(source);
    const summaryConfigured = [
      credentials.hasCredential, credentials.has_credential, credentials.credentialConfigured, credentials.credential_configured,
      credentials.configured, configured.hasCredential, configured.has_credential, configured.credentialConfigured, configured.credential_configured
    ].find(item => typeof item === 'boolean');
    const hasTokenFlag = source.hasToken ?? source.has_token ?? account.hasToken ?? account.has_token;
    const hasToken = Boolean(hasTokenFlag ?? (explicitConfigured === true ? true : undefined) ?? (summaryConfigured === true ? true : undefined) ?? credentials.apiToken ?? credentials.api_token ?? configured.apiToken ?? configured.api_token ?? configured.token ?? configured.api_token_configured ?? credentialList.some(item => ['api_token', 'token'].includes(String(item?.credentialType || item?.credential_type || item?.type || '').toLowerCase())));
    const hasPassword = Boolean((source.hasAccountPassword ?? source.has_account_password ?? account.hasAccountPassword ?? account.has_account_password ?? credentials.accountPassword ?? credentials.account_password ?? configured.accountPassword ?? configured.account_password ?? configured.password ?? configured.account_password_configured) || credentialList.some(item => ['account_password', 'password'].includes(String(item?.credentialType || item?.credential_type || item?.type || '').toLowerCase())));
    const hasCredential = Boolean(summaryConfigured ?? explicitConfigured ?? hasToken ?? hasPassword);
    const maskedIdentifier = pickMasked(source) || pickMasked(account) || pickMasked(credentials);
    return { hasCredential, hasToken, hasPassword, account: String(maskedIdentifier || '') };
  }
  function pickMasked(value) { return value?.maskedAccount || value?.masked_account || value?.maskedLoginIdentifier || value?.masked_login_identifier || value?.loginAccountMasked || value?.login_account_masked || value?.login_identifier || ''; }
  function validateH5CredentialUpdate({ account = '', password = '', confirmPassword = '', creating = false } = {}) {
    const normalizedAccount = String(account || '').trim();
    const nextPassword = String(password || '');
    const confirmation = String(confirmPassword || '');
    if (!creating && !normalizedAccount && !nextPassword && !confirmation) return { credential: null };
    if (creating && !normalizedAccount) return { error: '请填写 H5 登录账号' };
    if (!nextPassword) return { error: '账号密码需同时填写' };
    if (nextPassword !== confirmation) return { error: '两次输入的密码不一致' };
    return { credential: { credentialType: 'account_password', ...(normalizedAccount ? { account: normalizedAccount } : {}), password: nextPassword, confirmPassword: confirmation } };
  }
  function isTerminalLoginState(value) { return ['healthy', 'credential_error', 'session_expired', 'collection_error', 'paused'].includes(loginMeta(value).state); }
  function canSync(value) { const source = value || {}; const platform = normalizePlatform(source.platform); if (platform !== 'bigplayer_h5') return false; const login = loginMeta(source.loginStatus || source.login_status || source); const capability = source.capabilities?.posts; const capabilityState = typeof capability === 'object' ? capability.status || capability.capability : capability; return login.state === 'healthy' && ['full', 'authorized_scope', 'supported'].includes(capabilityState); }
  function needsAttention(source) { return isSocialLoginPlatform(source && source.platform) && loginMeta(source).attention; }
  function challengeTypeOf(challenge) { const raw = challenge && (challenge.type || challenge.challengeType || challenge.challenge_type); return CHALLENGE_ALIASES[String(raw || '').toLowerCase()] || String(raw || '').toLowerCase(); }
  function challengeMeta(challenge) {
    const type = challengeTypeOf(challenge);
    const defaults = CHALLENGE_META[type] || { label: '等待平台确认', acceptsCode: false, polls: true };
    return { type, label: defaults.label, acceptsCode: Boolean(challenge && (challenge.allowSubmit ?? challenge.allow_submit ?? challenge.allowsTextSubmission ?? challenge.acceptsCode ?? defaults.acceptsCode)), polls: Boolean(challenge && (challenge.requiresPoll ?? challenge.requires_poll ?? challenge.requiresPolling ?? challenge.poll ?? defaults.polls)) };
  }
  function secondsRemaining(expiresAt, now) { const expiry = new Date(expiresAt || 0).getTime(); const current = now instanceof Date ? now.getTime() : Number(now || Date.now()); return Number.isFinite(expiry) ? Math.max(0, Math.ceil((expiry - current) / 1000)) : 0; }
  function formatCountdown(seconds) { const value = Math.max(0, Number(seconds) || 0); return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(Math.floor(value % 60)).padStart(2, '0')}`; }
  function sourceDeepLink(sourceId, status, baseQuery) { const params = new URLSearchParams(baseQuery || ''); if (sourceId) params.set('sourceId', sourceId); if (status) params.set('status', status); return `sources.html${params.toString() ? `?${params}` : ''}`; }
  function matchesStatus(source, filter) { if (!filter) return true; if (filter === 'attention') return needsAttention(source); return loginMeta(source).state === (LOGIN_ALIASES[filter] || filter); }
  function authLabel(value) { return AUTH_LABELS[String(value || '').toLowerCase()] || value || '待配置'; }
  function needsLoginValidation(source, h5Mode) { const platform = normalizePlatform(source?.platform); return isSocialLoginPlatform(platform) || (platform === 'bigplayer_h5' && h5Mode === 'account_password'); }
  return { normalizePlatform, isSocialLoginPlatform, loginStateOf, loginMeta, authLabel, needsLoginValidation, explicitCredentialState, h5CredentialMeta, validateH5CredentialUpdate, isTerminalLoginState, canSync, needsAttention, challengeTypeOf, challengeMeta, secondsRemaining, formatCountdown, sourceDeepLink, matchesStatus };
});
