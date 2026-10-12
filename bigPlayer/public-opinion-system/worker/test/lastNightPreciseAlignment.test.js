'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildAlignment,preciseAlignment,IDS,LEGACY}=require('../src/lastNightPreciseAlignment');
const {SOURCE_ID,GAME_ID,COMMUNITY_ID}=require('../src/lastNightScope');
const sites=['2','9','16'].map(language=>({siteId:IDS[language],url:`https://club-en.q1.com/?env=web&gameId=2177&gameVersion=2177-US-ZS&lang=en-US&languageId=${language}`,enabled:true}));
const source={id:SOURCE_ID,game_id:GAME_ID,community_id:COMMUNITY_ID,platform:'bigplayer_h5',region_code:'overseas',enabled:1,community_status:'enabled',config:JSON.stringify({boardId:'100017',siteUrls:sites,other:'preserved'})};
const legacy={site_id:LEGACY,url:sites[0].url,url_hash:'fixture-hash',enabled:1,auth_status:'authenticated',capabilities:'{"fixture":true}'};
function fixture({unknown=false,active=false,hang=false}={}) {
  const registry=[{...legacy}],sql=[];let config=source.config,destroyed=false;
  const conn={query:async(options,params=[])=>{
    const text=options.sql;sql.push(text);if(hang)return new Promise(()=>{});
    if(text.includes('CURRENT_USER'))return[[{identity:'fixture@local',db:'public_opinion',port:3306}]];
    if(text.includes('GET_LOCK'))return[[{acquired:1}]];
    if(text.startsWith('SELECT config FROM po_sources'))return[[{config}]];
    if(text.includes('FROM po_sources'))return[[{...source,config}]];
    if(text.includes('FROM po_accounts'))return[[{id:'fixture-account',source_id:SOURCE_ID,platform:'bigplayer_h5',enabled:1}]];
    if(text.startsWith('SELECT DISTINCT site_id'))return[[]];
    if(text.startsWith('SELECT DISTINCT cp.site_id'))return[[{site_id:LEGACY}]];
    if(text.includes('FROM po_sync_runs'))return[active?[{id:'active'}]:[]];
    if(text.includes('FROM po_source_schedule_state'))return[[{active_lease:0}]];
    if(text.includes('FROM po_source_sites'))return[[...registry].sort((a,b)=>a.site_id.localeCompare(b.site_id))];
    if(text.startsWith('UPDATE po_sources')){assert.equal(params[2],source.config);config=params[0];}
    if(text.startsWith('INSERT INTO po_source_sites'))registry.push({site_id:params[2],url:params[3],url_hash:params[4],enabled:1,auth_status:'unknown',capabilities:params[5]});
    if(text==='COMMIT'&&unknown)throw new Error('lost ACK');
    return[{affectedRows:1}];
  },destroy(){destroyed=true;}};
  return{pool:{getConnection:async()=>conn},sql,registry,config:()=>JSON.parse(config),destroyed:()=>destroyed};
}
test('inspect zero writes; apply retains legacy auth/capabilities/history and changes only config plus two inserts',async()=>{
  const f=fixture(),base={accountId:'fixture-account',expectedIdentity:'fixture@local'};
  const inspect=await preciseAlignment({...f,...base,inspectOnly:true});assert.equal(inspect.status,'ALIGNMENT_PLAN_READY');assert.ok(!f.sql.some(sql=>/^(UPDATE|INSERT|DELETE)/.test(sql)));
  const g=fixture(),phases=[];
  const result=await preciseAlignment({...g,...base,approvedPlanHash:inspect.planHash,persistEvidence:async state=>phases.push(state.phase)});
  assert.equal(result.status,'LAST_NIGHT_ALIGNMENT_COMMITTED');assert.deepEqual(g.registry[0],legacy);assert.equal(g.config().other,'preserved');assert.equal(g.config().siteUrls[0].siteId,LEGACY);
  assert.equal(g.sql.filter(sql=>sql.startsWith('INSERT')).length,2);assert.equal(g.sql.filter(sql=>sql.startsWith('UPDATE')).length,1);assert.ok(!g.sql.some(sql=>/^(UPDATE|DELETE).*po_sync_(runs|checkpoints)/.test(sql)));assert.equal(phases.at(-1),'alignment_committed');
});
test('plan drift/activity timeout/commit unknown fail closed',async()=>{
  const hash=buildAlignment(source,[legacy]).planHash;
  for(const options of [{active:true},{unknown:true},{hang:true},{}]) {
    const f=fixture(options);
    await assert.rejects(preciseAlignment({...f,accountId:'fixture-account',expectedIdentity:'fixture@local',approvedPlanHash:Object.keys(options).length?hash:'0'.repeat(64),persistEvidence:async()=>{},timeoutMs:25}),error=>error.code===(options.active?'LAST_NIGHT_ACTIVE_RUN':options.unknown?'LAST_NIGHT_ALIGNMENT_COMMIT_UNKNOWN':options.hang?'LAST_NIGHT_ALIGNMENT_TIMEOUT':'LAST_NIGHT_ALIGNMENT_PLAN_CHANGED'));
    if(options.unknown)assert.ok(!f.sql.includes('ROLLBACK'));assert.ok(f.destroyed());
  }
});
test('isolated alignment contract agrees with existing planner without worker dependency',()=>{
  const existing=require('../src/lastNightOverseasDailyJob').inspectSiteAlignment;
  const isolated=require('../src/lastNightAlignmentContract').inspectSiteAlignment;
  for(const history of [[],[LEGACY]])assert.deepEqual(isolated(source,[legacy],history),existing(source,[legacy],history));
});
