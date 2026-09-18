'use strict';
const fs = require('node:fs');
const path = require('node:path');

const sourceRoot = path.resolve(process.argv[2]);
const targetRoot = path.resolve(process.argv[3]);
const queue = [];
const copied = new Set();
const dependencyPatterns = [/require(?:\.resolve)?\(\s*['"]([^'"]+)['"]\s*\)/g, /import\(\s*['"]([^'"]+)['"]\s*\)/g];

function inside(root, target) { const relative = path.relative(root, target); return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)); }
function assertPlain(target) {
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) throw new Error(`Source reparse point is forbidden: ${target}`);
  return stat;
}
function resolveLocal(from, request) {
  if (!request.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), request);
  for (const candidate of [base, `${base}.js`, `${base}.json`, path.join(base, 'index.js')]) {
    if (fs.existsSync(candidate) && assertPlain(candidate).isFile()) return candidate;
  }
  throw new Error(`local dependency missing: ${request} from ${from}`);
}
function enqueue(file) {
  const absolute = path.resolve(file);
  if (!inside(sourceRoot, absolute)) throw new Error(`dependency escaped SourceRoot: ${absolute}`);
  if (!copied.has(absolute)) queue.push(absolute);
}

const workerRoot = path.join(sourceRoot, 'worker', 'src');
assertPlain(workerRoot);
for (const entry of fs.readdirSync(workerRoot, { withFileTypes: true })) {
  const absolute = path.join(workerRoot, entry.name);
  if (entry.isDirectory()) {
    const walk = root => { assertPlain(root); for (const child of fs.readdirSync(root, { withFileTypes: true })) { const file = path.join(root, child.name); if (child.isDirectory()) walk(file); else if (child.isFile()) enqueue(file); else throw new Error(`Source reparse point is forbidden: ${file}`); } };
    walk(absolute);
  } else if (entry.isFile()) enqueue(absolute);
  else throw new Error(`Source reparse point is forbidden: ${absolute}`);
}
while (queue.length) {
  const file = queue.shift();
  if (copied.has(file)) continue;
  assertPlain(file); copied.add(file);
  const relative = path.relative(sourceRoot, file);
  if (!/^(worker[\\/]src|server[\\/]src|shared[\\/])/.test(relative)) throw new Error(`worker dependency is outside allowlist: ${relative}`);
  const destination = path.join(targetRoot, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(file, destination);
  if (!file.endsWith('.js')) continue;
  const source = fs.readFileSync(file, 'utf8');
  for (const pattern of dependencyPatterns) for (const match of source.matchAll(pattern)) {
    const dependency = resolveLocal(file, match[1]);
    if (dependency) enqueue(dependency);
  }
}
const crawler = path.join(sourceRoot, 'scripts', 'q1_crawler.py');
assertPlain(crawler); fs.mkdirSync(path.join(targetRoot, 'scripts'), { recursive: true });
fs.copyFileSync(crawler, path.join(targetRoot, 'scripts', 'q1_crawler.py'));
console.log(`PASS: copied Worker runtime closure (${copied.size + 1} source files)`);
