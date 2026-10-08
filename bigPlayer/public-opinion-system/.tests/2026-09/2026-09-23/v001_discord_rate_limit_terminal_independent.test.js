const test = require('node:test');
const assert = require('node:assert/strict');

const { runSource, rateLimitRetry } = require('../../../worker/src/worker');
const { ConnectorPageError } = require('../../../server/src/connectors/baseConnector');
const { Repository } = require('../../../server/src/db/repository');

const source = {
  id: 'discord-source',
  account_id: 'discord-account',
  game_id: 'game-1',
  community_id: 'community-1',
  region_code: 'overseas',
  platform: 'discord',
  display_name: 'Discord'
};

function workerCase(attempts) {
  const deferred = [];
  const finished = [];
  const account = { id: source.account_id, source_id: source.id, game_id: source.game_id, metadata: {} };
  const repo = {
    async createRun() { return { id: `collection-${attempts}` }; },
    async finishRun() {},
    async markSourceRun() {},
    async updateSourceAuth() {},
    async getDefaultAccount() { return account; },
    async updateAccount() {},
    async claimSyncRun() {
      return {
        id: `sync-${attempts}`,
        sync_mode: 'backfill',
        trigger_type: 'manual',
        attempts,
        lease_owner: 'qa-worker:claim',
        lease_epoch: 7
      };
    },
    async deferSyncRun(id, patch) {
      deferred.push({ id, ...patch });
      return { id, status: 'queued' };
    },
    async finishSyncRun(id, patch) {
      finished.push({ id, ...patch });
      return { id, status: patch.status };
    },
    async claimSyncCheckpoint() { return { id: `checkpoint-${attempts}`, cursor: null }; },
    async releaseSyncCheckpoint() {},
    async listSyncParents() { return []; }
  };
  const cause = Object.assign(new Error('Discord API request failed with status 429'), {
    code: 'RATE_LIMITED',
    details: { retryAfterMs: 1000 }
  });
  const connector = {
    async installationHealth() { return { installed: true, configured: true }; },
    hasSourceCapability() { return false; },
    async listOwnedContents() {
      throw new ConnectorPageError('discord', 'owned_content', 1, cause);
    }
  };
  return {
    deferred,
    finished,
    run: () => runSource({
      repo,
      connectors: { discord: connector },
      credentialContext: { async load() { return { apiToken: 'qa-only' }; } },
      ai: {},
      alertEngine: {},
      leaseOwner: 'qa-worker',
      leaseSeconds: 60,
      pageBudget: 1,
      pageSize: 100
    }, source, { id: `sync-${attempts}`, account_id: account.id, sync_mode: 'backfill' })
  };
}

test('attempt 4 keeps the Discord rate-limited run queued with its original backoff path', async () => {
  const boundary = rateLimitRetry({ code: 'RATE_LIMITED', retryAfterMs: 1000 }, { attempts: 4 }, 0);
  assert.equal(boundary.terminal, false);
  assert.equal(boundary.nextRetryAt, '1970-01-01T00:00:01.000Z');

  const scenario = workerCase(4);
  await scenario.run();
  assert.equal(scenario.finished.length, 0);
  assert.equal(scenario.deferred.length, 1);
  assert.equal(scenario.deferred[0].errorCode, 'RATE_LIMITED');
  assert.ok(scenario.deferred[0].nextRetryAt);
});

for (const attempts of [5, 99]) {
  test(`attempt ${attempts} is terminal failed and never requeued`, async () => {
    const boundary = rateLimitRetry({ code: 'RATE_LIMITED', retryAfterMs: 1000 }, { attempts });
    assert.equal(boundary.terminal, true);
    assert.equal(boundary.errorCode, 'RATE_LIMITED_MAX_ATTEMPTS');
    assert.equal(boundary.nextRetryAt, null);

    const scenario = workerCase(attempts);
    await scenario.run();
    assert.equal(scenario.deferred.length, 0);
    assert.equal(scenario.finished.length, 1);
    assert.equal(scenario.finished[0].status, 'failed');
    assert.equal(scenario.finished[0].errorCode, 'RATE_LIMITED_MAX_ATTEMPTS');
    assert.equal(scenario.finished[0].nextRetryAt, null);
  });
}

test('non-RATE_LIMITED failures keep the existing non-retry classification', () => {
  const result = rateLimitRetry({ code: 'MALFORMED_RESPONSE' }, { attempts: 99 }, 0);
  assert.deepEqual(result, { nextRetryAt: null, auditSuffix: '' });
});

test('terminal persistence releases the lease and restart scans cannot select failed runs', async () => {
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'qa_never_connects' });
  const calls = [];
  repo.query = async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.startsWith('UPDATE po_sync_runs')) return { affectedRows: 1 };
    if (sql.startsWith('SELECT r.')) return [{ id: 'sync-5', status: 'failed' }];
    return [];
  };

  await repo.finishSyncRun('sync-5', {
    status: 'failed',
    errorCode: 'RATE_LIMITED_MAX_ATTEMPTS',
    errorMessage: 'max attempts reached',
    nextRetryAt: null,
    leaseOwner: 'qa-worker:claim',
    leaseEpoch: 7
  });
  const finish = calls[0];
  assert.match(finish.sql, /next_retry_at=\?/);
  assert.match(finish.sql, /lease_owner=NULL, lease_until=NULL/);
  assert.deepEqual(finish.params.slice(0, 7), [
    'failed', null, null, 'RATE_LIMITED_MAX_ATTEMPTS', 'max attempts reached', null, 'sync-5'
  ]);

  calls.length = 0;
  await repo.listRunnableSyncRuns({ limit: 10 });
  const restartScan = calls[0].sql;
  assert.match(restartScan, /r\.status='queued' OR \(r\.status='running'/);
  assert.doesNotMatch(restartScan, /r\.status='failed'/);

  calls.length = 0;
  await repo.claimSyncRun({ runId: 'sync-5', leaseOwner: 'qa-worker:restart', leaseSeconds: 60 });
  const restartClaim = calls[0].sql;
  assert.match(restartClaim, /status='queued' OR \(status='running'/);
  assert.doesNotMatch(restartClaim, /status='failed'/);
});
