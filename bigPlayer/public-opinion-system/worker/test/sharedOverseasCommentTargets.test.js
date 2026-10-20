const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSharedCommentTargets } = require('../src/sharedOverseasCommentTargets');
const account = { id: 'a', source_id: 's', game_id: 'g', community_id: 'c' };
const site = { siteId: 'one', url: 'https://club-en.q1.com/?languageId=2' };
const source = { id: 's', game_id: 'g', community_id: 'c', platform: 'bigplayer_h5', region_code: 'overseas', config: { boardId: '100017', siteUrls: [site] } };
const row = { id: 'p', external_id: '123', source_id: 's', account_id: 'a', game_id: 'g', community_id: 'c', content_depth: 0, raw_payload: { boardId: '100017' }, known_site: 'one' };
test('single-site scheduled run resolves saved site without child context', async () => {
  assert.deepEqual(await loadSharedCommentTargets({ query: async () => [row] }, source, account), ['123']);
});
test('multiple sites still require an explicit authorized site', async () => {
  const multi = { ...source, config: { ...source.config, siteUrls: [site, { siteId: 'two', url: 'https://club-en.q1.com/?languageId=9' }] } };
  await assert.rejects(loadSharedCommentTargets({ query: async () => { throw Error('must not query'); } }, multi, account), { code: 'OVERSEAS_COMMENT_SITE_SCOPE_INVALID' });
  assert.deepEqual(await loadSharedCommentTargets({ query: async () => [row] }, { ...multi, siteId: 'two' }, account), []);
});
test('explicit wrong site and cross-board parents remain rejected', async () => {
  await assert.rejects(loadSharedCommentTargets({}, { ...source, siteId: 'wrong' }, account), { code: 'OVERSEAS_COMMENT_SITE_SCOPE_INVALID' });
  await assert.rejects(loadSharedCommentTargets({ query: async () => [{ ...row, raw_payload: { boardId: '100016' } }] }, source, account), { code: 'OVERSEAS_COMMENT_PARENT_SCOPE_CONFLICT' });
});
