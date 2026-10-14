'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { rebindManifest, FILES } = require('../../scripts/refresh-overseas-shared-exclusion');
test('release rebind preserves every exclusion and rejects removal or changed baseline', t => {
  const directory = fs.mkdtempSync(path.resolve(__dirname, '../../../../.temp/overseas-exclusion-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const sourceId = '081a16d2-5545-4afd-9c65-e04777e4540b';
  const baseline = path.join(directory, 'before'), target = path.join(directory, 'after');
  const files = FILES.map(relative => {
    const body = `if (id === '${sourceId}') return;\n`;
    for (const root of [baseline, target]) {
      const filename = path.join(root, relative);
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      fs.writeFileSync(filename, body);
    }
    return { path: relative, sha256: crypto.createHash('sha256').update(body).digest('hex') };
  });
  const previous = { sourceId, releaseRoot: baseline, files };
  fs.appendFileSync(path.join(target, FILES[0]), '// unrelated domestic change\n');
  assert.equal(rebindManifest(previous, target).releaseRoot, target);
  fs.writeFileSync(path.join(target, FILES[0]), '// removed guard\n');
  assert.throws(() => rebindManifest(previous, target), /CLAUSE_CHANGED/);
  fs.appendFileSync(path.join(baseline, FILES[0]), '// tampered\n');
  assert.throws(() => rebindManifest(previous, target), /BASE_CHANGED/);
});
