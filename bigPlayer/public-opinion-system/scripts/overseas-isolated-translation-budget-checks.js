'use strict';
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { canonical } = require('../worker/src/overseasBigPlayerRunContractJournal');
const { createControlledManifest } = require('../worker/src/overseasControlledManifest');
const { createScheduledIsolatedTarget } = require('../server/src/db/overseasScheduledIsolatedTarget');
const { statements, createIsolatedCallBudget } = require('../server/src/db/overseasIsolatedCallBudget');

async function checkTranslationCallBudget({repo, control, root, directory, serverPid, sourceId, accountId, gameId, communityId, reproduction = false}) {
  const isolation = createScheduledIsolatedTarget({repo, repositoryRoot: root, directory, serverPid});
  await isolation.verifyConnection(control);
  // Own fresh fixture; never append to the exhausted analysis/day-rekey mode.
  for (const sql of statements) await control.query(sql);
  const identity = {sourceId, accountId, gameId, communityId, windowStart: '2026-01-01T00:00:00.000Z', windowEnd: '2026-01-02T00:00:00.000Z'};
  const tuple = {contentId: crypto.randomUUID(), jobId: crypto.randomUUID(), fingerprint: 'c'.repeat(64), targetLanguage: 'zh-CN', version: 'translation-fixture-v1'};
  await control.query("INSERT INTO po_contents(id,game_id,community_id,source_id,account_id,external_id,fingerprint,published_at) VALUES (?,?,?,?,?,?,?,'2026-01-01 01:00:00')", [tuple.contentId, gameId, communityId, sourceId, accountId, 'fixture-translation-budget', tuple.fingerprint]);
  await control.query('INSERT INTO po_translation_jobs(id,content_id,target_language,translation_version,content_fingerprint) VALUES (?,?,?,?,?)', [tuple.jobId, tuple.contentId, tuple.targetLanguage, tuple.version, tuple.fingerprint]);
  const manifest = createControlledManifest({kind: 'translation', identity, tuples: [tuple]});
  const make = (dailyCap = 4, scopeCap = 4) => createIsolatedCallBudget({repo, isolation, dailyCap, scopeCap});
  const request = callId => ({manifest, identity, tuple, callId});
  const checks = [], negativeEvidence = [];
  const tables = ['po_fixture_call_manifests', 'po_fixture_call_budgets', 'po_fixture_calls', 'po_fixture_disabled_outbox', 'po_translation_jobs', 'po_contents', 'po_sources', 'po_games', 'po_communities'];
  const snapshot = async () => {
    await isolation.verifyConnection(control);
    return canonical(await Promise.all(tables.map(async table => (await control.query(`SELECT * FROM ${table} ORDER BY 1,2`))[0])));
  };
  async function rejectZeroWrites(label, work, code) {
    const before = await snapshot();
    await assert.rejects(work, error => error.code === code, label);
    assert.equal(await snapshot(), before, `${label}: durable writes`);
    checks.push(label); negativeEvidence.push({label, errorCode: code, zeroWrites: true});
  }
  const receipt = await make().reserve(request(crypto.randomUUID()));
  assert.equal(receipt.durable, true);
  if (reproduction) {
    await isolation.verifyConnection(control);
    const [changed] = await control.query('UPDATE po_fixture_call_budgets SET used=-1 WHERE budget_day=UTC_DATE()');
    assert.equal(changed.affectedRows, 1);
    const result = await make().consumeFake({manifest, identity, tuple, receipt});
    const [budgets] = await control.query('SELECT cap,used,budget_day FROM po_fixture_call_budgets ORDER BY scope_sha,budget_day');
    const [outbox] = await control.query('SELECT * FROM po_fixture_disabled_outbox');
    assert.equal(result.status, 'fake_consumed');
    assert.ok(budgets.some(row => Number(row.used) === -1));
    assert.equal(outbox.length, 1); assert.equal(outbox[0].status, 'disabled');
    return {status: 'REPRODUCED_ISOLATED_TRANSLATION_BUDGET_CORRUPTION', result, budgets, observedCorruptBudgetAccepted: true, syntheticDisabledOutbox: 1, controllerInjectedUsed: -1, fixtureRestored: false, translationJobExecuted: false, realAiExecuted: false, realHttpExecuted: false, realNotificationExecuted: false, productionActivationAllowed: false};
  }
  const clean = await snapshot();
  async function drift(label, sql, changed, restored, code) {
    await isolation.verifyConnection(control); await control.query(sql, changed);
    try {
      await rejectZeroWrites(`${label}_reserve`, () => make().reserve(request(crypto.randomUUID())), code);
      await rejectZeroWrites(`${label}_consume`, () => make().consumeFake({manifest, identity, tuple, receipt}), code);
    } finally { await isolation.verifyConnection(control); await control.query(sql, restored); }
    assert.equal(await snapshot(), clean, `${label}: incomplete restoration`);
  }
  await drift('translation_version', 'UPDATE po_translation_jobs SET translation_version=? WHERE id=?', ['translation-fixture-v2', tuple.jobId], [tuple.version, tuple.jobId], 'ISOLATED_CALL_JOB_CHANGED');
  await drift('target_language', 'UPDATE po_translation_jobs SET target_language=? WHERE id=?', ['en', tuple.jobId], [tuple.targetLanguage, tuple.jobId], 'ISOLATED_CALL_JOB_CHANGED');
  await drift('job_fingerprint', 'UPDATE po_translation_jobs SET content_fingerprint=? WHERE id=?', ['d'.repeat(64), tuple.jobId], [tuple.fingerprint, tuple.jobId], 'ISOLATED_CALL_JOB_CHANGED');
  await drift('job_status', 'UPDATE po_translation_jobs SET status=? WHERE id=?', ['running', tuple.jobId], ['pending', tuple.jobId], 'ISOLATED_CALL_JOB_CHANGED');
  await drift('content_fingerprint', 'UPDATE po_contents SET fingerprint=? WHERE id=?', ['d'.repeat(64), tuple.contentId], [tuple.fingerprint, tuple.contentId], 'ISOLATED_CALL_CONTENT_CHANGED');
  await drift('content_deleted', 'UPDATE po_contents SET is_deleted=? WHERE id=?', [1, tuple.contentId], [0, tuple.contentId], 'ISOLATED_CALL_CONTENT_CHANGED');
  await drift('content_window', 'UPDATE po_contents SET published_at=? WHERE id=?', ['2026-01-02 00:00:00', tuple.contentId], ['2026-01-01 01:00:00', tuple.contentId], 'ISOLATED_CALL_WINDOW_CHANGED');
  const [[storedManifest]] = await control.query('SELECT body FROM po_fixture_call_manifests WHERE manifest_sha=?', [manifest.manifestSha256]);
  await drift('manifest_body', 'UPDATE po_fixture_call_manifests SET body=? WHERE manifest_sha=?', ['{}', manifest.manifestSha256], [storedManifest.body, manifest.manifestSha256], 'ISOLATED_CALL_MANIFEST_CHANGED');
  for (const [label, dailyCap, scopeCap] of [['configured_global_cap', 5, 4], ['configured_scope_cap', 4, 5]]) {
    await rejectZeroWrites(`${label}_reserve`, () => make(dailyCap, scopeCap).reserve(request(crypto.randomUUID())), 'ISOLATED_CALL_CAP_CHANGED');
    await rejectZeroWrites(`${label}_consume`, () => make(dailyCap, scopeCap).consumeFake({manifest, identity, tuple, receipt}), 'ISOLATED_CALL_CAP_CHANGED');
  }
  for (const [label, predicate] of [['persisted_global_cap', 'budget_day=UTC_DATE()'], ['persisted_scope_cap', "budget_day='1970-01-01'"]]) {
    // Predicates are fixed fixture literals, never caller-controlled SQL.
    await isolation.verifyConnection(control);
    await control.query(`UPDATE po_fixture_call_budgets SET cap=5 WHERE ${predicate}`);
    try {
      await rejectZeroWrites(`${label}_reserve`, () => make().reserve(request(crypto.randomUUID())), 'ISOLATED_CALL_CAP_CHANGED');
      await rejectZeroWrites(`${label}_consume`, () => make().consumeFake({manifest, identity, tuple, receipt}), 'ISOLATED_CALL_CAP_CHANGED');
    } finally { await isolation.verifyConnection(control); await control.query(`UPDATE po_fixture_call_budgets SET cap=4 WHERE ${predicate}`); }
    assert.equal(await snapshot(), clean, `${label}: incomplete restoration`);
  }
  for (const [label, predicate] of [['persisted_global_used', 'budget_day=UTC_DATE()'], ['persisted_scope_used', "budget_day='1970-01-01'"]]) {
    for (const used of [-1, 5]) {
      await isolation.verifyConnection(control);
      const [changed] = await control.query(`UPDATE po_fixture_call_budgets SET used=? WHERE ${predicate}`, [used]);
      assert.equal(changed.affectedRows, 1);
      try {
        await rejectZeroWrites(`${label}_${used}_reserve`, () => make().reserve(request(crypto.randomUUID())), 'ISOLATED_CALL_BUDGET_CORRUPT');
        await rejectZeroWrites(`${label}_${used}_consume`, () => make().consumeFake({manifest, identity, tuple, receipt}), 'ISOLATED_CALL_BUDGET_CORRUPT');
      } finally { await isolation.verifyConnection(control); await control.query(`UPDATE po_fixture_call_budgets SET used=1 WHERE ${predicate}`); }
      assert.equal(await snapshot(), clean, `${label}: incomplete restoration`);
    }
  }
  for (const [field, value] of [['jobId', crypto.randomUUID()], ['contentId', crypto.randomUUID()], ['fingerprint', 'd'.repeat(64)], ['version', 'translation-fixture-v2'], ['targetLanguage', 'en']]) {
    const changed = {...tuple, [field]: value};
    await rejectZeroWrites(`tuple_${field}_reserve`, () => make().reserve({manifest, identity, tuple: changed, callId: crypto.randomUUID()}), 'OVERSEAS_CONTROLLED_POLICY_REJECTED');
    await rejectZeroWrites(`tuple_${field}_consume`, () => make().consumeFake({manifest, identity, tuple: changed, receipt}), 'OVERSEAS_CONTROLLED_POLICY_REJECTED');
  }
  await rejectZeroWrites('manifest_copy_reserve', () => make().reserve({...request(crypto.randomUUID()), manifest: {...manifest}}), 'OVERSEAS_CONTROLLED_POLICY_REJECTED');
  await rejectZeroWrites('manifest_copy_consume', () => make().consumeFake({manifest: {...manifest}, identity, tuple, receipt}), 'OVERSEAS_CONTROLLED_POLICY_REJECTED');
  // Reach the cap through real reservations; a prepaid receipt remains valid.
  for (let i = 0; i < 3; i++) assert.equal((await make().reserve(request(crypto.randomUUID()))).status, 'reserved');
  await rejectZeroWrites('reserve_at_cap', () => make().reserve(request(crypto.randomUUID())), 'ISOLATED_CALL_BUDGET_EXHAUSTED');
  const consumed = await make().consumeFake({manifest, identity, tuple, receipt});
  assert.equal(consumed.status, 'fake_consumed'); assert.equal(consumed.externalDeliveryAttempted, false);
  await rejectZeroWrites('consumption_replay', () => make().consumeFake({manifest, identity, tuple, receipt}), 'ISOLATED_CALL_NOT_RESERVED');
  const [budgets] = await control.query('SELECT cap,used FROM po_fixture_call_budgets ORDER BY scope_sha,budget_day');
  assert.equal(budgets.length, 2); assert.ok(budgets.every(row => Number(row.cap) === 4 && Number(row.used) === 4));
  const [outbox] = await control.query('SELECT * FROM po_fixture_disabled_outbox');
  assert.equal(outbox.length, 1); assert.equal(outbox[0].job_id, tuple.jobId); assert.equal(outbox[0].status, 'disabled');
  const [[job]] = await control.query('SELECT * FROM po_translation_jobs WHERE id=?', [tuple.jobId]);
  assert.equal(job.status, 'pending'); assert.equal(Number(job.attempts), 0);
  return {status: 'PASS_ISOLATED_TRANSLATION_CALL_BUDGET_DRIFT', checks, negativeEvidence, snapshotTables: tables, budgets, prepaidReceiptAtCapConsumed: true, semanticUsageReconciliationVerified: false, budgetRowDeletionOrDayRekeyVerified: false, syntheticDisabledOutbox: 1, translationJobExecuted: false, realAiExecuted: false, realHttpExecuted: false, realNotificationExecuted: false, productionActivationAllowed: false};
}
module.exports = {checkTranslationCallBudget};
