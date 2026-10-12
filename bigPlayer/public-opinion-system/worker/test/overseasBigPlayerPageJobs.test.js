'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { createOverseasPageJobs } = require('../src/overseasBigPlayerPageJobs');
const callback = createOverseasPageJobs({ analysisOptionsFor: () => ({ profile: 'light', version: 'light-v1', triggerReason: 'all_content' }),
  translationOptions: { targetLanguage: 'zh-CN', version: 'translation-v1' } });
function fixture(analysis, translation, rawPatch = {}) {
  const calls = [];
  return { calls, input: { facade: { query: async sql => { calls.push(sql); return sql.includes('po_analysis_jobs') ? (analysis ? [analysis] : []) : (translation ? [translation] : []); },
    enqueueAnalysisJob: async (id, options) => calls.push({ type: 'analysis', id, options }),
    enqueueTranslationJob: async (id, options) => calls.push({ type: 'translation', id, options }) },
    contents: [{ content: { id: 'c', fingerprint: 'new', body: 'text' }, change: 'changed' }], items: [{ fingerprint: 'new', ...rawPatch }] } };
}
test('stale completed AI and translation requeue exact version', async () => {
  const f = fixture({ status: 'completed', content_fingerprint: 'old' }, { status: 'completed', content_fingerprint: 'old' }); await callback(f.input);
  const writes = f.calls.filter(value => typeof value === 'object'); assert.equal(writes.length, 2);
  assert.ok(writes.every(value => value.options.force && value.options.contentFingerprint === 'new'));
});
test('same completed and running versions stay idempotent', async () => {
  const f = fixture({ status: 'completed', content_fingerprint: 'new' }, { status: 'running', content_fingerprint: 'new', lease_owner: 'active' }); await callback(f.input);
  assert.equal(f.calls.filter(value => typeof value === 'object').length, 0);
});
test('different running AI or translation version rejects without mutating its lease', async () => {
  for (const target of ['analysis', 'translation']) {
    const running = { status: 'running', content_fingerprint: 'old', lease_owner: 'active' };
    const f = fixture(target === 'analysis' ? running : { status: 'completed', content_fingerprint: 'new' }, target === 'translation' ? running : null);
    await assert.rejects(() => callback(f.input), { code: 'OVERSEAS_QUEUE_ACTIVE_VERSION_CONFLICT' });
    assert.equal(f.calls.filter(value => typeof value === 'object').length, 0);
  }
});
test('context ancestors never enter queues', async () => {
  const f = fixture(null, null, { recoveryContextAncestor: true }); await callback(f.input); assert.equal(f.calls.length, 0);
});
test('repair missing jobs on unchanged content preserves failed, held and retryable jobs during replay', async () => {
  const repair = createOverseasPageJobs({ repairMissingJobs: true,
    analysisOptionsFor: () => ({ profile: 'light', version: 'light-v1', triggerReason: 'all_content' }),
    translationOptions: { targetLanguage: 'zh-CN', version: 'translation-v1' } });
  for (const status of ['held','failed','retryable','pending','completed','running']) {
    const f = fixture({status,content_fingerprint:'new'}, {status,content_fingerprint:'new'});
    f.input.contents[0].change = 'unchanged';
    await repair(f.input);
    assert.equal(f.calls.filter(x => typeof x === 'object').length, 0);
  }
  const missing = fixture(null,null); missing.input.contents[0].change = 'unchanged';
  await repair(missing.input); assert.equal(missing.calls.filter(x => typeof x === 'object').length, 2);
});
test('content fingerprint mismatch rejects', async () => {
  const f = fixture(null, null, { fingerprint: 'wrong' }); await assert.rejects(() => callback(f.input), { code: 'OVERSEAS_QUEUE_CONTENT_VERSION_CONFLICT' });
});
test('complete policy cannot return null and translation config mutation cannot cancel its job', async () => {
  const translationOptions={targetLanguage:'zh-CN',version:'saved-v1'};
  const fixed=createOverseasPageJobs({analysisOptionsFor:()=>({profile:'light',version:'v1',triggerReason:'all_content'}),translationOptions});
  translationOptions.targetLanguage='en';translationOptions.version='changed';
  const f=fixture(null,null);await fixed(f.input);
  const translation=f.calls.find(value=>value.type==='translation');
  assert.equal(translation.options.targetLanguage,'zh-CN');assert.equal(translation.options.version,'saved-v1');
  const invalid=createOverseasPageJobs({analysisOptionsFor:()=>null,translationOptions:{targetLanguage:'zh-CN',version:'v1'}});
  await assert.rejects(()=>invalid(fixture(null,null).input),{code:'OVERSEAS_QUEUE_POLICY_REQUIRED'});
});
