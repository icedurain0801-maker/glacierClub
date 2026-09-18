'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const releaseRoot = path.resolve(process.argv[2] || '');
const writeManifest = process.argv.includes('--write-manifest');
const manifestName = 'frontend3001-release-manifest.json';
function fail(message) { throw new Error(message); }
function digest(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function files(root) {
  const output = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) fail(`reparse point is forbidden: ${absolute}`);
    if (entry.isDirectory()) output.push(...files(absolute));
    else if (entry.isFile()) output.push(absolute);
    else fail(`unsupported release entry: ${absolute}`);
  }
  return output;
}
if (!fs.existsSync(releaseRoot) || !fs.statSync(releaseRoot).isDirectory()) fail('ReleaseRoot must be a directory');
for (const required of [
  'frontend3001-server.js',
  'public/admin/PublicOpinion/index.html',
  'public/admin/PublicOpinion/assets/app.js',
  'public/shared/sidebar.css',
  'public/shared/sidebar.js',
  'public/shared/sidebar-data.js',
  'public/public-opinion-system/shared/riskModes.js',
]) {
  const target = path.join(releaseRoot, required);
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) fail(`required release file missing: ${required}`);
}
new Function(fs.readFileSync(path.join(releaseRoot, 'frontend3001-server.js'), 'utf8'));
const releaseFiles = files(releaseRoot).filter(file => path.basename(file) !== manifestName);
for (const file of releaseFiles) {
  const relative = path.relative(releaseRoot, file).replaceAll('\\', '/');
  if (relative !== 'frontend3001-server.js' && !relative.startsWith('public/admin/PublicOpinion/') &&
      !relative.startsWith('public/shared/') && relative !== 'public/public-opinion-system/shared/riskModes.js') {
    fail(`release allowlist violation: ${relative}`);
  }
  if (/\.env(?:\.|$)/i.test(relative) || /(^|\/)node_modules\//i.test(relative)) fail(`forbidden release entry: ${relative}`);
}
const entries = releaseFiles.map(file => ({
  path: path.relative(releaseRoot, file).replaceAll('\\', '/'),
  sha256: digest(file),
})).sort((a, b) => a.path.localeCompare(b.path));
const manifestPath = path.join(releaseRoot, manifestName);
if (writeManifest) fs.writeFileSync(manifestPath, `${JSON.stringify({ algorithm: 'sha256', files: entries }, null, 2)}\n`);
else {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest || manifest.algorithm !== 'sha256' || !Array.isArray(manifest.files) || Object.keys(manifest).sort().join(',') !== 'algorithm,files') fail('release manifest schema mismatch');
  if (JSON.stringify(manifest.files) !== JSON.stringify(entries)) fail('release manifest mismatch');
}
console.log(`PASS: verified frontend3001 release (${entries.length} files)`);
