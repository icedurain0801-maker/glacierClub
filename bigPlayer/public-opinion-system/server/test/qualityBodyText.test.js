const { test } = require('node:test');
const assert = require('node:assert/strict');
const { qualityBodyLength } = require('../src/services/qualityBodyText');

const cases = [
  ['screenshot regression', '圣物还是重要啊\nhttps://opsoss.q1.com/club/images/2026/10/10/photo.png', 7],
  ['49 real characters plus image', '字'.repeat(49) + ' https://cdn.test/image.png', 49],
  ['50 real characters plus link and tags', '<p>' + '字'.repeat(50) + '</p><img src="https://cdn.test/image.png">https://example.com/a', 50],
  ['link label remains', '<a href="https://example.com">正文</a>', 2],
  ['URL variants and empty markup', 'HTTPS://example.com/a\nwww.example.com <b></b>&nbsp;', 0],
  ['script style and comments are not prose', '<script>alert(1)</script><style>p{color:red}</style><!--comment-->正文', 2],
  ['Unicode code points', '𠮷'.repeat(50), 50],
  ['missing body', null, 0]
];
for (const [name, body, length] of cases) test(name, () => assert.equal(qualityBodyLength(body), length));

test('candidate admission excludes short body without removing review records', async () => {
  const { Repository } = require('../src/db/repository');
  const repo = new Repository({});
  repo.query = async () => { throw new Error('short body must not write or delete review records'); };
  assert.equal(await repo.upsertQualityCandidate('regression', { body: cases[0][1], qualityScore: 0.9, recommendFeature: true }), null);
});

test('worker callers without body use stored prose for admission', async () => {
  const { Repository } = require('../src/db/repository');
  const repo = new Repository({});
  const calls = [];
  repo.query = async sql => { calls.push(sql); return sql.startsWith('SELECT body') ? [{ body: '字'.repeat(50) }] : []; };
  await repo.upsertQualityCandidate('stored', { qualityScore: 0.7, recommendFeature: true });
  assert(calls.some(sql => sql.startsWith('INSERT INTO po_quality_candidates')));
  calls.length = 0;
  repo.query = async sql => { calls.push(sql); return [{ body: '字'.repeat(49) + ' https://example.com/image.png' }]; };
  assert.equal(await repo.upsertQualityCandidate('short-stored', { qualityScore: 0.9, recommendFeature: true }), null);
  assert.equal(calls.length, 1);
});

module.exports = { cases };
