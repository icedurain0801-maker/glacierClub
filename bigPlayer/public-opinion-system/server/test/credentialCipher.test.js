const test = require('node:test');
const assert = require('node:assert');
const { encrypt, decrypt, loadKey } = require('../src/integrations/credentialCipher');

// 固定测试密钥（32 字节 hex），只用于单测，不用于生产。
const env = { CREDENTIAL_ENC_KEY: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90' };

test('encrypt → decrypt 往返一致', () => {
  const plain = 'cookie=SESSION=abc123; token=Bearer xyz';
  const payload = encrypt(plain, env);
  assert.strictEqual(decrypt(payload, env), plain);
});

test('密文不含明文子串', () => {
  const plain = 'super-secret-cookie-value';
  const payload = encrypt(plain, env);
  assert.ok(!payload.includes(plain), '序列化密文不得出现明文');
  assert.ok(!payload.includes('super-secret'), '密文不得泄漏明文片段');
});

test('每次加密使用随机 IV（同明文密文不同）', () => {
  const plain = '同一份凭据';
  assert.notStrictEqual(encrypt(plain, env), encrypt(plain, env));
});

test('密钥缺失时 fail-closed 抛 CREDENTIAL_ENC_KEY_MISSING', () => {
  assert.throws(() => encrypt('x', {}), /CREDENTIAL_ENC_KEY_MISSING/);
  assert.throws(() => loadKey({}), /CREDENTIAL_ENC_KEY_MISSING/);
});

test('密钥长度不足抛 CREDENTIAL_ENC_KEY_INVALID', () => {
  assert.throws(() => encrypt('x', { CREDENTIAL_ENC_KEY: 'deadbeef' }), /CREDENTIAL_ENC_KEY_INVALID/);
});

test('篡改密文（tag 校验）导致解密失败', () => {
  const payload = JSON.parse(encrypt('原文', env));
  const tampered = Buffer.from(payload.cipher, 'base64');
  tampered[0] ^= 0xff;
  payload.cipher = tampered.toString('base64');
  assert.throws(() => decrypt(payload, env));
});

test('AAD/kid 密文往返且错误 AAD 不能解密', () => {
  const payload = encrypt('aad-secret', env, { aad: 'account:a1:type:api_token', kid: 'primary' });
  assert.equal(JSON.parse(payload).v, 2);
  assert.equal(decrypt(payload, env), 'aad-secret');
  assert.equal(decrypt(payload, env, { aad: 'account:a1:type:api_token' }), 'aad-secret');
  assert.throws(() => decrypt(payload, env, { aad: 'account:a2:type:api_token' }));
});
