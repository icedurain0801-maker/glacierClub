const test = require('node:test');
const assert = require('node:assert/strict');
const { Repository } = require('../src/db/repository');

function schedulerRepo(rows = []) {
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' });
  repo.calls = [];
  repo.query = async (sql, params = []) => {
    repo.calls.push({ sql, params });
    return rows;
  };
  return repo;
}

test('listDueSources throttles a failed attempt by source frequency', async () => {
  const repo = schedulerRepo();

  await repo.listDueSources(new Date('2026-09-11T10:01:00Z'));

  const { sql } = repo.calls[0];
  assert.match(sql, /MAX\(CASE WHEN r\.started_at IS NOT NULL THEN COALESCE\(r\.finished_at,r\.started_at\) ELSE NULL END\) AS last_attempt_at/);
  assert.match(sql, /GREATEST\(s\.last_success_at,\s*run_state\.last_attempt_at\)/);
  assert.match(sql, /INTERVAL s\.frequency_seconds SECOND/);
  assert.doesNotMatch(sql, /\(s\.last_success_at IS NULL OR s\.last_success_at <=/);
});

test('listDueSources excludes a source with a queued or running sync run', async () => {
  const repo = schedulerRepo();

  await repo.listDueSources();

  const { sql } = repo.calls[0];
  assert.match(sql, /r\.status IN \('queued','running'\)/);
  assert.match(sql, /COALESCE\(run_state\.has_active_run,0\)=0/);
});
