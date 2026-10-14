'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const projectRoot = path.resolve(__dirname, '../..');
// Test the REAL export. No replacement of apply/target/CAS/resume logic.
// Importing the module does not invoke main(), runtime env loading or Repository construction.
const { apply } = require(path.join(projectRoot, 'scripts/risk-normalization-backfill.js'));
const { RISK_POLICY_VERSION } = require(path.join(projectRoot, 'server/src/services/riskSeverityNormalizer.js'));
const clone = x => structuredClone(x);
const equal = (x,y) => String(x??'')===String(y??'');

function row(n, sentiment='negative') {
  return { id:`a${n}`, content_id:`c${n}`, analysis_level:'light', analysis_version:'sv1', content_fingerprint:`fp${n}`,
    current_fingerprint:`fp${n}`, analyzed_at:'2026-10-10 12:00:00', sentiment, severity:'attention',
    negative_score:sentiment==='positive'?'0.2000':'0.8000', confidence:'0.7000', model_name:'mock-model',
    game_id:'g',source_id:'s',account_id:null,summary:'synthetic summary',recommend_home:1 };
}
const contentFor = a => ({id:a.content_id,fingerprint:a.current_fingerprint,game_id:'g',source_id:'s',account_id:null});
function cache(n) {
  return {cache_key:`k${n}`,content_fingerprint:`fp${n}`,analysis_profile:'light',analysis_version:'sv1',model_name:'mock-model',
    sentiment:'negative',negative_score:'0.8000',confidence:'0.7000',severity:'attention',updated_at:'2026-10-10 12:00:00',
    summary:'synthetic cache',recommend_feature:1};
}
const analysisRecord = a => ({before:clone(a),finalSeverity:a.sentiment==='positive'?'normal':'urgent',caches:[]});
const cacheRecord = c => ({before:clone(c),contentId:`c${c.cache_key.slice(1)}`,fingerprint:c.content_fingerprint,gameId:'g',sourceId:'s'});
const planFor = (records=[],cacheRecords=[]) => ({schemaVersion:2,cacheRecords,policyVersion:RISK_POLICY_VERSION,historicalNotifications:false,batchSize:100,batchId:'synthetic-batch',records});
const approvalFor = plan => ({planSha256:'synthetic-hash',policyVersion:plan.policyVersion,action:'risk-backfill-deterministic-only',
  historicalNotifications:false,writerCutoverVerified:true,sharedWorkerEnqueueRaceResolved:true});
const execute = (db,plan) => apply(db.repo,plan,approvalFor(plan),'synthetic-hash');

