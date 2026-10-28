const test=require('node:test'),assert=require('node:assert/strict');
process.env.PUBLIC_OPINION_ENV_FILE='';
test('single-post HTTP: identity, owner, community, candidate and export boundaries',async()=>{
 const app=require(process.env.SINGLE_POST_TEST_APP || '../src/app');app.baasAccess.enabled=true;let actor='owner';app.baasAccess.fetch=async()=>new Response(JSON.stringify({end_user_id:actor,display_name:'测试用户',is_anonymous:false,roles:['admin']}));
 const jobs=new Map();let created=0;const source={id:'s',game_id:'g',community_id:'c',platform:'bigplayer_h5',community_status:'enabled',config:{boardId:101}};
 app.communityDirectory.requireEnabled=async()=>({id:'c',status:'enabled'});app.repo.listSources=async()=>[source];app.repo.resolveCommunityCanonical=async()=>({regionCode:'domestic',communityId:'c',gameId:'g'});app.repo.getCommunity=async()=>({id:'c',status:'enabled'});app.communityDirectory.list=async()=>[{id:'c',status:'enabled'}];
 app.repo.query=async(sql,args=[])=>{
  if(sql.startsWith('SELECT COUNT(*) AS n FROM po_single_post_jobs'))return [{n:0}];
  if(sql.startsWith('INSERT INTO po_single_post_jobs')){const [id,owner,community,source,platform,kind,input]=args;jobs.set(id,{id,owner_id:owner,community_id:community,source_id:source,platform,kind,input_json:input,status:'queued'});created++;return {affectedRows:1};}
  if(sql.startsWith('SELECT * FROM po_single_post_jobs'))return jobs.has(args[0])?[jobs.get(args[0])]:[];
  return [];
 };
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${app.server.address().port}/api/public-opinion/single-post`;const headers={authorization:'Bearer isolated','content-type':'application/json'};
 try{
  assert.equal((await fetch(root,{method:'POST',body:'{}'})).status,401);
  const response=await fetch(root,{method:'POST',headers,body:JSON.stringify({regionCode:'domestic',communityId:'c',platform:'bigplayer_h5',inputType:'id',query:'123',mode:'detail'})});const body=await response.json();assert.equal(response.status,202,JSON.stringify(body));const id=body.data.id;
  assert.equal((await fetch(root+'/'+id,{headers})).status,200);
  actor='other';assert.equal((await fetch(root+'/'+id,{headers})).status,404);actor='owner';
  assert.equal((await fetch(root+'/'+id+'/excel',{headers})).status,400);
  assert.equal((await fetch(root,{method:'POST',headers,body:JSON.stringify({searchJobId:id,candidateIndex:0})})).status,404);
  jobs.get(id).status='completed';jobs.get(id).result_json=JSON.stringify({candidates:[{id:'123',body:'原帖'}]});
  assert.equal((await fetch(root,{method:'POST',headers,body:JSON.stringify({searchJobId:id,candidateIndex:100})})).status,400);
  const analysis=await fetch(root,{method:'POST',headers,body:JSON.stringify({searchJobId:id,candidateIndex:0})});assert.equal(analysis.status,202);assert.equal(created,2);
  const aid=(await analysis.json()).data.id;
  const a=jobs.get(aid);a.status='completed';a.result_json=JSON.stringify({mode:'specified',post:{id:'123',body:''},requirement:'抓取ID并输出excel',rows:[{id:'long-id',authorId:'12345678901234567890',match:true}],stats:{total:1}});
  a.input_json=JSON.stringify({mode:'specified',requirement:'抓取ID并输出excel'});
  let exported=await fetch(root+'/'+aid+'/report',{headers});assert.equal(exported.status,200);assert(exported.headers.get('content-type').includes('spreadsheetml'));assert.equal(Buffer.from(await exported.arrayBuffer()).readUInt32LE(0),0x04034b50);
  a.input_json=JSON.stringify({mode:'specified',requirement:'抓取ID'});exported=await fetch(root+'/'+aid+'/report',{headers});assert.equal(exported.status,200);assert(exported.headers.get('content-type').includes('text/html'));assert((await exported.text()).includes('long-id'));
  actor='other';assert.equal((await fetch(root+'/'+aid+'/report',{headers})).status,404);actor='owner';
 }finally{await new Promise(r=>app.server.close(r));await app.repo.pool.end();}
});
