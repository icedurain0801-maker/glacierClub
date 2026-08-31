const crypto = require('node:crypto');

// 凭据加解密工具：AES-256-GCM。
// 明文凭据（Cookie/token）只在服务端内存出现，加密后以 {v,iv,tag,cipher} JSON 存入
// po_credentials.secret_cipher；绝不明文落库、不写日志、不回显给前端。
// 密钥读环境变量 CREDENTIAL_ENC_KEY（32 字节，hex 64 位或 base64）；未配置即 fail-closed 抛错，
// 不降级为明文存储。
const ALGO = 'aes-256-gcm';

function loadKey(env = process.env) {
  const raw = env.CREDENTIAL_ENC_KEY || '';
  if (!raw) { const error = new Error('CREDENTIAL_ENC_KEY_MISSING'); error.code = 'CREDENTIAL_ENC_KEY_MISSING'; throw error; }
  let key;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) key = Buffer.from(raw, 'hex');
  else key = Buffer.from(raw, 'base64');
  if (key.length !== 32) { const error = new Error('CREDENTIAL_ENC_KEY_INVALID'); error.code = 'CREDENTIAL_ENC_KEY_INVALID'; throw error; }
  return key;
}

function encrypt(plaintext, env = process.env, options = {}) {
  if (typeof plaintext !== 'string' || !plaintext) { const error = new Error('CREDENTIAL_PLAINTEXT_EMPTY'); error.code = 'CREDENTIAL_PLAINTEXT_EMPTY'; throw error; }
  const key = loadKey(env);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const aad = options.aad == null ? null : Buffer.from(String(options.aad), 'utf8');
  if (aad) cipher.setAAD(aad);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const data = { v: options.aad == null && options.kid == null ? 1 : 2, iv: iv.toString('base64'), tag: tag.toString('base64'), cipher: enc.toString('base64') };
  if (options.aad != null) data.aad = String(options.aad);
  if (options.kid != null) data.kid = String(options.kid);
  return JSON.stringify(data);
}

function decrypt(payload, env = process.env, options = {}) {
  const key = loadKey(env);
  const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
  const iv = Buffer.from(data.iv, 'base64');
  const tag = Buffer.from(data.tag, 'base64');
  const enc = Buffer.from(data.cipher, 'base64');
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  const aad = options.aad != null ? String(options.aad) : data.aad;
  if (aad != null) decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt, loadKey };
