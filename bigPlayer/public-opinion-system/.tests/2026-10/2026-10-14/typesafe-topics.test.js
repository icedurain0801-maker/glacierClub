const test = require('node:test');
const assert = require('node:assert/strict');
const { TypeSafeAnalyzer } = require('../../../server/src/integrations/typeSafeAnalyzer');
const { TypeSafeTopicAnalyzer } = require('../../../server/src/integrations/typeSafeTopicAnalyzer');
const { TOPICS, parseTopicAnswer, emptyTopic } = require('../../../server/src/services/topicDecision');
const { updateTopic, invariant, needsTopic } = require('../../../scripts/backfill-typesafe-topics');

test('topic taxonomy has specific categories and validates provider output', () => {
  assert.equal(Object.values(TOPICS).includes('其他'), false);
  assert.equal(parseTopicAnswer({ choice: 'tavern', confidence: .9 }).topics[0], '酒馆收益');
  for (const answer of [null, { choice: '__proto__', confidence: 1 }, { choice: 'tavern', confidence: NaN }, { choice: 'bugs', confidence: 2 }]) assert.equal(parseTopicAnswer(answer).status, 'pending');
});
test('text-insufficient image labels recognize existing media and inline image URLs without reading pixels', () => {
  assert.deepEqual(emptyTopic({ body: '50颗\nhttps://example.com/p.png', media: '[]' }).topics, ['图片分享·文字不足']);
  assert.deepEqual(emptyTopic({ body: '第一个' }).topics, ['文字不足']);
});
test('normal analysis attaches topic in the existing request without changing risk decisions', () => {
  const ai = new TypeSafeAnalyzer({});
  const text = '竞技场第三回合卡死';
  const questions = ai.questions(text);
  assert.equal(questions.topic.type, 'choice');
  const data = { answers: { level: { choice: 'L2', confidence: .9 }, has_verifiable_issue: { noul: .9 }, emergency_trigger: { choice: 'none' }, sentiment: { choice: 'negative' }, reason: { choice: 'issue' }, evidence: { choice: 'q0' }, quality: { score: 0 }, recommend_home: { noul: 0 }, recommend_pin: { noul: 0 }, recommend_feature: { noul: 0 }, topic: { choice: 'bugs', confidence: .95 } } };
  const withTopic = ai.parse(data, text, questions);
  delete data.answers.topic;
  const withoutTopic = ai.parse(data, text, questions);
  assert.deepEqual(withTopic.topics, ['功能异常']);
  assert.deepEqual(withTopic.typeSafeDecision, withoutTopic.typeSafeDecision);
  assert.equal(withTopic.severity, withoutTopic.severity);
  assert.deepEqual(withoutTopic.topics, ['议题待补判']);
});
test('topic-only batches match indexes and never inherit comment parent title', async () => {
  let calls = 0;
  const client = { model: 'test-model', acquire: async () => {}, release() {}, key: () => 'isolated', request: async payload => {
    calls++;
    assert.equal(payload.state.items[0].text, '恭喜');
    assert.equal(payload.state.items[1].index, 2);
    assert.equal(payload.state.items[1].text, '酒馆刷到红轴');
    assert.equal(Object.keys(payload.questions).some(key => /level|sentiment/.test(key)), false);
    return { answers: { topic_0: { choice: 'interaction', confidence: .9 }, topic_2: { choice: 'tavern', confidence: .95 } } };
  } };
  const output = await new TypeSafeTopicAnalyzer({}, { client }).classify([{ content_type: 'comment', title: '全服炸服', body: '恭喜' }, { body: '', media: ['image.png'] }, { body: '酒馆刷到红轴' }]);
  assert.equal(calls, 1);
  assert.deepEqual(output.map(result => result.topics[0]), ['简短互动', '图片分享·文字不足', '酒馆收益']);
});
test('invalid topic-only answers fail without producing fabricated classifications', async () => {
  let released = false;
  const client = { model: 'test', acquire: async () => {}, release() { released = true; }, key: () => 'test', request: async () => ({ answers: {} }) };
  await assert.rejects(new TypeSafeTopicAnalyzer({}, { client }).classify([{ body: '你好' }]), { code: 'TYPESAFE_TOPIC_INVALID_RESPONSE' });
  assert.equal(released, true);
});
test('topic backfill changes only topics and audits atomically; rollback on invariant failure', async () => {
  for (const corrupt of [false, true]) {
    const before = { id: 'a', content_id: 'c', content_fingerprint: 'fp', topics: '[]', sentiment: 'negative', severity: 'urgent', analyzed_at: '2026-10-14 12:00:00', risk_context: '{"existing":"reason"}' };
    let stored = { ...before }, committed = false, rolledBack = false, audited = false, backedUp = false;
    const conn = { async beginTransaction() {}, async query(sql, args) {
      if (sql.startsWith('SELECT fingerprint')) return [[{ fingerprint: 'fp' }]];
      if (sql.startsWith('SELECT *')) return [[{ ...stored }]];
      if (sql.startsWith('UPDATE')) { stored.topics = args[0]; if (corrupt) stored.severity = 'normal'; return [{ affectedRows: 1 }]; }
      if (sql.startsWith('INSERT')) { audited = true; return [{ affectedRows: 1 }]; }
      throw new Error('Unexpected query');
    }, async commit() { committed = true; }, async rollback() { rolledBack = true; }, release() {} };
    const operation = updateTopic({ pool: { getConnection: async () => conn } }, { ...before, fingerprint: 'fp' }, { topics: ['功能异常'], confidence: .9 }, () => { backedUp = true; });
    if (corrupt) { await assert.rejects(operation, { code: 'TOPIC_INVARIANT_VIOLATION' }); assert.equal(committed, false); assert.equal(rolledBack, true); assert.equal(audited, false); }
    else { assert.equal(await operation, true); assert.equal(invariant(stored), invariant(before)); assert.equal(committed, true); assert.equal(audited, true); }
    assert.equal(backedUp, true);
  }
});
test('backfill selects only missing or other topics and skips changed content fingerprints', async () => {
  assert.equal(needsTopic('["酒馆收益"]'), false);
  assert.equal(needsTopic('["其他"]'), true);
  assert.equal(needsTopic('[]'), true);
  let mutated = false, rolledBack = false;
  const conn = { async beginTransaction() {}, async query(sql) {
    if (sql.startsWith('SELECT fingerprint')) return [[{ fingerprint: 'new' }]];
    if (sql.startsWith('SELECT *')) return [[{ id: 'a', topics: '[]', content_fingerprint: 'old' }]];
    mutated = true;
  }, async rollback() { rolledBack = true; }, release() {} };
  assert.equal(await updateTopic({ pool: { getConnection: async () => conn } }, { id: 'a', content_id: 'c', fingerprint: 'old' }, { topics: ['功能异常'] }, () => {}), false);
  assert.equal(mutated, false); assert.equal(rolledBack, true);
});
