const fs = require('fs');
const path = require('path');
const cfg = require('../config/kb');

const BOT_AVATAR_BASE_PATH = '/bot-avatars';
const MIME_EXTENSION_MAP = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
  'image/x-icon': '.ico',
  'image/avif': '.avif',
};

function getPreferredExtension(file = {}) {
  const byMime = MIME_EXTENSION_MAP[String(file.mimetype || '').toLowerCase()];
  if (byMime) return byMime;

  const ext = path.extname(String(file.originalname || '')).toLowerCase();
  if (ext && /^[.][a-z0-9]{1,8}$/i.test(ext)) return ext;
  return '.img';
}

function ensureVersionDir(versionId) {
  const dir = path.join(cfg.botAvatarDir, String(versionId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function createUploadTarget(versionId, file) {
  const dir = ensureVersionDir(versionId);
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${getPreferredExtension(file)}`;
  return {
    dir,
    fileName,
    absolutePath: path.join(dir, fileName),
    storedPath: `${BOT_AVATAR_BASE_PATH}/${versionId}/${fileName}`,
  };
}

function isDataUrl(value) {
  return /^data:/i.test(String(value || '').trim());
}

function isAbsoluteUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function isManagedAvatarPath(value) {
  return String(value || '').trim().startsWith(`${BOT_AVATAR_BASE_PATH}/`);
}

function toAbsoluteAvatarUrl(req, storedValue) {
  const value = String(storedValue || '').trim();
  if (!value) return null;
  if (isDataUrl(value) || isAbsoluteUrl(value)) return value;
  if (isManagedAvatarPath(value)) {
    return `${req.protocol}://${req.get('host')}${value}`;
  }
  return value;
}

function deleteManagedAvatar(storedValue) {
  const value = String(storedValue || '').trim();
  if (!isManagedAvatarPath(value)) return false;

  const relativePath = value.slice(`${BOT_AVATAR_BASE_PATH}/`.length);
  const absolutePath = path.resolve(cfg.botAvatarDir, relativePath);
  const rootPath = path.resolve(cfg.botAvatarDir);
  if (!absolutePath.startsWith(rootPath)) return false;

  try {
    fs.rmSync(absolutePath, { force: true });
    return true;
  } catch (err) {
    console.error('[botAvatarStore] deleteManagedAvatar failed:', absolutePath, err.message);
    return false;
  }
}

module.exports = {
  BOT_AVATAR_BASE_PATH,
  createUploadTarget,
  deleteManagedAvatar,
  isDataUrl,
  isManagedAvatarPath,
  toAbsoluteAvatarUrl,
};
