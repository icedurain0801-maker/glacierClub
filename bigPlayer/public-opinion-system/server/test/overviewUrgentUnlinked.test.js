const test = require('node:test');
const assert = require('node:assert/strict');
const { Repository } = require('../src/db/repository');

test('overview includes urgent contents without events as read-only rows in the same scope', async () => {
  const repo = Object.create(Repository.prototype);
  const calls = [];
  repo.query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('NOT EXISTS (SELECT 1 FROM po_alert_contents link')) {
      return sql.startsWith('SELECT COUNT') ? [{ total: 1 }] : [{ id: 'unlinked', severity: 'urgent', content_type: 'comment' }];
    }
    return [];
  };
  repo.getContentStats = async () => ({ post: 0, comment: 1, urgent: 1 });
  repo.listContents = async () => [];
  const result = await repo.getOverview({ regionCode: 'overseas', gameId: 'game', communityId: 'community', sourceId: 'source', platform: 'bigplayer_h5', from: '2026-10-10T16:00:00Z', to: '2026-10-11T16:00:00Z' });
  assert.equal(result.metrics.urgent, 1);
  assert.equal(result.metrics.urgentUnlinkedTotal, 1);
  assert.equal(result.activeAlerts.length, 0);
  assert.equal(result.urgentUnlinkedContents[0].id, 'unlinked');
  for (const call of calls.filter(c => c.sql.includes('po_alert_contents link'))) {
    assert.match(call.sql, /an\.sentiment IN \('neutral','negative'\)/);
    assert.match(call.sql, /an\.severity='urgent'/);
    assert.match(call.sql, /COALESCE\(c\.is_deleted,0\)=0/);
    assert.deepEqual(call.params, ['overseas', 'game', 'community', 'source', 'bigplayer_h5', '2026-10-10T16:00:00Z', '2026-10-11T16:00:00Z']);
  }
  assert.ok(calls.every(c => c.sql.startsWith('SELECT')));
});

test('overview does not load fallback rows when no urgent content lacks event association', async () => {
  const repo = Object.create(Repository.prototype);
  const calls = [];
  repo.query = async sql => { calls.push(sql); return sql.includes('NOT EXISTS (SELECT 1 FROM po_alert_contents link') ? [{ total: 0 }] : []; };
  repo.getContentStats = async () => ({ post: 1, comment: 0, urgent: 0 });
  repo.listContents = async () => [];
  const result = await repo.getOverview({ communityId: 'community' });
  assert.deepEqual(result.urgentUnlinkedContents, []);
  assert.equal(result.metrics.urgentUnlinkedTotal, 0);
  assert.equal(calls.filter(sql => sql.includes('po_alert_contents link')).length, 1);
});
