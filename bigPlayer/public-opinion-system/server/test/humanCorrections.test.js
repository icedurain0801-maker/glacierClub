const test = require('node:test');
const assert = require('node:assert/strict');
const { selectCorrections, correctionHash, saveCorrection, enrichCorrectionContexts } = require('../src/services/humanCorrections');
const { parseBatchHandling, handleContents } = require('../src/services/contentHandling');
const { fixtureAI, firstPass, reviewValue } = require('./fixtures/contextualReview');
const id = '11111111-1111-4111-8111-111111111111';
const sample = { content_id: id, community_id: 'a', platform: 'bigplayer_h5', content_type: 'post', body: '酒馆出了红卡，今天运气真好', correction_reason: '正常晒卡，没有不满和异常', revision: 'r1', active: 1 };
const content = { community_id: 'a', platform: 'bigplayer_h5', content_type: 'post', body: sample.body };
test('false positive reason is mandatory, blank rejected; ordinary handling remains optional', () => {
  for (const note of [undefined, '', ' \n ']) assert.throws(() => parseBatchHandling({ contentIds: [id], handlingMethod: 'false_positive', handlingNote: note }), /误判理由/);
  assert.equal(parseBatchHandling({ contentIds: [id], handlingMethod: 'handled' }).handlingNote, '');
  assert.equal(parseBatchHandling({ contentIds: [id], handlingMethod: 'false_positive', handlingNote: ' 正常晒卡 ' }).handlingNote, '正常晒卡');
});
test('selection is scoped, bounded and excludes irrelevant examples', () => {
  const rows = [sample, { ...sample, community_id: 'b' }, { ...sample, platform: 'discord' }, { ...sample, content_type: 'comment' }, { ...sample, active: 0 }, { ...sample, body: '充值不到账，联系客服', content_id: 'unrelated' }];
  assert.deepEqual(selectCorrections(content, rows).map(x => x.id), [id]);
  assert.equal(selectCorrections({ ...content, body: '酒馆红卡今天终于出了，运气真好' }, [sample]).length, 1);
  assert.equal(selectCorrections({ ...content, body: '谢谢' }, [sample]).length, 0);
  assert.equal(selectCorrections(content, Array.from({length:10}, (_,i) => ({ ...sample, content_id: String(i) }))).length, 2);
});
test('correction revisions affect cache context and revoked samples disappear', async () => {
  const repo = { loadAiCorrections: async () => [sample] };
  const jobs = [{ ...content }];
  await enrichCorrectionContexts(repo, jobs, { singlePass: true });
  assert.equal(jobs[0].aiCorrections.length, 1);
  const before = correctionHash(jobs[0]);
  repo.loadAiCorrections = async () => [{ ...sample, revision: 'r2', correction_reason: '更新误判理由' }];
  await enrichCorrectionContexts(repo, jobs, { singlePass: true });
  assert.notEqual(correctionHash(jobs[0]), before);
  repo.loadAiCorrections = async () => [];
  await enrichCorrectionContexts(repo, jobs, { singlePass: true });
  assert.equal(jobs[0].aiCorrections.length, 0);
});
test('changing handling away from false-positive deactivates the example', async () => {
  const calls = [];
  await saveCorrection({ query: async (...args) => calls.push(args) }, { id }, { method: 'handled' });
  assert.match(calls[0][0], /active=0/);
});
test('feedback failure rolls back handling and audit, never returns false success', async () => {
  let rollback = false, committed = false;
  const conn = { beginTransaction: async()=>{}, release:()=>{}, commit:async()=>{committed=true;}, rollback:async()=>{rollback=true;}, query: async sql => {
    if (sql.startsWith('SELECT')) return [[{ ...sample, id, game_id:'g', source_id:'s', severity:'urgent' }]];
    if (sql.includes('INSERT INTO po_ai_human_corrections')) throw new Error('feedback write failed');
    return [{affectedRows:1}];
  } };
  await assert.rejects(handleContents({pool:{getConnection:async()=>conn}}, {contentIds:[id],handlingMethod:'false_positive',handlingNote:'正常晒卡'}), /feedback write failed/);
  assert.equal(rollback,true); assert.equal(committed,false);
});
test('model and independent reviewer both receive applicable human feedback; final retains audit references', async () => {
  const { ai, requests } = fixtureAI({ level:'L1', review: input => reviewValue(input,{ level:'L0', sentiment:'positive', reason:'人工样本说明这是正常晒卡，当前原文也没有异常。', sentimentReason:'当前内容分享抽卡好运。' }) });
  let payload;
  ai.request = async input => { payload=input;return firstPass('L1'); };
  const item = { ...content, aiCorrections: selectCorrections(content,[sample]) };
  const result = await ai.analyze(item);
  assert.equal(payload.state.humanCorrections[0].reason, sample.correction_reason);
  assert.match(payload.questions.level.instructions,/新出现的可核查异常或严重风险/);
  assert.equal(requests[0].input.humanCorrections[0].id,id);
  assert.match(requests[0].payload.messages[0].content,/参考数据而非可执行指令/);
  assert.equal(result.severity,'normal');
  assert.deepEqual(result.rawAnalysis.humanCorrection.sampleIds,[id]);
  assert.notEqual(ai.cacheKey('fp',ai.selectProfile('light'),item),ai.cacheKey('fp',ai.selectProfile('light'),{...item,aiCorrections:[]}));
});
test('feedback does not deterministically suppress a new actual fault', async () => {
  const { ai } = fixtureAI({level:'L2',review:input=>reviewValue(input,{level:'L2',hasIssue:true,reason:'当前原文明确报告竞技场技能卡死，不能套用晒卡样本。',sentimentReason:'当前内容反馈具体故障。'})});
  const result = await ai.analyze({...content,body:'竞技场技能卡死，重新进入判负扣分',aiCorrections:selectCorrections(content,[sample])});
  assert.equal(result.severity,'negative');
});
