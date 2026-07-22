function readInt(name, fallback) {
  const value = parseInt(process.env[name], 10);
  return Number.isFinite(value) ? value : fallback;
}

function readBool(name, fallback = false) {
  const value = process.env[name];
  if (value == null || value === '') return fallback;
  return value === 'true' || value === '1';
}

function readList(name, fallback = []) {
  const value = process.env[name];
  if (!value) return fallback;
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

function readJson(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toBaseHost(baseUrl) {
  try {
    return new URL(baseUrl).host;
  } catch {
    return '';
  }
}

const baseUrl = process.env.COMMUNITY_SYNC_BASE_URL || '';
const baseHost = toBaseHost(baseUrl);

module.exports = {
  enabled: readBool('COMMUNITY_SYNC_ENABLED', false),
  runOnStart: readBool('COMMUNITY_SYNC_RUN_ON_START', false),
  versionId: readInt('COMMUNITY_SYNC_VERSION_ID', 0),
  versionCode: process.env.COMMUNITY_SYNC_VERSION_CODE || '',
  intervalMs: readInt('COMMUNITY_SYNC_INTERVAL_MS', 6 * 60 * 60 * 1000),
  scheduleHour: Math.min(Math.max(readInt('COMMUNITY_SYNC_SCHEDULE_HOUR', 3), 0), 23),
  scheduleMinute: Math.min(Math.max(readInt('COMMUNITY_SYNC_SCHEDULE_MINUTE', 0), 0), 59),

  baseUrl,
  loginUrl: process.env.COMMUNITY_SYNC_LOGIN_URL || '',
  authCheckPath: process.env.COMMUNITY_SYNC_AUTH_CHECK_PATH || '',
  startPaths: readList('COMMUNITY_SYNC_START_PATHS', ['/']),
  allowedHosts: readList('COMMUNITY_SYNC_ALLOWED_HOSTS', baseHost ? [baseHost] : []),

  authCookie: process.env.COMMUNITY_SYNC_AUTH_COOKIE || '',
  username: process.env.COMMUNITY_SYNC_USERNAME || '',
  password: process.env.COMMUNITY_SYNC_PASSWORD || '',
  usernameField: process.env.COMMUNITY_SYNC_USERNAME_FIELD || 'username',
  passwordField: process.env.COMMUNITY_SYNC_PASSWORD_FIELD || 'password',
  extraLoginFields: readJson('COMMUNITY_SYNC_LOGIN_EXTRA_FIELDS', {}),
  loginSuccessText: process.env.COMMUNITY_SYNC_LOGIN_SUCCESS_TEXT || '',
  loginFailureText: process.env.COMMUNITY_SYNC_LOGIN_FAILURE_TEXT || '',
  authCheckText: process.env.COMMUNITY_SYNC_AUTH_CHECK_TEXT || '',

  userAgent: process.env.COMMUNITY_SYNC_USER_AGENT || 'AICompanionCommunitySync/1.0',
  requestTimeoutMs: readInt('COMMUNITY_SYNC_REQUEST_TIMEOUT_MS', 15000),
  maxRetries: readInt('COMMUNITY_SYNC_MAX_RETRIES', 2),
  retryBaseMs: readInt('COMMUNITY_SYNC_RETRY_BASE_MS', 800),
  delayMs: readInt('COMMUNITY_SYNC_DELAY_MS', 250),
  maxPages: readInt('COMMUNITY_SYNC_MAX_PAGES', 0),
  maxDepth: readInt('COMMUNITY_SYNC_MAX_DEPTH', 8),
  minContentChars: readInt('COMMUNITY_SYNC_MIN_CONTENT_CHARS', 80),
  maxContentChars: readInt('COMMUNITY_SYNC_MAX_CONTENT_CHARS', 20000),
  maxImageAnalysesPerPage: readInt('COMMUNITY_SYNC_MAX_IMAGE_ANALYSES_PER_PAGE', 3),

  browserChannel: process.env.COMMUNITY_SYNC_BROWSER_CHANNEL || '',
  browserExecutablePath: process.env.COMMUNITY_SYNC_BROWSER_EXECUTABLE_PATH || '',
  browserHeadless: readBool('COMMUNITY_SYNC_BROWSER_HEADLESS', true),
  q1ProfileDir: process.env.COMMUNITY_SYNC_Q1_PROFILE_DIR || '',
  q1PostPageSize: readInt('COMMUNITY_SYNC_Q1_POST_PAGE_SIZE', 20),
  q1CommentPageSize: readInt('COMMUNITY_SYNC_Q1_COMMENT_PAGE_SIZE', 50),
  q1LoginBlockThreshold: readInt('COMMUNITY_SYNC_Q1_LOGIN_BLOCK_THRESHOLD', 3),
  q1LoginBlockMinutes: readInt('COMMUNITY_SYNC_Q1_LOGIN_BLOCK_MINUTES', 360),
};
