'use strict';
const fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto');
const fail = code => { throw Object.assign(new Error(code), { code }); };
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const KEYS = ['runId', 'sourceId', 'accountId', 'gameId', 'communityId', 'siteId', 'boardId', 'siteUrl', 'siteUrlSha256', 'windowStart', 'windowEnd', 'leaseOwner', 'leaseEpoch', 'manifestSha256'];
const readers=new WeakSet();
const locations=new WeakMap();
function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  fail('OVERSEAS_CONTRACT_VALUE_INVALID');
}
function contractOf(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !KEYS.includes(key)) || KEYS.some(key => !Object.hasOwn(value, key))) fail('OVERSEAS_CONTRACT_BINDING_INVALID');
  const out = Object.fromEntries(KEYS.map(key => [key, value[key]]));
  for (const key of KEYS.filter(key => key !== 'leaseEpoch')) if (typeof out[key] !== 'string') fail('OVERSEAS_CONTRACT_BINDING_INVALID');
  for (const key of ['runId', 'sourceId', 'accountId', 'gameId', 'communityId']) if (!UUID.test(out[key])) fail('OVERSEAS_CONTRACT_BINDING_INVALID');
  if (!/^[A-Za-z0-9._:-]{1,120}$/.test(out.siteId) || !/^[1-9]\d*$/.test(out.boardId) || !Number.isSafeInteger(Number(out.boardId))
    || !/^[A-Za-z0-9._:-]{1,256}$/.test(out.leaseOwner) || !Number.isSafeInteger(out.leaseEpoch) || out.leaseEpoch < 1
    || !/^[a-f0-9]{64}$/.test(out.manifestSha256)) fail('OVERSEAS_CONTRACT_BINDING_INVALID');
  let url; try { url = new URL(out.siteUrl); } catch { fail('OVERSEAS_CONTRACT_URL_INVALID'); }
  if (url.origin !== 'https://club-en.q1.com' || url.username || url.password || url.hash || url.toString() !== out.siteUrl) fail('OVERSEAS_CONTRACT_URL_INVALID');
  for (const key of url.searchParams.keys()) if (/token|secret|password|authorization|credential/i.test(key)) fail('OVERSEAS_CONTRACT_URL_INVALID');
  for (const key of ['env', 'gameId', 'gameVersion', 'languageId']) if (url.searchParams.getAll(key).length !== 1 || !url.searchParams.get(key)?.trim()) fail('OVERSEAS_CONTRACT_URL_INVALID');
  if (!['1', 'web'].includes(url.searchParams.get('env'))) fail('OVERSEAS_CONTRACT_URL_INVALID');
  for (const key of ['gameId', 'languageId']) if (!/^[1-9]\d*$/.test(url.searchParams.get(key)) || !Number.isSafeInteger(Number(url.searchParams.get(key)))) fail('OVERSEAS_CONTRACT_URL_INVALID');
  if (out.siteUrlSha256 !== sha(out.siteUrl)) fail('OVERSEAS_CONTRACT_HASH_INVALID');
  for (const key of ['windowStart', 'windowEnd']) if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(out[key]) || !Number.isFinite(Date.parse(out[key])) || new Date(out[key]).toISOString() !== out[key]) fail('OVERSEAS_CONTRACT_WINDOW_INVALID');
  if (out.windowStart >= out.windowEnd) fail('OVERSEAS_CONTRACT_WINDOW_INVALID');
  return Object.freeze(out);
}
async function createOverseasRunContractJournal({ repositoryRoot, directory, statePolicy } = {}) {
  if (!path.isAbsolute(repositoryRoot || '') || !path.isAbsolute(directory || '')) fail('OVERSEAS_CONTRACT_DIRECTORY_INVALID');
  const root = await fs.realpath(repositoryRoot), temp = path.join(root, '.temp'), target = path.resolve(directory);
  const relative = path.relative(temp, target);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) fail('OVERSEAS_CONTRACT_DIRECTORY_INVALID');
  const parts = ['.temp', ...relative.split(path.sep)];
  async function recheck() {
    if (statePolicy != null) await require('./overseasStateDirectoryPolicy').resolveStateDirectory({ policy: statePolicy, directory: target });
    let current = root;
    for (const part of parts) { current = path.join(current, part); const stat = await fs.lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) fail('OVERSEAS_CONTRACT_DIRECTORY_INVALID'); }
    if (await fs.realpath(target) !== target) fail('OVERSEAS_CONTRACT_DIRECTORY_INVALID');
  }
  await recheck();
  const filename = c => path.join(target, `overseas-run-${c.runId.toLowerCase()}-epoch-${c.leaseEpoch}.json`);
  const envelope = c => ({ format: 'overseas-bigplayer-run-contract-v1', contract: c, contractSha256: sha(canonical(c)) });
  async function readFileContract({runId,leaseEpoch}, expected) {
    if (typeof runId!=='string' || !UUID.test(runId) || !Number.isSafeInteger(leaseEpoch) || leaseEpoch < 1) fail('OVERSEAS_CONTRACT_BINDING_INVALID');
    const identity={runId,leaseEpoch}; await recheck(); let handle;
    try {
      const file = filename(identity), stat = await fs.lstat(file);
      if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 16384 || stat.nlink !== 1) fail('OVERSEAS_CONTRACT_FILE_INVALID');
      handle = await fs.open(file, 'r'); const opened = await handle.stat();
      if (opened.dev !== stat.dev || opened.ino !== stat.ino || opened.size !== stat.size) fail('OVERSEAS_CONTRACT_FILE_INVALID');
      const raw = await handle.readFile('utf8'); let parsed;
      try { parsed = JSON.parse(raw); } catch { fail('OVERSEAS_CONTRACT_FILE_INVALID'); }
      if (parsed?.format !== 'overseas-bigplayer-run-contract-v1' || Object.keys(parsed).sort().join(',') !== 'contract,contractSha256,format') fail('OVERSEAS_CONTRACT_FILE_INVALID');
      const stored = contractOf(parsed.contract);
      if (parsed.contractSha256 !== sha(canonical(stored)) || raw !== canonical(envelope(stored)) + '\n') fail('OVERSEAS_CONTRACT_HASH_INVALID');
      if (stored.runId.toLowerCase() !== runId.toLowerCase() || stored.leaseEpoch !== leaseEpoch
        || (expected && canonical(stored) !== canonical(expected))) fail('OVERSEAS_CONTRACT_EXPECTED_MISMATCH');
      return Object.freeze({ contract: stored, contractSha256: parsed.contractSha256, path: file });
    } catch (error) { if (error.code === 'ENOENT') fail('OVERSEAS_CONTRACT_EVIDENCE_MISSING'); throw error; }
    finally { await handle?.close(); }
  }
  async function read(expected) {
    const c=contractOf(expected);return readFileContract(c,c);
  }
  // Integrity-only recovery of a specified durable record, not claim/HTTP
  // permission. Callers must separately verify receipt scope and DB fencing.
  async function recover(identity) {
    if (!identity || Object.getPrototypeOf(identity)!==Object.prototype || Object.keys(identity).sort().join(',') !== 'leaseEpoch,runId') fail('OVERSEAS_CONTRACT_BINDING_INVALID');
    return readFileContract(identity);
  }
  async function create(contract) {
    const c = contractOf(contract); await recheck(); const file = filename(c);
    const pending = path.join(target, `.overseas-contract-${crypto.randomUUID()}.pending`); let handle, created = false;
    try {
      handle = await fs.open(pending, 'wx', 0o600); created = true;
      await handle.writeFile(canonical(envelope(c)) + '\n'); await handle.sync(); await handle.close(); handle = null;
      await recheck();
      try { await fs.link(pending, file); } catch (error) { if (error.code !== 'EEXIST') throw error; }
      await fs.unlink(pending); created = false;
      return await read(c);
    } finally { await handle?.close(); if (created) { try { await fs.unlink(pending); } catch {} } }
  }
  // Integrity evidence, not a QA signature or permission to run production.
  const reader=Object.freeze({ create, read, recover, async verify(expected) { await read(expected); return true; } });
  readers.add(reader);locations.set(reader,{root,directory:target});return reader;
}
function runContractJournalLocation(journal){if(!readers.has(journal))fail('OVERSEAS_CONTRACT_DIRECTORY_INVALID');return Object.freeze({...locations.get(journal)});}
module.exports = { createOverseasRunContractJournal, contractOf, canonical,runContractJournalLocation, isTrustedRunContractJournal:value=>readers.has(value) };