// A transaction-aware SQL peer, not a replacement implementation of backfill.
// SELECT returns copies; pending UPDATE/INSERT effects remain private until commit.
// Rollback discards them, while prior committed batches survive another apply() invocation.
function statefulDb(seed={}, options={}) {
  const db = {state:{contents:{},analyses:{},caches:{},alerts:{},links:{},audits:[],...clone(seed)},
    stats:{commits:0,rollbacks:0,gateReleases:0,connReleases:0,proofCalls:0},gateOwned:false};
  const gate = { async query(sql) {
    if(sql.includes('GET_LOCK(')){db.gateOwned=true;return [[{acquired:1}]]}
    if(sql.includes('IS_USED_LOCK(')) {
      db.stats.proofCalls++;
      if(options.loseGateAtProof===db.stats.proofCalls) db.gateOwned=false;
      return [[{owned:db.gateOwned?1:0}]];
    }
    if(sql.includes('RELEASE_LOCK(')){db.gateOwned=false;return [[{released:1}]]}
    throw new Error(`unhandled gate SQL: ${sql}`);
  },release(){db.stats.gateReleases++}};
  function connection() {
    let pending=null;
    return {
      async beginTransaction(){assert.equal(pending,null,'no nested transaction');pending=clone(db.state)},
      async query(sql,params=[]) {
        assert.ok(pending,'all mutating operations execute within a transaction');
        if(sql.startsWith('SELECT id,game_id') || sql.startsWith('SELECT id,fingerprint')) {
          const c=pending.contents[params[0]];return [c?[clone(c)]:[]];
        }
        if(sql.startsWith('SELECT * FROM po_analyses')) {
          const a=pending.analyses[params[0]];return [a?[clone(a)]:[]];
        }
        if(sql.startsWith('UPDATE po_analyses')) {
          const [severity,id,version,level,time,fp,oldSeverity]=params;
          const a=Object.values(pending.analyses).find(a=>a.id===id);
          const ok=a&&equal(a.analysis_version,version)&&equal(a.analysis_level,level)&&equal(a.analyzed_at,time)&&equal(a.content_fingerprint,fp)&&a.severity===oldSeverity;
          if(ok)a.severity=severity;return [{affectedRows:ok?1:0}];
        }
        if(sql.startsWith('INSERT INTO po_audit_events')) {
          const [id,game_id,source_id,account_id,actor_type,actor_id,event_type,outcome,detail]=params;
          const audit={id,game_id,source_id,account_id,actor_type,actor_id,event_type,outcome,detail:JSON.parse(detail)};
          if(options.failAuditWhen?.(audit,db))throw new Error('synthetic audit failure');
          pending.audits.push(audit);return [{affectedRows:1}];
        }
        if(sql.startsWith('SELECT * FROM po_analysis_cache')) {
          const c=pending.caches[params[0]];return [c?[clone(c)]:[]];
        }
        if(sql.startsWith('UPDATE po_analysis_cache')) {
          const [severity,key,time,oldSeverity,fp]=params,c=pending.caches[key];
          const ok=c&&equal(c.updated_at,time)&&c.severity===oldSeverity&&c.content_fingerprint===fp;
          if(ok)c.severity=severity;return [{affectedRows:ok?1:0}];
        }
        if(sql.startsWith('SELECT a.id FROM po_alerts')) {
          return [Object.values(pending.alerts).filter(a=>['pending','processing'].includes(a.status)&&(pending.links[a.id]||[]).includes(params[0])).map(a=>({id:a.id}))];
        }
        if(sql.startsWith('SELECT COUNT(*) AS nonPositive')) {
          return [[{nonPositive:(pending.links[params[0]]||[]).filter(id=>pending.analyses[id]?.sentiment!=='positive').length}]];
        }
        if(sql.startsWith('UPDATE po_alerts')) {
          const [resolution_note,id]=params,a=pending.alerts[id],ok=a&&['pending','processing'].includes(a.status);
          if(ok)Object.assign(a,{status:'false_positive',resolution_note,resolved_at:'synthetic-time'});
          return [{affectedRows:ok?1:0}];
        }
        throw new Error(`unhandled SQL: ${sql}`);
      },
      async commit(){assert.ok(pending);db.state=pending;pending=null;db.stats.commits++},
      async rollback(){pending=null;db.stats.rollbacks++},
      release(){assert.equal(pending,null,'transaction must close before release');db.stats.connReleases++}
    };
  }
  db.repo={pool:{async getConnection(){return db.gateOwned?connection():gate}}};
  return db;
}

test('first 100 commit, second audit failure rolls back, replay resumes without duplicate audits',async()=>{
  const rows=Array.from({length:101},(_,i)=>row(i));
  let failOnce=true;
  const db=statefulDb({contents:Object.fromEntries(rows.map(a=>[a.content_id,contentFor(a)])),analyses:Object.fromEntries(rows.map(a=>[a.content_id,clone(a)]))},
    {failAuditWhen:a=>{if(a.detail.contentId==='c100'&&failOnce){failOnce=false;return true}return false}});
  const plan=planFor(rows.map(analysisRecord));
  await assert.rejects(execute(db,plan),error=>error.message==='synthetic audit failure'&&error.committedCounts.changed===100&&error.committedCounts.committedBatches===1);
  assert.equal(db.stats.commits,1);assert.equal(db.stats.rollbacks,1);
  for(let i=0;i<100;i++)assert.equal(db.state.analyses[`c${i}`].severity,'urgent');
  assert.equal(db.state.analyses.c100.severity,'attention');assert.equal(db.state.audits.length,100);
  const rerun=await execute(db,plan);
  assert.equal(rerun.counts.alreadyCompleted,100);assert.equal(rerun.counts.changed,1);
  assert.equal(db.state.analyses.c100.severity,'urgent');assert.equal(db.state.audits.length,101);
  assert.equal(new Set(db.state.audits.map(a=>a.detail.contentId)).size,101);
  assert.equal(db.state.audits[0].detail.originalAnalysis.severity,'attention');
  assert.equal(db.stats.gateReleases,2);
});

