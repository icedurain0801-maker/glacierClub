'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire, builtinModules } = require('node:module');

const runtimeRoot = path.resolve(process.argv[2] || '');
const sourceRoot = path.resolve(process.argv[3] || '');
const writeManifest = process.argv.includes('--write-manifest');
const manifestName = 'package-release-manifest.json';
const builtins = new Set([...builtinModules, ...builtinModules.map(name => `node:${name}`)]);

function fail(message) { throw new Error(message); }
function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
function files(root) {
  const output = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink() || (stat.attributes && stat.attributes.reparsePoint)) fail(`reparse point is forbidden: ${absolute}`);
    if (entry.isDirectory()) output.push(...files(absolute));
    else if (entry.isFile()) output.push(absolute);
    else fail(`unsupported release entry: ${absolute}`);
  }
  return output;
}
function allowed(relative) {
  const value = relative.replaceAll('\\', '/');
  return value === 'package.json' || value === 'package-lock.json' || value === manifestName ||
    value === 'shared/riskModes.js' ||
    value.startsWith('server/src/') || value.startsWith('node_modules/');
}
function digest(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }

if (!fs.statSync(runtimeRoot).isDirectory()) fail('RuntimeRoot must be a directory');
for (const required of ['package.json', 'package-lock.json', 'server/src/app.js', 'server/src/runtimeEnv.js', 'shared/riskModes.js']) {
  const target = path.join(runtimeRoot, required);
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) fail(`required release file missing: ${required}`);
}
const allFiles = files(runtimeRoot).filter(file => path.relative(runtimeRoot, file).replaceAll('\\', '/') !== manifestName);
for (const file of allFiles) {
  const relative = path.relative(runtimeRoot, file);
  if (!allowed(relative)) fail(`release allowlist violation: ${relative}`);
  const content = fs.readFileSync(file);
  const text = content && !content.includes(0) ? content.toString('utf8') : '';
  const owned = !relative.startsWith(`node_modules${path.sep}`);
  const ownedPathLeak = owned && (
    /[A-Za-z]:\\Users\\/i.test(text) ||
    /[A-Za-z]:\\[^\\\r\n]*\\AppData\\/i.test(text)
  );
  if (text && (text.toLowerCase().includes(sourceRoot.toLowerCase()) || ownedPathLeak)) {
    fail(`source path leakage: ${relative}`);
  }
}

const jsFiles = allFiles.filter(file => file.endsWith('.js') && !file.includes(`${path.sep}node_modules${path.sep}`));
const dependencyPatterns = [
  /require(?:\.resolve)?\(\s*['"]([^'"]+)['"]\s*\)/g,
  /import\(\s*['"]([^'"]+)['"]\s*\)/g,
  /(?:import|export)\s+(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/g,
];
for (const file of jsFiles) {
  const source = fs.readFileSync(file, 'utf8');
  new Function(source);
  const resolver = createRequire(file);
  for (const pattern of dependencyPatterns) {
    for (const match of source.matchAll(pattern)) {
      if (builtins.has(match[1])) continue;
      const resolved = resolver.resolve(match[1]);
      if (!inside(runtimeRoot, resolved)) fail(`dependency escaped RuntimeRoot: ${match[1]} from ${file}`);
    }
  }
}

const entries = allFiles
  .map(file => ({ path: path.relative(runtimeRoot, file).replaceAll('\\', '/'), sha256: digest(file) }))
  .sort((a, b) => a.path.localeCompare(b.path));
const manifestPath = path.join(runtimeRoot, manifestName);
if (writeManifest) fs.writeFileSync(manifestPath, `${JSON.stringify({ algorithm: 'sha256', files: entries }, null, 2)}\n`);
else {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest || manifest.algorithm !== 'sha256' || !Array.isArray(manifest.files) || Object.keys(manifest).sort().join(',') !== 'algorithm,files') {
    fail('release manifest schema mismatch');
  }
  if (JSON.stringify(manifest.files) !== JSON.stringify(entries)) fail('release manifest mismatch');
}
console.log(`PASS: verified API release (${entries.length} files)`);
