'use strict';
// Release-time rebind only: never weakens the collector's runtime hash/process
// checks. A changed exclusion clause needs review instead of automatic approval.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const SOURCE = '081a16d2-5545-4afd-9c65-e04777e4540b';
const FILES = ['worker/src/worker.js', 'worker/src/workerScanLease.js', 'server/src/db/repository.js',
  'worker/src/schedulerCandidateLoader.js', 'worker/src/schedulerRepositoryAdapter.js'];
const hash = body => crypto.createHash('sha256').update(body).digest('hex');
function rebindManifest(previous, releaseRoot) {
  if (previous.sourceId !== SOURCE || previous.files?.length !== FILES.length || !path.isAbsolute(releaseRoot)) {
    throw new Error('OVERSEAS_EXCLUSION_MANIFEST_INVALID');
  }
  const files = FILES.map(relative => {
    const entry = previous.files.find(file => file.path === relative);
    const before = fs.readFileSync(path.join(previous.releaseRoot, relative));
    if (!entry || hash(before) !== entry.sha256) throw new Error('OVERSEAS_EXCLUSION_BASE_CHANGED');
    const filename = path.join(releaseRoot, relative);
    const stat = fs.lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('OVERSEAS_EXCLUSION_FILE_INVALID');
    const after = fs.readFileSync(filename);
    const clauses = before.toString('utf8').split(/\r?\n/).map(line => line.trim()).filter(line => line.includes(SOURCE));
    if (!clauses.length || clauses.some(clause => !after.toString('utf8').split(/\r?\n/).some(line => line.trim() === clause))) {
      throw new Error('OVERSEAS_EXCLUSION_CLAUSE_CHANGED');
    }
    return { path: relative, sha256: hash(after) };
  });
  return { sourceId: SOURCE, releaseRoot: path.resolve(releaseRoot), files };
}
if (require.main === module) {
  try {
    const [previousPath, releaseRoot, outputPath] = process.argv.slice(2);
    const manifest = rebindManifest(JSON.parse(fs.readFileSync(previousPath, 'utf8')), releaseRoot);
    fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ status: 'EXCLUSION_REBOUND', files: manifest.files.length }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { rebindManifest, FILES };
