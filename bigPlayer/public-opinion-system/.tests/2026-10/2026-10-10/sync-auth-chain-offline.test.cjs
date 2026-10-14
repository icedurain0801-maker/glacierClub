'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { Readable } = require('node:stream');
const candidate = path.resolve(__dirname, '../../../../../.temp/sync-auth-persistence-fix-20261010/api-release/server/src');
process.env.CREDENTIAL_ENC_KEY = '45'.repeat(32); process.env.BIGPLAYER_H5_ALLOWED_HOSTS = 'club.q1.com,club-en.q1.com';
process.env.BIGPLAYER_H5_ENABLED = 'true';
require(path.join(candidate,'runtimeEnv')).loadRuntimeEnv = () => false;
const app = require(path.join(candidate,'app')), { Repository } = require(path.join(candidate,'db/repository'));
const { CredentialContext } = require(path.join(candidate,'services/credentialContext'));
const { BigPlayerH5Connector } = require(path.join(candidate,'connectors/bigPlayerH5Connector'));
const oldWorker = require('C:/ProgramData/PublicOpinion/releases/worker-release-v055-overseas-exclusion-1791605078003/worker/src/worker');
const oldConnector = require('C:/ProgramData/PublicOpinion/releases/worker-release-v055-overseas-exclusion-1791605078003/server/src/connectors/bigPlayerH5Connector').BigPlayerH5Connector;
const text = fs.readFileSync(path.resolve(__dirname,'../../../server/test/repository.test.js'),'utf8');
const start=text.indexOf('function manualSyncHarness('), end=text.indexOf("\ntest('createSyncRun",start);
const harness=vm.runInNewContext('('+text.slice(start,end)+')',{Repository});
let sources=[], accounts=[], credentials=new Map(), capabilities=new Map(), pendingPayload;
app.repo.getAccount = async id => accounts.find(a=>a.id===id);
app.repo.listSources = async () => sources;
app.repo.listAccounts = async filter => accounts.filter(a=>!filter?.sourceId||a.source_id===filter.sourceId);
app.repo.getCredentialByAccount = async (id,type) => credentials.get(id+':'+type) || null;
app.repo.getAccountCredentialSummary = async id => [...credentials.values()].filter(c=>c.account_id===id).map(c=>({...c,secret_cipher:undefined,has_secret_cipher:true}));
app.repo.upsertAccountCredential = async (id,value) => {
  const row={id:'credential-'+id,account_id:id,credential_type:value.credentialType,status:value.status,secret_cipher:value.secretCipher,expire_at:value.expireAt};
  credentials.set(id+':'+value.credentialType,row); return row;
};
app.repo.updateSourceAuth=async (id,p)=>Object.assign(sources.find(s=>s.id===id),{auth_status:p.authStatus});
app.repo.updateAccount=async (id,p)=>Object.assign(accounts.find(a=>a.id===id),{auth_status:p.authStatus});
app.repo.getSyncStatus=app.repo.getSourceSyncStatusSummary=async()=>[];
app.repo.listSourceCapabilities=async id=>capabilities.get(id)||[];
app.repo.upsertSourceCapability=async(id,scope,p)=>{const rows=capabilities.get(id)||[];rows.push({capability:scope,status:p.status});capabilities.set(id,rows);};
app.repo.resolveCommunityCanonical=async input=>({...input,gameId:'game-'+input.communityId,communityId:input.communityId,regionCode:'domestic'});
app.repo.getGame=async id=>({id,enabled:1,region_code:'domestic'});
app.communityDirectory.requireEnabled=async input=>({id:input.communityId,game_id:input.gameId,status:'enabled',region_code:'domestic'});
app.repo.findSourceByIdentity=async()=>null;
app.repo.createSourceWithAccount=async p=>{
  pendingPayload=p;
  const s={id:p.sourceId,game_id:p.gameId,community_id:p.communityId,region_code:'domestic',platform:p.platform,display_name:p.displayName,enabled:1,auth_status:p.authStatus,default_account_id:p.accountId,config:JSON.stringify({baseUrl:p.baseUrl,siteUrls:p.siteUrls,boardId:p.boardId}),frequency_seconds:p.frequencySeconds};
  const a={id:p.accountId,source_id:p.sourceId,game_id:p.gameId,community_id:p.communityId,platform:p.platform,enabled:1,auth_status:p.authStatus};
  sources.push(s);accounts.push(a);await app.repo.upsertAccountCredential(a.id,{credentialType:p.credentialType,secretCipher:p.secretCipher,status:'active'});return {source:s,account:a};
};
app.loginSessionClient.configured=()=>true;app.loginSessionClient.bindAccount=async()=>({});
let loginBinding;
app.loginSessionClient.startLogin=async b=>{loginBinding=b;return {status:'active'};};
app.loginSessionClient.claimAuthResult=async()=>({apiToken:'synthetic-token-'+loginBinding.accountId});
function fetchFor(source) { return async (url,options)=>{
  assert.equal(options.headers.authorization,'Bearer synthetic-token-'+source.default_account_id);
  const u=new URL(url),board=JSON.parse(source.config).boardId;let data;
  if(u.pathname.endsWith('/user/context'))data={boards:[{id:Number(board)}]};
  else if(u.pathname.endsWith('/auth/board'))data={groups:[{id:1,type:0,sections:[{id:101,name:'synthetic'}]}]};
  else if(u.pathname.includes('/comment/'))data=[];
  else data={items:[{id:7,content:'synthetic',createdAt:'2026-10-10T00:00:00Z'}],total:1,hasMore:false};
  return {ok:true,status:200,url:String(url),json:async()=>({code:0,data,...(u.pathname.includes('/comment/')?{total:0}:{})})};
}; }
async function request(method,url,body={}) {
  const req=Readable.from([JSON.stringify(body)]);Object.assign(req,{method,url:'/api/public-opinion'+url,headers:{},socket:{remoteAddress:'127.0.0.1'}});
  let status,payload;await app.handler(req,{writeHead(s){status=s;},end(b){payload=JSON.parse(b);}});return {status,body:payload};
}
for(const board of [22,37,108]) test(`new community ${board}: actual create, authorize, capabilities, SQL admission and existing Worker credential use`,async()=>{
  const created=await request('POST','/sources',{regionCode:'domestic',communityId:'synthetic-community-'+board,platform:'bigplayer_h5',displayName:'synthetic-source-'+board,boardId:String(board),baseUrl:`https://club.q1.com/?env=web&gameId=${board+1000}&gameVersion=synthetic-${board}`,account:'synthetic-account-'+board,password:'synthetic-password',frequencySeconds:21600});
  assert.equal(created.status,201,JSON.stringify(created.body));assert.equal(pendingPayload.credentialType,'account_password');
  const source=sources.at(-1),account=accounts.at(-1);
  const connector=new BigPlayerH5Connector(process.env,{credentialContext:app.credentialContext,loginSessionClient:app.loginSessionClient,fetchImpl:fetchFor(source)});app.connectors.bigplayer_h5=connector;
  const auth=await request('POST',`/sources/${source.id}/check-auth`);assert.equal(auth.status,200);assert.equal(auth.body.data.authStatus,'authorized',JSON.stringify(auth.body));
  const stored=credentials.get(account.id+':api_token');assert(stored);assert(!stored.secret_cipher.includes('synthetic-token'));
  const loaded=await app.credentialContext.load(account,'api_token');assert.equal(loaded.apiToken,'synthetic-token-'+account.id);
  const caps=await request('POST',`/sources/${source.id}/check-capabilities`);assert.equal(caps.body.data.capabilities.posts,'authorized_scope');assert.equal(caps.body.data.capabilities.comments,'authorized_scope');
  const h=harness({source:{...source,config:{boardId:String(board)},admission_anchor:'2026-09-11 08:30:00.000'},account,credential:{id:stored.id,status:stored.status,has_secret_cipher:1}});
  app.repo.startSourceSync=async input=>h.repo.startSourceSync(input);
  const sync=await request('POST',`/sources/${source.id}/sync`,{mode:'incremental'});assert.equal(sync.status,200,JSON.stringify(sync.body));assert(sync.body.data.runId);
  const admission=h.executed.find(c=>c.sql.includes('FROM po_credentials WHERE source_id='));assert.deepEqual([...admission.params],[source.id,account.id]);
  const workerGate=await oldWorker.checkAuthorization(app.repo,source,new oldConnector(process.env,{credentialContext:app.credentialContext}),{account,credentialContext:app.credentialContext});assert.equal(workerGate.authorized,true);
  const existingConnector=new oldConnector(process.env,{credentialContext:app.credentialContext,fetchImpl:fetchFor(source)});
  const page=await existingConnector.listQ1Posts({source,account,credentialContext:app.credentialContext,limit:1});assert.equal(page.items.length,1);
});
test('failed login never creates a worker Token or claims authorization',async()=>{
  const s=sources[0],a=accounts[0];credentials.delete(a.id+':api_token');
  const c=new BigPlayerH5Connector(process.env,{credentialContext:app.credentialContext,loginSessionClient:{startLogin:async()=>{throw Object.assign(Error('redacted'),{code:'INVALID_CREDENTIALS'});},claimAuthResult:async()=>{throw Error('must not claim');}},fetchImpl:async()=>{throw Error('must not fetch');}});
  assert.equal((await c.accountHealth({...s,account:a})).authorized,false);assert(!credentials.has(a.id+':api_token'));
});
test('authorization persistence rejects wrong source binding, expired result and invalid encryption config',async()=>{
  const s=sources[1],a=accounts[1];
  await assert.rejects(()=>app.credentialContext.saveApiAuthorization({...s,id:'other'},a,{apiToken:'synthetic'}),e=>e.code==='ACCOUNT_SCOPE_MISMATCH');
  await assert.rejects(()=>app.credentialContext.saveApiAuthorization(s,a,{apiToken:'synthetic',expiresAt:'2000-01-01'}),e=>e.code==='CREDENTIAL_EXPIRED');
  const c=new CredentialContext({repo:app.repo,env:{}});
  await assert.rejects(()=>c.saveApiAuthorization(s,a,{apiToken:'synthetic'}),e=>e.code==='CREDENTIAL_ENC_KEY_MISSING');
});
test('successful new authorization explicitly replaces an old expired timestamp with no expiry',async()=>{
  const repo=new Repository({DB_NAME:'synthetic'}), calls=[];
  const conn={beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},query:async(sql,p)=>{calls.push({sql,p});if(sql.startsWith('SELECT source_id'))return [[{source_id:'s'}]];if(sql.startsWith('SELECT id, platform'))return [[{id:'s',platform:'bigplayer_h5'}]];if(sql.startsWith('SELECT * FROM po_accounts'))return [[{id:'a',source_id:'s'}]];if(sql.startsWith('SELECT id, account_id'))return [[{id:'credential'}]];return [{affectedRows:1}];}};
  repo.pool={getConnection:async()=>conn};
  await repo.upsertAccountCredential('a',{secretCipher:'synthetic-cipher',replaceExpireAt:true,expireAt:null});
  assert(calls.some(c=>c.sql.includes('expire_at=VALUES(expire_at)')));
});
test('actual sync route exposes a credential failure with a safe Chinese message',async()=>{
  const s=sources[2];app.repo.startSourceSync=async()=>{throw Object.assign(Error('active api_token credential not found'),{code:'CREDENTIAL_NOT_FOUND'});};
  app.connectors.bigplayer_h5=new BigPlayerH5Connector(process.env,{credentialContext:app.credentialContext,loginSessionClient:app.loginSessionClient,fetchImpl:fetchFor(s)});
  const response=await request('POST',`/sources/${s.id}/sync`,{mode:'incremental'});
  assert.equal(response.status,401);assert.equal(response.body.error.code,'CREDENTIAL_NOT_FOUND');
  assert(response.body.error.message.includes('重新检测授权'));assert(!response.body.error.message.includes('internal server error'));
});
