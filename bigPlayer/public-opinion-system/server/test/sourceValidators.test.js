const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isSocialPlatform,
  maskPhone,
  normalizePlatform,
  socialSecret,
  validateEndpoint,
  validateSocialCredential
} = require('../src/services/sourceValidators');

test('normalizes legacy xhs platform and identifies social platforms', () => {
  assert.equal(normalizePlatform('xhs'), 'xiaohongshu');
  assert.equal(normalizePlatform('douyin'), 'douyin');
  assert.equal(isSocialPlatform('xhs'), true);
  assert.equal(isSocialPlatform('bigplayer_h5'), false);
});

test('validates and masks mainland mobile credentials without changing password', () => {
  const body = { countryCode: '+86', phone: '138 0013 8000', password: ' pass ', confirmPassword: ' pass ' };
  assert.equal(validateSocialCredential(body), null);
  assert.deepEqual(socialSecret(body), { countryCode: '+86', phone: '13800138000', password: ' pass ' });
  assert.equal(maskPhone(body.phone), '138****8000');
});

test('rejects invalid social credential combinations', () => {
  assert.match(validateSocialCredential({ phone: '123', password: 'x', confirmPassword: 'x' }), /11 位/);
  assert.match(validateSocialCredential({ countryCode: '+1', phone: '13800138000', password: 'x', confirmPassword: 'x' }), /\+86/);
  assert.match(validateSocialCredential({ phone: '13800138000', password: 'x', confirmPassword: 'y' }), /不一致/);
  assert.match(validateSocialCredential({ phone: '13800138000', password: 'x' }), /provided together/);
});

test('validates endpoint shape without accepting embedded credentials or fragments', () => {
  assert.equal(validateEndpoint('https://api.example.com/posts', { required: true }), null);
  assert.match(validateEndpoint('', { required: true }), /必填/);
  assert.match(validateEndpoint('ftp://api.example.com/posts'), /http/);
  assert.match(validateEndpoint('https://u:p@api.example.com/posts'), /用户名或密码/);
  assert.match(validateEndpoint('https://api.example.com/posts#x'), /fragment/);
});
