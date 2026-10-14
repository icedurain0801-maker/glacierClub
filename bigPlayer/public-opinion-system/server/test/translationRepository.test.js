const test = require('node:test');
const assert = require('node:assert/strict');
const { Repository } = require('../src/db/repository');

const translation = {
  sourceLanguage: 'en',
  translatedTitle: '你好',
  translatedBody: '世界',
  modelName: 'translation-model',
  usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 }
};

function createRepository(currentOwner = 'lease-new', leaseValid = true) {
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' });
  const calls = [];
  const conn = {
    async beginTransaction() { calls.push({ type: 'begin' }); },
    async commit() { calls.push({ type: 'commit' }); },
    async rollback() { calls.push({ type: 'rollback' }); },
    release() { calls.push({ type: 'release' }); },
    async query(sql, params = []) {
      calls.push({ type: 'query', sql, params });
      if (sql.startsWith('SELECT j.content_id')) {
        return [params[1] === currentOwner && leaseValid ? [{ content_id: 'c1', target_language: 'zh-CN', translation_version: 'translation-v1', content_fingerprint: 'fp1' }] : []];
      }
      if (sql.startsWith('UPDATE po_translation_jobs')) return [{ affectedRows: 1 }];
      return [{ affectedRows: 1 }];
    }
  };
  repo.pool = { async getConnection() { return conn; } };
  return { repo, calls };
}

test('有效租约在同一事务内写译文并完成任务', async () => {
  const { repo, calls } = createRepository();
  assert.equal(await repo.completeTranslationJob('j1', { leaseOwner: 'lease-new', translation }), true);

  const leaseCheck = calls.find(call => call.type === 'query' && call.sql.startsWith('SELECT j.content_id'));
  assert.match(leaseCheck.sql, /lease_until>NOW\(\)/);
  assert.match(leaseCheck.sql, /j\.content_fingerprint=c\.fingerprint/);
  assert.deepEqual(leaseCheck.params, ['j1', 'lease-new']);
  const insert = calls.find(call => call.type === 'query' && call.sql.startsWith('INSERT INTO po_content_translations'));
  assert.ok(insert.params.includes('世界'));
  assert.ok(insert.params.includes('fp1'));
  assert.deepEqual(calls.filter(call => call.type === 'commit').length, 1);
  assert.equal(calls.some(call => call.type === 'rollback'), false);
});

test('过期或错误 owner 不写译文也不完成任务', async () => {
  for (const { staleOwner, currentOwner, leaseValid } of [
    { staleOwner: 'lease-current', currentOwner: 'lease-current', leaseValid: false },
    { staleOwner: 'lease-wrong', currentOwner: 'lease-current', leaseValid: true }
  ]) {
    const { repo, calls } = createRepository(currentOwner, leaseValid);
    assert.equal(await repo.completeTranslationJob('j1', { leaseOwner: staleOwner, translation }), false);
    assert.equal(calls.some(call => call.type === 'query' && call.sql.startsWith('INSERT INTO po_content_translations')), false);
    assert.equal(calls.some(call => call.type === 'query' && call.sql.startsWith('UPDATE po_translation_jobs')), false);
    assert.equal(calls.filter(call => call.type === 'rollback').length, 1);
  }
});

test('任务重新认领后旧 owner 不覆盖新 owner 译文', async () => {
  const { repo, calls } = createRepository('lease-new');
  assert.equal(await repo.completeTranslationJob('j1', { leaseOwner: 'lease-old', translation: { ...translation, translatedBody: '旧译文' } }), false);
  assert.equal(await repo.completeTranslationJob('j1', { leaseOwner: 'lease-new', translation: { ...translation, translatedBody: '新译文' } }), true);

  const inserts = calls.filter(call => call.type === 'query' && call.sql.startsWith('INSERT INTO po_content_translations'));
  assert.equal(inserts.length, 1);
  assert.ok(inserts[0].params.includes('新译文'));
  assert.equal(inserts[0].params.includes('旧译文'), false);
});
