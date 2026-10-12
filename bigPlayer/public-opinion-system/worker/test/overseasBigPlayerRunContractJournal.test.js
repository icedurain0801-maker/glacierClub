'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto');
const { createOverseasRunContractJournal, canonical } = require('../src/overseasBigPlayerRunContractJournal');
const repositoryRoot = path.resolve(__dirname, '../../../..');
const url = 'https://club-en.q1.com/?env=1&gameId=2177&gameVersion=2177-US-ZS&languageId=16';
const contract = () => ({ runId: crypto.randomUUID(), sourceId: '081a16d2-5545-4afd-9c65-e04777e4540b',
  accountId: '75c8205f-37eb-4bdf-b6a4-f4f502e35658', gameId: '00000000-0000-0000-0000-000000000002',
  communityId: '00000000-0000-0000-0000-000000000102', siteId: 'site-x', boardId: '100017', siteUrl: url,
  siteUrlSha256: crypto.createHash('sha256').update(url).digest('hex'), windowStart: '2026-10-09T00:00:00.000Z',
  windowEnd: '2026-10-10T00:00:00.000Z', leaseOwner: 'owner-test', leaseEpoch: 1, manifestSha256: 'a'.repeat(64) });
async function fixture() {
  const directory = await fs.mkdtemp(path.join(repositoryRoot, '.temp', 'overseas-contract-isolated-'));
  // Keep exact test evidence for QA; no recursive cleanup or user-file overwrite.
  return { directory, journal: await createOverseasRunContractJournal({ repositoryRoot, directory }) };
}
test('canonical contract rejects unsupported values', () => {
  assert.equal(canonical({ z: 1, a: 'x' }), canonical({ a: 'x', z: 1 })); assert.throws(() => canonical({ a: undefined }));
});
test('real env=web URL is preserved exactly while unknown environment fails', async () => {
  const { journal } = await fixture(), c = contract();
  c.siteUrl = c.siteUrl.replace('env=1', 'env=web');
  c.siteUrlSha256 = crypto.createHash('sha256').update(c.siteUrl).digest('hex');
  await journal.create(c); assert.equal(await journal.verify(c), true);
  const invalid = { ...c, runId: crypto.randomUUID(), siteUrl: c.siteUrl.replace('env=web', 'env=unknown') };
  invalid.siteUrlSha256 = crypto.createHash('sha256').update(invalid.siteUrl).digest('hex');
  await assert.rejects(journal.create(invalid), { code: 'OVERSEAS_CONTRACT_URL_INVALID' });
});
test('persistent contract create/read/verify is exact and idempotent', async () => {
  const { journal, directory } = await fixture(), c = contract(), created = await journal.create(c);
  assert.equal(await journal.verify(c), true); assert.equal((await journal.create(c)).contractSha256, created.contractSha256);
  assert.equal((await fs.readdir(directory)).length, 1);
  await assert.rejects(() => journal.create({ ...c, leaseOwner: 'changed' }), { code: 'OVERSEAS_CONTRACT_EXPECTED_MISMATCH' });
});
test('resume requires existing exact evidence, never auto-generates epoch', async () => {
  const { journal, directory } = await fixture(), c = contract(); await assert.rejects(() => journal.read(c), { code: 'OVERSEAS_CONTRACT_EVIDENCE_MISSING' });
  assert.equal((await fs.readdir(directory)).length, 0); await journal.create(c);
  await assert.rejects(() => journal.verify({ ...c, leaseEpoch: 2 }), { code: 'OVERSEAS_CONTRACT_EVIDENCE_MISSING' });
});
test('credential-bearing URL, wrong hash and extra approval reject', async () => {
  const { journal } = await fixture(), c = contract();
  for (const patch of [{ siteUrl: url + '&token=fake' }, { siteUrlSha256: '0'.repeat(64) }, { approved: true }, { boardId: 100017 }]) await assert.rejects(() => journal.create({ ...c, ...patch }));
});
test('business directory cannot hold journal evidence', async () => {
  await assert.rejects(() => createOverseasRunContractJournal({ repositoryRoot, directory: path.join(repositoryRoot, 'bigPlayer', '.temp', 'unsafe') }), { code: 'OVERSEAS_CONTRACT_DIRECTORY_INVALID' });
});

test('specified epoch recovery reads original owner without creating a new contract', async () => {
  const {journal,directory}=await fixture(),c=contract();await journal.create(c);
  const before=await fs.readdir(directory),proof=await journal.recover({runId:c.runId,leaseEpoch:1});
  assert.deepEqual(proof.contract,c);assert.ok(Object.isFrozen(proof.contract));
  assert.deepEqual(await fs.readdir(directory),before);
  await assert.rejects(journal.recover({runId:c.runId,leaseEpoch:2}),{code:'OVERSEAS_CONTRACT_EVIDENCE_MISSING'});
  assert.deepEqual(await fs.readdir(directory),before);
});

test('recovery rejects ambiguous identity, traversal and unsupported epoch before read', async () => {
  const {journal}=await fixture(),c=contract();
  for(const identity of [{runId:'../outside',leaseEpoch:1},{runId:c.runId,leaseEpoch:0},
    {runId:c.runId,leaseEpoch:'1'},{runId:c.runId,leaseEpoch:1,approved:true},null]){
    await assert.rejects(journal.recover(identity),{code:'OVERSEAS_CONTRACT_BINDING_INVALID'});
  }
});

test('recovery rejects a valid envelope copied to another run or epoch filename', async () => {
  const {journal,directory}=await fixture(),c=contract(),other=contract();const proof=await journal.create(c);
  await fs.copyFile(proof.path,path.join(directory,`overseas-run-${other.runId}-epoch-1.json`));
  await fs.copyFile(proof.path,path.join(directory,`overseas-run-${c.runId}-epoch-2.json`));
  await assert.rejects(journal.recover({runId:other.runId,leaseEpoch:1}),{code:'OVERSEAS_CONTRACT_EXPECTED_MISMATCH'});
  await assert.rejects(journal.recover({runId:c.runId,leaseEpoch:2}),{code:'OVERSEAS_CONTRACT_EXPECTED_MISMATCH'});
});

test('recovery applies original canonical/hash checks to corrupt durable evidence', async () => {
  const {journal}=await fixture(),c=contract();const proof=await journal.create(c);
  await fs.appendFile(proof.path,' ');
  await assert.rejects(journal.recover({runId:c.runId,leaseEpoch:1}),{code:'OVERSEAS_CONTRACT_HASH_INVALID'});
});
