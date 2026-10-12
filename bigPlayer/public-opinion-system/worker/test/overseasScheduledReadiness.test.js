'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createOverseasScheduledReadiness,assertScheduledReadinessInspector,REQUIRED_SCHEDULED_COLUMNS}=require('../src/overseasScheduledReadiness');
test('complete column inventory never grants scheduled activation',async()=>{
 const calls=[],repo={query:async sql=>{calls.push(sql);return Object.entries(REQUIRED_SCHEDULED_COLUMNS).flatMap(([table_name,columns])=>columns.map(column_name=>({table_name,column_name})));}};
 const inspect=createOverseasScheduledReadiness({repo}),report=await inspect();
 assert.equal(assertScheduledReadinessInspector(inspect,repo),inspect);assert.equal(report.requiredColumnsPresent,true);
 assert.equal(report.ready,false);assert.equal(report.productionActivationAllowed,false);assert.equal(report.reasonCode,'OVERSEAS_SCHEDULED_IMPLEMENTATION_INCOMPLETE');
 assert.ok(report.unproven.includes('SCHEDULED_FIRST_CLAIM_AND_RECOVERY'));assert.ok(calls.every(sql=>sql.startsWith('SELECT ')));
});
test('missing columns and unknown inventory fail closed',async()=>{
 const report=await createOverseasScheduledReadiness({repo:{query:async()=>[]}})();assert.equal(report.ready,false);
 assert.ok(report.missing.includes('po_sync_runs.parent_run_id'));assert.equal(report.reasonCode,'OVERSEAS_SCHEDULED_SCHEMA_INCOMPLETE');
 await assert.rejects(createOverseasScheduledReadiness({repo:{query:async()=>[{}]}})(),{code:'OVERSEAS_SCHEDULED_READINESS_INVALID'});
});
test('inspector cannot be copied or used with a different repository',()=>{
 const repo={query:async()=>[]},inspect=createOverseasScheduledReadiness({repo});
 for(const candidate of [inspect.bind(null),async()=>({ready:true})])assert.throws(()=>assertScheduledReadinessInspector(candidate,repo),{code:'OVERSEAS_SCHEDULED_READINESS_INVALID'});
 assert.throws(()=>assertScheduledReadinessInspector(inspect,{...repo}),{code:'OVERSEAS_SCHEDULED_READINESS_INVALID'});
});