test('analysis commit survives cache-audit failure; independent cache phase repairs on replay',async()=>{
  const a=row(1),c=cache(1);let failOnce=true;
  const db=statefulDb({contents:{c1:contentFor(a)},analyses:{c1:clone(a)},caches:{k1:clone(c)}},
    {failAuditWhen:a=>{if(a.event_type==='risk_backfill_cache_normalized'&&failOnce){failOnce=false;return true}return false}});
  const plan=planFor([analysisRecord(a)],[cacheRecord(c)]);
  await assert.rejects(execute(db,plan),/synthetic audit failure/);
  assert.equal(db.state.analyses.c1.severity,'urgent');assert.equal(db.state.caches.k1.severity,'attention');
  assert.equal(db.state.audits.length,1);
  const result=await execute(db,plan);
  assert.equal(result.counts.alreadyCompleted,1);assert.equal(result.counts.changed,0);assert.equal(result.counts.cachesChanged,1);
  assert.equal(db.state.caches.k1.severity,'urgent');assert.equal(db.state.caches.k1.recommend_feature,1);
  assert.equal(db.state.audits.filter(a=>a.event_type==='risk_backfill_analysis_normalized').length,1);
  const cacheAudit=db.state.audits.find(a=>a.event_type==='risk_backfill_cache_normalized');
  assert.equal(cacheAudit.detail.originalAnalysis.severity,'attention');
});

test('same-second cache score or model mutation skips the reviewed cache CAS',async()=>{
  for(const mutation of [{negative_score:'0.1000'},{model_name:'replacement-model'}]) {
    const a=row(1),before=cache(1),actual={...before,...mutation};
    const db=statefulDb({contents:{c1:contentFor(a)},analyses:{c1:{...a,severity:'urgent'}},caches:{k1:actual}});
    const result=await execute(db,planFor([],[cacheRecord(before)]));
    assert.equal(result.counts.cacheSkipped,1);assert.equal(result.counts.cachesChanged,0);
    assert.deepEqual(db.state.caches.k1,actual);assert.equal(db.state.audits.length,0);
  }
});

test('gate loss before commit rolls back the staged analysis and audit',async()=>{
  const a=row(1),db=statefulDb({contents:{c1:contentFor(a)},analyses:{c1:clone(a)}},{loseGateAtProof:2});
  await assert.rejects(execute(db,planFor([analysisRecord(a)])),/analysis gate lost/);
  assert.equal(db.state.analyses.c1.severity,'attention');assert.equal(db.state.audits.length,0);
  assert.equal(db.stats.commits,0);assert.equal(db.stats.rollbacks,1);assert.equal(db.stats.gateReleases,1);
});

test('positive-only active alert closes; mixed and historically handled alerts remain intact',async()=>{
  const p=row(1,'positive'),n=row(2);
  const db=statefulDb({contents:{c1:contentFor(p),c2:contentFor(n)},analyses:{c1:clone(p),c2:clone(n)},
    alerts:{only:{id:'only',status:'pending'},mixed:{id:'mixed',status:'processing'},done:{id:'done',status:'resolved'}},
    links:{only:['c1'],mixed:['c1','c2'],done:['c1']}});
  const result=await execute(db,planFor([analysisRecord(p)]));
  assert.equal(db.state.analyses.c1.severity,'normal');assert.equal(db.state.analyses.c1.recommend_home,1);
  assert.equal(db.state.alerts.only.status,'false_positive');assert.equal(db.state.alerts.mixed.status,'processing');assert.equal(db.state.alerts.done.status,'resolved');
  assert.equal(result.counts.activePositiveAlertsClosed,1);assert.equal(result.counts.mixedAlertsSkipped,1);
  const audit=db.state.audits.find(a=>a.event_type==='positive_risk_alerts_reconciled');
  assert.deepEqual(audit.detail.alertIds,['only']);assert.equal(result.historicalNotifications,false);
});
