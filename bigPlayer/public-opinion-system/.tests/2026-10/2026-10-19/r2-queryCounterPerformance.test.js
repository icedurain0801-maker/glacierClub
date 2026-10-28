const test = require('node:test');
const assert = require('node:assert/strict');
const { Repository } = require('E:/CodexData/public-opinion/releases/release-20261019-risk-list-date-r2/server/src/db/repository');

function fixture(rows = []) {
  const calls = [];
  const repo = Object.create(Repository.prototype);
  repo.query = async (sql, values) => { calls.push({ sql, values }); return rows; };
  return { repo, calls };
}

test('broad scope counters scan clustered contents and use covered analysis fields', async () => {
  const { repo, calls } = fixture([{ total: 12 }]);
  assert.equal(await repo.countContents({ communityId: 'community', platform: 'bigplayer_h5', sentiment: 'neutral' }), 12);
  assert.match(calls[0].sql, /SELECT STRAIGHT_JOIN COUNT/);
  assert.match(calls[0].sql, /po_contents c FORCE INDEX \(PRIMARY\)/);
  assert.match(calls[0].sql, /po_analyses a FORCE INDEX \(po_analyses_sentiment_cover_idx\)/);
  assert.deepEqual(calls[0].values, ['community', 'neutral', 'bigplayer_h5']);
  assert.match(calls[0].sql, /c\.is_deleted=0/);
});

test('urgent counters preserve fingerprint review and selective date/id plans', async () => {
  const { repo, calls } = fixture([{ total: 2 }]);
  await repo.countContents({ riskMode: 'urgent', communityId: 'community', publishedFrom: '2026-10-15 00:00:00', handlingStatus: 'pending' });
  assert.doesNotMatch(calls[0].sql, /po_analyses a FORCE INDEX/);
  assert.match(calls[0].sql, /counter_analysis\.severity IN \('negative','urgent'\)/);
  assert.match(calls[0].sql, /a\.content_id=counter_analysis\.content_id/);
  assert.match(calls[0].sql, /SELECT STRAIGHT_JOIN COUNT/);
  assert.match(calls[0].sql, /po_contents c FORCE INDEX \(po_contents_community_time_idx\)/);
  assert.match(calls[0].sql, /urgentReview\.status/);
  assert.match(calls[0].sql, /NOT EXISTS \(SELECT 1 FROM po_content_handlings/);
  assert.match(calls[0].sql, /c\.published_at>=\?/);
  await repo.countContents({ postId: 'exact-id', communityId: 'community' });
  assert.doesNotMatch(calls[1].sql, /FORCE INDEX \(PRIMARY\)/);
  assert(calls[1].values.includes('exact-id'));
});

test('date counters use a matching scope index without changing predicates or values', async () => {
  for (const [scope, index] of [
    [{ communityId: 'community' }, 'po_contents_community_time_idx'],
    [{ sourceId: 'source' }, 'po_contents_source_time_idx'],
    [{ accountId: 'account' }, 'po_contents_account_time_idx'],
    [{ gameId: 'game' }, 'po_contents_game_time_idx'],
    [{}, 'po_contents_published_time_idx']
  ]) {
    const { repo, calls } = fixture([{ total: 164 }]);
    const from = '2026-10-18 16:00:00';
    const to = '2026-10-19 16:00:00';
    assert.equal(await repo.countContents({ ...scope, publishedFrom: from, publishedTo: to, contentType: 'post' }), 164);
    assert(calls[0].sql.includes(`po_contents c FORCE INDEX (${index})`));
    assert.match(calls[0].sql, /c\.published_at>=\?/);
    assert.match(calls[0].sql, /c\.published_at<\?/);
    assert.match(calls[0].sql, /c\.is_deleted=0/);
    assert.deepEqual(calls[0].values.slice(-2), [from, to]);
  }
});

test('date counter hints preserve exact content/post and small analysis-job lookups', async () => {
  const { repo, calls } = fixture([{ total: 1 }]);
  for (const exact of [{ contentId: 'content' }, { postId: 'post' }]) {
    await repo.countContents({ ...exact, communityId: 'community', publishedFrom: '2026-10-18 16:00:00' });
    assert.doesNotMatch(calls.at(-1).sql, /po_contents c FORCE INDEX/);
  }
  repo.query = async (sql, values) => {
    calls.push({ sql, values });
    return sql.startsWith('SELECT DISTINCT content_id') ? [{ content_id: 'failed-content' }] : [{ total: 1 }];
  };
  await repo.countContents({ communityId: 'community', analysisStatus: 'failed', publishedTo: '2026-10-19 16:00:00' });
  assert.doesNotMatch(calls.at(-1).sql, /po_contents c FORCE INDEX/);
  assert.match(calls.at(-1).sql, /c\.id IN \(\?\)/);
});

test('unknown severity remains a bound value and cannot enter index prefilter SQL', async () => {
  const { repo, calls } = fixture([{ total: 0 }]);
  const severity = "urgent') OR 1=1 --";
  await repo.countContents({ severity, communityId: 'community', analysisLevel: 'light' });
  assert.doesNotMatch(calls[0].sql, /OR 1=1/);
  assert(calls[0].values.includes(severity));
});

test('stats coalesce synonymous risk counts only within one response', async () => {
  const { repo } = fixture();
  let calls = 0;
  repo.countContents = async () => ++calls;
  const result = await repo.getContentStats({ communityId: 'community' }, { includeBreakdown: true });
  assert.equal(calls, 8);
  assert.equal(result.negative, result.urgent);
  assert.equal(result.negativePostCount, result.urgentPostCount);
  assert.equal(result.negativeCommentCount, result.urgentCommentCount);
  await repo.getContentStats({ communityId: 'community' }, { includeBreakdown: true });
  assert.equal(calls, 16);
});

test('progress materializes non-null content ids and retains global orphan alarms', async () => {
  const { repo, calls } = fixture();
  repo.query = async (sql, values) => {
    calls.push({ sql, values });
    if (sql.includes('all_statuses')) return [{ count: 3, all_active: 4, all_statuses: 5, oldest_created_at: '2026-10-01 00:00:00' }];
    if (sql.includes('REFERENTIAL_CONSTRAINTS')) return [{ DELETE_RULE: 'CASCADE' }];
    return [{ status: 'completed', count: 7, completed_last_5m: 2 }];
  };
  const result = await repo.countAnalysisJobs({ profile: 'light', version: 'v11', communityId: 'community' });
  assert.match(calls[1].sql, /j\.content_id NOT IN \(SELECT id FROM po_contents\)/);
  assert.deepEqual(calls[1].values, ['light', 'v11', 'light', 'v11']);
  assert.equal(result.completed, 7);
  assert.equal(result.orphanAnalysisJobs, 3);
  assert.equal(result.orphanAnalysisJobsAllProfiles, 4);
  assert.equal(result.orphanAnalysisJobsAllStatuses, 5);
  assert.equal(result.analysisIntegrityAlarm, true);
  assert.equal(result.completionRate, 100);
});
