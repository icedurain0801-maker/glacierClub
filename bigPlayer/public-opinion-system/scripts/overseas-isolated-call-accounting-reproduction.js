'use strict';
const crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createControlledManifest}=require('../worker/src/overseasControlledManifest');
const {createScheduledIsolatedTarget}=require('../server/src/db/overseasScheduledIsolatedTarget');
const {statements,createIsolatedCallBudget}=require('../server/src/db/overseasIsolatedCallBudget');
async function reproduceAccounting({repo,control,root,directory,serverPid,sourceId,accountId,gameId,communityId,deletion=false}){
 const isolation=createScheduledIsolatedTarget({repo,repositoryRoot:root,directory,serverPid});await isolation.verifyConnection(control);
 for(const sql of statements)await control.query(sql);
 const identity={sourceId,accountId,gameId,communityId,windowStart:'2026-01-01T00:00:00.000Z',windowEnd:'2026-01-02T00:00:00.000Z'};
 const tuple={contentId:crypto.randomUUID(),jobId:crypto.randomUUID(),fingerprint:'c'.repeat(64),targetLanguage:'zh-CN',version:'accounting-fixture-v1'};
 await control.query("INSERT INTO po_contents(id,game_id,community_id,source_id,account_id,external_id,fingerprint,published_at) VALUES (?,?,?,?,?,?,?,'2026-01-01 01:00:00')",[tuple.contentId,gameId,communityId,sourceId,accountId,'fixture-accounting',tuple.fingerprint]);
 await control.query('INSERT INTO po_translation_jobs(id,content_id,target_language,translation_version,content_fingerprint) VALUES (?,?,?,?,?)',[tuple.jobId,tuple.contentId,tuple.targetLanguage,tuple.version,tuple.fingerprint]);
 const manifest=createControlledManifest({kind:'translation',identity,tuples:[tuple]}),budget=createIsolatedCallBudget({repo,isolation,dailyCap:4,scopeCap:4});
 const receipt=await budget.reserve({manifest,identity,tuple,callId:crypto.randomUUID()});
 const [before]=await control.query('SELECT * FROM po_fixture_call_budgets ORDER BY scope_sha,budget_day');
 const [changed]=await control.query(deletion?'DELETE FROM po_fixture_call_budgets WHERE budget_day=UTC_DATE()':'UPDATE po_fixture_call_budgets SET used=0 WHERE budget_day=UTC_DATE()');assert.equal(changed.affectedRows,1);
 const consumed=await budget.consumeFake({manifest,identity,tuple,receipt});assert.equal(consumed.status,'fake_consumed');
 const [after]=await control.query('SELECT * FROM po_fixture_call_budgets ORDER BY scope_sha,budget_day'),[calls]=await control.query('SELECT * FROM po_fixture_calls'),[outbox]=await control.query('SELECT * FROM po_fixture_disabled_outbox');
 assert.equal(outbox.length,1);assert.equal(calls.length,1);assert.equal(calls[0].status,'fake_consumed');assert.equal(after.length,2);assert.ok(after.some(r=>Number(r.used)===0));
 return{status:deletion?'REPRODUCED_BUDGET_DELETION_RECREATION':'REPRODUCED_BUDGET_USED_ROLLBACK',before,after,calls,consumed,controllerDeletedBudget:deletion,budgetRecreatedWithZeroUsed:deletion,fixtureRestored:false,realHttpExecuted:false,aiExecuted:false,productionActivationAllowed:false};
}
module.exports={reproduceAccounting};
