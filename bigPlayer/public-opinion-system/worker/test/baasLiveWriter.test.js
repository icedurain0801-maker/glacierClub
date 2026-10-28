const {test}=require('node:test');const assert=require('node:assert/strict');
const {BaasClient,snapshot,syncPage,syncChanged}=require('../src/baasLiveWriter');
test('snapshot retains comment links but excludes raw payload secrets',()=>{
 const result=snapshot({id:'c',content_type:'comment',parent_content_id:'p',body:'hi',raw_payload:{type:0,token:'secret'},password:'secret'},[{id:'a',summary:'summary',token:'secret'}],[{translated_body:'你好',secret:'secret'}]);
 assert.equal(result.content.parent_content_id,'p');assert.equal(result.originalType,0);assert.equal(result.translations[0].translated_body,'你好');assert.ok(!JSON.stringify(result).includes('secret'));
});
test('data token and real-name application role are mandatory',async()=>{
 assert.throws(()=>new BaasClient(''),{code:'BAAS_TOKEN_REQUIRED'});
 const client=new BaasClient('example',async()=>({is_anonymous:true,roles:['admin']}));await assert.rejects(()=>client.verify(),{code:'BAAS_WRITE_ROLE_REQUIRED'});
});
test('credentials cannot be sent to a different host',async()=>{
 const client=new BaasClient('example');await assert.rejects(()=>client.request('GET','https://example.invalid/data'),{code:'BAAS_UNTRUSTED_ENDPOINT'});
});
test('existing fixed content ID is replaced after create conflict',async()=>{
 const calls=[];const client=new BaasClient('example',async(method,endpoint,data)=>{calls.push({method,endpoint,data});if(method==='POST')throw {status:409};return {};});
 await client.put('comment-id',{body:'new'});assert.deepEqual(calls.map(c=>c.method),['POST','PATCH']);assert.equal(calls[1].data.merge,false);
});
test('authorization errors do not trigger a patch and large documents are not truncated',async()=>{
 let calls=0;const client=new BaasClient('example',async()=>{calls++;throw {status:401};});
 await assert.rejects(()=>client.put('id',{body:'hello'}));assert.equal(calls,1);
 await assert.rejects(()=>client.put('id',{body:'x'.repeat(250001)}),{code:'BAAS_DOCUMENT_TOO_LARGE'});assert.equal(calls,1);
});
function setup() {
 const state={cutover:'2026-10-14 03:10:00',cursor:'',hashes:{}};let summary='first';const queries=[];
 const repo={query:async(sql,params)=>{queries.push({sql,params});if(sql.includes('FROM po_contents'))return [{id:'new-id',body:'hi'}];if(sql.includes('FROM po_analyses'))return [{id:'analysis',summary}];return [];}};
 return {state,repo,queries,change:()=>summary='later'};
}
test('cutover is persisted; unchanged documents do not cause repeated cloud writes',async()=>{
 const deps=setup();let writes=0;const options={...deps,client:{put:async()=>writes++},save:async()=>{},limit:50};
 await syncPage(options);await syncPage(options);assert.equal(writes,1);assert.equal(deps.queries[0].params[0],deps.state.cutover);assert.match(deps.queries[0].sql,/collected_at >=/);
 deps.change();await syncPage(options);assert.equal(writes,2);
});
test('a failed cloud write does not acknowledge data or advance the cursor',async()=>{
 const deps=setup();let saves=0;await assert.rejects(()=>syncPage({...deps,client:{put:async()=>{throw {status:503};}},save:async()=>saves++}));
 assert.equal(deps.state.cursor,'');assert.deepEqual(deps.state.hashes,{});assert.equal(saves,0);
});
test('historical refresh is limited to the explicitly imported IDs',async()=>{
 const deps=setup();await syncPage({...deps,client:{put:async()=>{}},save:async()=>{},contentIds:['new-id']});
 assert.match(deps.queries[0].sql,/c\.id IN \(\?\)/);assert.ok(!deps.queries[0].sql.includes('collected_at >= ?'));assert.equal(deps.queries[0].params[0],'new-id');
});
test('recent analysis changes take priority and checkpoint advances only after acknowledgement',async()=>{
 const state={cutover:'2026-10-14 11:13:42',cursor:'new-cursor',hashes:{c:'old'},trackedIds:['c']};
 const queries=[];const repo={query:async(sql,params)=>{queries.push({sql,params});if(sql.includes('AS changed_at'))return [{id:'c',changed_at:'2026-10-14 12:00:00'}];if(sql.includes('FROM po_contents'))return [{id:'c',body:'hi'}];if(sql.includes('FROM po_analyses'))return [{id:'a',summary:'changed'}];return [];}};
 let saves=0;
 await assert.rejects(()=>syncChanged({repo,state,client:{put:async()=>{throw {status:503};}},save:async()=>saves++}));
 assert.equal(state.changeSince,undefined);assert.equal(state.changeId,undefined);assert.equal(state.cursor,'new-cursor');assert.equal(saves,0);
 const result=await syncChanged({repo,state,client:{put:async()=>{}},save:async()=>saves++});
 assert.equal(result.written,1);assert.equal(state.changeSince,'2026-10-14 12:00:00');assert.equal(state.changeId,'c');assert.equal(state.cursor,'new-cursor');
 assert.ok(queries[0].params.includes('2026-10-14 11:29:45'));
 assert.match(queries[0].sql,/po_contents_change_clock_idx/);
});

test('changed refresh merges all covered clocks before limiting and excludes untracked IDs', async () => {
 const ids=Array.from({length:405},(_,i)=>String(i).padStart(3,'0'));
 const state={hashes:Object.fromEntries(ids.map(id=>[id,'old'])),changeSince:'2026-10-14 00:00:00',changeId:''};
 const written=[],batches=[];
 const repo={query:async(sql,params)=>{
  if(sql.includes('AS changed_at')){
   batches.push(params);assert(sql.includes('change_clock_idx'));assert(!sql.includes(' JOIN '));
   if(sql.includes('FROM po_contents'))return [{id:'001',changed_at:'2026-10-14 01:00:00'},{id:'201',changed_at:'2026-10-15 00:00:00'},{id:'untracked',changed_at:'2026-10-14 02:00:00'}];
   if(sql.includes('FROM po_analyses'))return [{id:'001',changed_at:'2026-10-16 00:00:00'}];
   return [{id:'401',changed_at:'2026-10-15 00:00:00'}];
  }
  if(sql.includes('FROM po_contents'))return [{id:params[0],body:'isolated'}];
  return [];
 }};
 const result=await syncChanged({repo,state,client:{put:async id=>written.push(id)},save:async()=>{},limit:2});
 assert.deepEqual(batches.map(x=>x.length),[1,1,2]);
 assert.deepEqual(written,['201','401']);assert.equal(result.examined,2);
 assert.equal(state.changeSince,'2026-10-15 00:00:00');assert.equal(state.changeId,'401');
});
