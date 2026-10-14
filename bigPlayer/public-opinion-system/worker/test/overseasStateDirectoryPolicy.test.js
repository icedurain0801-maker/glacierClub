'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path');
const { createIsolatedStateDirectoryPolicy, resolveStateDirectory } = require('../src/overseasStateDirectoryPolicy');
const repositoryRoot = path.resolve(__dirname, '../../../..');

test('production-shaped policy cannot authorize production path; isolated policy cannot escape',async()=>{
  const production=path.resolve('C:/ProgramData/PublicOpinion/data/state/overseas-bigplayer-v1');
  let validatorCalls=0;
  const forged=Object.freeze({kind:'production-v1',directory:production,productionActivationAllowed:true,validate:async()=>{validatorCalls++;throw Error('forged validator invoked');}});
  await assert.rejects(resolveStateDirectory({policy:forged,directory:production}),{code:'OVERSEAS_STATE_DIRECTORY_INVALID'});
  assert.equal(validatorCalls,0);
  const directory=await fs.mkdtemp(path.join(repositoryRoot,'.temp','overseas-state-closed-'));
  const policy=await createIsolatedStateDirectoryPolicy({repositoryRoot,directory});
  await assert.rejects(resolveStateDirectory({policy,directory:production}),{code:'OVERSEAS_STATE_DIRECTORY_INVALID'});
  await assert.rejects(resolveStateDirectory({policy,directory:path.join(directory,'missing-journal')}),{code:'ENOENT'});
  assert.equal(policy.kind,'isolated-v1');assert.equal(policy.productionActivationAllowed,false);
});
test('owned isolated policy permits only existing non-link children', async () => {
  const directory = await fs.mkdtemp(path.join(repositoryRoot, '.temp', 'overseas-state-policy-'));
  const child = path.join(directory, 'journals'); await fs.mkdir(child);
  const policy = await createIsolatedStateDirectoryPolicy({ repositoryRoot, directory });
  assert.equal(await resolveStateDirectory({ policy, directory: child }), child);
  assert.equal(policy.productionActivationAllowed, false);
  await assert.rejects(resolveStateDirectory({ policy: { ...policy }, directory: child }), { code: 'OVERSEAS_STATE_DIRECTORY_INVALID' });
  await assert.rejects(resolveStateDirectory({ policy, directory: path.join(repositoryRoot, '.temp') }), { code: 'OVERSEAS_STATE_DIRECTORY_INVALID' });
});
test('no policy, business path and production root remain fail-closed', async () => {
  await assert.rejects(resolveStateDirectory({ directory: repositoryRoot }), { code: 'OVERSEAS_STATE_DIRECTORY_INVALID' });
  for (const directory of [path.join(repositoryRoot, 'bigPlayer'), 'C:/ProgramData/PublicOpinion/data/state/overseas-bigplayer-v1']) {
    await assert.rejects(createIsolatedStateDirectoryPolicy({ repositoryRoot, directory }), { code: 'OVERSEAS_STATE_DIRECTORY_INVALID' });
  }
});
test('Journal accepts only the exact branded injected isolated directory policy', async () => {
  const { createOverseasRunContractJournal } = require('../src/overseasBigPlayerRunContractJournal');
  const directory = await fs.mkdtemp(path.join(repositoryRoot, '.temp', 'overseas-state-journal-'));
  const policy = await createIsolatedStateDirectoryPolicy({ repositoryRoot, directory });
  await createOverseasRunContractJournal({ repositoryRoot, directory, statePolicy: policy });
  await assert.rejects(createOverseasRunContractJournal({ repositoryRoot, directory, statePolicy: { ...policy } }), { code: 'OVERSEAS_STATE_DIRECTORY_INVALID' });
});
