// 分片上传会话管理：内存 Map 存元信息 + 本地磁盘存分片文件。
// 重启会话丢失（前端需重新 init 上传，可接受）。
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg  = require('../config/kb');

const sessions = new Map();  // uploadId -> { name, size, totalChunks, receivedIndexes:Set, dir, versionId, userId }

function ensureTmpRoot() {
  if (!fs.existsSync(cfg.uploadTmpDir)) fs.mkdirSync(cfg.uploadTmpDir, { recursive: true });
}

function init({ name, size, totalChunks, versionId, userId }) {
  ensureTmpRoot();
  const uploadId = crypto.randomBytes(12).toString('hex');
  const dir = path.join(cfg.uploadTmpDir, uploadId);
  fs.mkdirSync(dir, { recursive: true });
  sessions.set(uploadId, {
    name, size, totalChunks, dir, versionId, userId,
    receivedIndexes: new Set(),
  });
  return uploadId;
}

function get(uploadId) { return sessions.get(uploadId); }

function saveChunk(uploadId, index, buffer) {
  const s = sessions.get(uploadId);
  if (!s) throw Object.assign(new Error('uploadId 不存在'), { status: 404 });
  fs.writeFileSync(path.join(s.dir, `${index}`), buffer);
  s.receivedIndexes.add(Number(index));
  return { received: s.receivedIndexes.size };
}

function missingChunks(uploadId) {
  const s = sessions.get(uploadId);
  if (!s) return null;
  const missing = [];
  for (let i = 0; i < s.totalChunks; i++) if (!s.receivedIndexes.has(i)) missing.push(i);
  return missing;
}

// 合并所有分片到一个完整文件；返回最终文件路径。
function mergeChunks(uploadId) {
  const s = sessions.get(uploadId);
  if (!s) throw Object.assign(new Error('uploadId 不存在'), { status: 404 });
  const missing = missingChunks(uploadId);
  if (missing.length > 0) {
    throw Object.assign(new Error(`缺少分片: ${missing.join(',')}`), { status: 400 });
  }
  const finalPath = path.join(s.dir, '__merged__' + path.extname(s.name || '.xlsx'));
  const out = fs.createWriteStream(finalPath);
  for (let i = 0; i < s.totalChunks; i++) {
    const chunk = fs.readFileSync(path.join(s.dir, `${i}`));
    out.write(chunk);
  }
  out.end();
  return finalPath;
}

// 清理该会话临时目录（解析完成后调用）
function cleanup(uploadId) {
  const s = sessions.get(uploadId);
  if (!s) return;
  try { fs.rmSync(s.dir, { recursive: true, force: true }); } catch { /* ignore */ }
  sessions.delete(uploadId);
}

module.exports = { init, get, saveChunk, missingChunks, mergeChunks, cleanup };
