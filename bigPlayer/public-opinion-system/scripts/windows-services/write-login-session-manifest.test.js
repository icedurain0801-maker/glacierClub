'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { assertManifestBuffer, validate, write } = require('./write-login-session-manifest');

test('writes parseable UTF-8 JSON with a real LF and validates every entry', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'login-manifest-'));
  fs.writeFileSync(path.join(root, 'one.txt'), 'one');
  write(root); validate(root);
  const bytes = fs.readFileSync(path.join(root, 'manifest.json'));
  assert.equal(bytes.at(-1), 0x0a);
  assert.doesNotMatch(bytes.toString('utf8'), /\\\\n$/);
  fs.rmSync(root, { recursive: true, force: true });
});

for (const [name, bytes] of [
  ['BOM', Buffer.from([0xef, 0xbb, 0xbf, 0x5b, 0x5d, 0x0a])],
  ['UTF16', Buffer.from([0xff, 0xfe, 0x5b, 0x00, 0x5d, 0x00])],
  ['literal backslash-n', Buffer.from('[]\\\\n', 'utf8')],
  ['trailing garbage', Buffer.from('[]x', 'utf8')]
]) test(`rejects ${name}`, () => assert.throws(() => assertManifestBuffer(bytes)));

test('rejects secret env files and unmanifested or altered release files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'login-manifest-negative-'));
  try {
    fs.writeFileSync(path.join(root, 'one.txt'), 'one');
    write(root);
    fs.writeFileSync(path.join(root, '.env'), 'FIXTURE_ONLY=1');
    assert.throws(() => write(root), /env files are forbidden/);
    assert.throws(() => validate(root), /env files are forbidden/);
    fs.unlinkSync(path.join(root, '.env'));
    fs.writeFileSync(path.join(root, 'extra.txt'), 'extra');
    assert.throws(() => validate(root), /manifest mismatch/);
    fs.unlinkSync(path.join(root, 'extra.txt'));
    fs.writeFileSync(path.join(root, 'one.txt'), 'changed');
    assert.throws(() => validate(root), /manifest mismatch/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
