'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function hash(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase(); }
function collect(root, directory = root, entries = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('release links are forbidden');
    if (/^\.env(?:\.|$)/i.test(entry.name)) throw new Error('release env files are forbidden');
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(root, file, entries);
    else if (entry.isFile() && path.relative(root, file) !== 'manifest.json') entries.push({ path: path.relative(root, file), sha256: hash(file) });
  }
  return entries;
}
function assertManifestBuffer(buffer) {
  if (buffer.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) throw new Error('manifest must not contain UTF-8 BOM');
  if (buffer.subarray(0, 2).equals(Buffer.from([0xff, 0xfe])) || buffer.subarray(0, 2).equals(Buffer.from([0xfe, 0xff]))) throw new Error('manifest must be UTF-8, not UTF-16');
  if (buffer.length && buffer.at(-1) !== 0x0a) throw new Error('manifest must end with one LF');
  if (buffer.length > 1 && buffer.at(-2) === 0x5c && buffer.at(-1) === 0x6e) throw new Error('manifest must not end with a literal backslash-n');
  JSON.parse(buffer.toString('utf8'));
}
function write(root) {
  const entries = collect(root).sort((a, b) => a.path.localeCompare(b.path));
  const output = Buffer.from(`${JSON.stringify(entries, null, 2)}\n`, 'utf8');
  assertManifestBuffer(output);
  fs.writeFileSync(path.join(root, 'manifest.json'), output);
  return entries;
}
function validate(root) {
  const manifest = path.join(root, 'manifest.json');
  const buffer = fs.readFileSync(manifest);
  assertManifestBuffer(buffer);
  const declared = JSON.parse(buffer.toString('utf8'));
  const actual = collect(root).sort((a, b) => a.path.localeCompare(b.path));
  if (!Array.isArray(declared) || JSON.stringify(declared) !== JSON.stringify(actual)) throw new Error('manifest mismatch: release inventory or content changed');
}
if (require.main === module) {
  const [root, mode] = process.argv.slice(2);
  if (!root || !['--write', '--validate'].includes(mode)) throw new Error('usage: write-login-session-manifest.js <root> --write|--validate');
  if (mode === '--write') { console.log(`MANIFEST_WRITTEN=${write(root).length}`); validate(root); }
  else { validate(root); console.log('MANIFEST_VALID'); }
}
module.exports = { assertManifestBuffer, collect, validate, write };
