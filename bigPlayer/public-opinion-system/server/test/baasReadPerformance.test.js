const test=require('node:test'),assert=require('node:assert/strict');
const {BaasReadRepository}=require('../src/services/baasReadRepository');
function fixture({count=251,oversized=false}={}){
 const tables={games:[{id:'g',region_code:'overseas'}],communities:[{id:'c',game_id:'g',name:'C',status:'enabled'}],sources:[{id:'s',community_id:'c'}],accounts:[],handlings:[],analysisJobs:[],translationJobs:[],quality:[],alerts:[],alertLinks:[]};
 const docs=Array.from({length:count},(_,i)=>({id:'p'+i,updated_at:'2026-10-14T01:00:00Z',data:{schemaVersion:1,content:{id:'p'+i,game_id:'g',community_id:'c',source_id:'s',content_type:'post',body:'text',published_at:'2026-10-14T01:00:00Z',fingerprint:'f'+i},analyses:[],translations:[]}}));
 const calls=[];const client={request:async(method,url,data)=>{calls.push({method,url,data});if(url.endsWith('/docs/current'))return{data:{schemaVersion:1,chunks:Object.keys(tables).map(table=>({id:table,table}))}};if(url.includes('/docs/')){const table=url.split('/').at(-1);return{data:{table,rows:tables[table]}};}if(oversized&&data.limit>50)throw Object.assign(new Error('too large'),{code:'BAAS_RESPONSE_TOO_LARGE'});return{docs:docs.slice(data.offset,data.offset+data.limit),total:docs.length}}};return{repo:new BaasReadRepository({client}),calls};
}
test('directory cold read never downloads contents/jobs, shares concurrent requests and retains ACL',async()=>{const{repo,calls}=fixture();const [communities,games]=await Promise.all([repo.listCommunities(),repo.listGames()]);assert.equal(communities[0].id,'c');assert.equal(games[0].id,'g');assert.equal(calls.length,4);assert.equal(calls.filter(x=>x.method==='POST').length,0);assert.equal(repo.cache,null);assert.deepEqual(await repo.forIdentity({scoped:true,communityIds:[]}).listCommunities(),[]);await repo.listCommunities();assert.equal(calls.length,4)});
test('100-document pages halve normal content query count and retain all rows',async()=>{const{repo,calls}=fixture();const cache=await repo.load();assert.equal(cache.docs.size,251);const queries=calls.filter(x=>x.method==='POST');assert.equal(queries.length,3);assert.deepEqual(queries.map(x=>x.data.offset).sort((a,b)=>a-b),[0,100,200])});
test('large response falls back to smaller pages with no missing/duplicate documents',async()=>{const{repo}=fixture({oversized:true});assert.equal((await repo.load()).docs.size,251)});
test('expired snapshot is immediately served while one bounded refresh is running',async()=>{const repo=new BaasReadRepository();const old={expiresAt:Date.now()-1,tag:'old'};repo.cache=old;let release,calls=0;repo.refresh=()=>{calls++;return new Promise(r=>{release=r})};assert.equal(await repo.load(),old);assert.equal(await repo.load(),old);assert.equal(calls,1);let done=false;const fresh=repo.load({fresh:true}).then(x=>{done=true;return x});await new Promise(r=>setImmediate(r));assert.equal(done,false);release({tag:'new'});assert.equal((await fresh).tag,'new')});
test('explicit invalidation and stale age limit never serve stale snapshots',async()=>{for(const age of [40000,Infinity]){const repo=new BaasReadRepository();repo.cache={expiresAt:Date.now()-age};if(age===Infinity)repo.invalidate();let release;repo.refresh=()=>new Promise(r=>{release=r});let done=false;const loading=repo.load().then(()=>done=true);await new Promise(r=>setImmediate(r));assert.equal(done,false);release({});await loading;assert.equal(done,true)}});
test('failed directory reads are retryable and do not cache an empty success',async()=>{let fail=true;const{repo}=fixture();const orig=repo.client.request;repo.client.request=(...args)=>fail?Promise.reject(new Error('down')):orig(...args);await assert.rejects(repo.listCommunities(),{code:'BAAS_DATA_UNAVAILABLE'});fail=false;assert.equal((await repo.listCommunities()).length,1)});
test('immutable metadata chunks are reused and changed chunks replace old rows', async () => {
  const { repo, calls } = fixture();
  await repo.listCommunities();
  await repo.load();
  assert.equal(calls.filter(call => call.url.endsWith('/docs/games')).length, 1);
  const original = repo.client.request;
  repo.client.request = async (method, url, data) => {
    if (url.endsWith('/docs/current')) {
      const response = await original(method, url, data);
      response.data.chunks = response.data.chunks.map(chunk => chunk.table === 'communities' ? { ...chunk, id: 'communities-new' } : chunk);
      return response;
    }
    if (url.endsWith('/docs/communities-new')) {
      calls.push({ method, url, data });
      return { data: { table: 'communities', rows: [{ id: 'c', game_id: 'g', name: 'Updated', status: 'enabled' }] } };
    }
    return original(method, url, data);
  };
  const before = calls.length;
  repo.invalidate();
  const refreshed = await repo.load();
  const reads = calls.slice(before).filter(call => call.url.includes('/docs/') && !call.url.endsWith('/docs/current'));
  assert.deepEqual(reads.map(call => call.url.split('/').at(-1)), ['communities-new']);
  assert.equal(refreshed.metadata.communities[0].name, 'Updated');
  assert.equal(repo.metadataChunks.has('communities'), false);
});
