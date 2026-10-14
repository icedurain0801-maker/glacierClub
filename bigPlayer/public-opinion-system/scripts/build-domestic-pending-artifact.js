'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const baseline = 'C:/ProgramData/PublicOpinion/frontend3001/releases/release-20260924123831-boardid-save/public/admin/PublicOpinion/assets/sources.js';
const expected = '2dc368b11c7fc54fa948df8eea72b77b9ed9c8644e3631408cd15d3e19440d68';
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const original = fs.readFileSync(baseline);
if (sha(original) !== expected) throw new Error('STATIC_BASELINE_CHANGED');
const text = original.toString('utf8');
const needle = "const pending = checkpoints.filter(item => ['idle', 'queued', 'pending', 'running'].includes(String(pick(item, 'status', 'sync_status', 'syncStatus') || '').toLowerCase())).length;";
const replacement = needle.replace('.length;', '.reduce((total, item) => total + Number(item.checkpoint_count ?? 1), 0);');
if (text.split(needle).length !== 2) throw new Error('STATIC_ANCHOR_AMBIGUOUS');
const offset = Buffer.byteLength(text.slice(0, text.indexOf(needle)));
const updated = Buffer.concat([original.subarray(0, offset), Buffer.from(replacement), original.subarray(offset + Buffer.byteLength(needle))]);
const root = path.resolve(__dirname, '../../..', '.temp/bigplayer-recovery-20261009');
fs.mkdirSync(root, { recursive: true });
const output = fs.mkdtempSync(path.join(root, 'domestic-pending-'));
fs.writeFileSync(path.join(output, 'sources.before.js'), original, { flag: 'wx' });
fs.writeFileSync(path.join(output, 'sources.js'), updated, { flag: 'wx' });
const manifest = { baseline, baselineSha256: expected, artifact: path.join(output, 'sources.js'), sha256: sha(updated),
  changes: 1, byteOffset: offset, before: needle, after: replacement,
  semantics: 'null/undefined=>1 (full checkpoint); numeric/numeric string=>Number; zero=>0; invalid=>NaN, unchanged existing numeric conversion policy; DB COUNT(*) yields positive numbers',
  rollback: path.join(output, 'sources.before.js') };
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(manifest, null, 2));
