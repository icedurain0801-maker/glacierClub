const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const tls = require('node:tls');
const crypto = require('node:crypto');
const APP_KEY = 'pk_2baf095458a842a080b8faa613ce1855';
const COLLECTION = 'po_live_contents_v1';
const CONTENT_FIELDS = ['id','game_id','community_id','source_id','platform','external_id','content_type','author_name','title','body','media','published_at','source_url','engagement','fingerprint','collected_at','account_id','platform_author_id','root_content_id','parent_content_id','platform_parent_id','content_depth','is_deleted','first_seen_at','last_seen_at'];
const ANALYSIS_FIELDS = ['id','content_id','content_fingerprint','analysis_profile','analysis_version','analysis_level','trigger_reason','analysis_reason','risk_context','sentiment','negative_score','confidence','severity','topics','matched_keywords','summary','quality_score','quality_reason','recommend_home','recommend_pin','recommend_feature','model_name','input_tokens','output_tokens','total_tokens','analyzed_at'];
const TRANSLATION_FIELDS = ['id','content_id','target_language','source_language','translated_title','translated_body','content_fingerprint','translation_version','model_name','input_tokens','output_tokens','total_tokens','translated_at','created_at','updated_at'];
const pick = (row, fields) => Object.fromEntries(fields.filter(key => row[key] !== undefined).map(key => [key,row[key]]));
function snapshot(content, analyses, translations) {
  let originalType = null;
  try { const raw = typeof content.raw_payload === 'string' ? JSON.parse(content.raw_payload) : content.raw_payload; if([0,1,'0','1'].includes(raw?.type)) originalType = Number(raw.type); } catch {}
  return { schemaVersion:1, content:pick(content,CONTENT_FIELDS), originalType, analyses:analyses.map(row=>pick(row,ANALYSIS_FIELDS)), translations:translations.map(row=>pick(row,TRANSLATION_FIELDS)) };
}
class BaasClient {
  constructor(token, requestImpl, collection=COLLECTION) { if(!token || /\s/.test(token)) throw Object.assign(new Error('Missing data access token'),{code:'BAAS_TOKEN_REQUIRED'}); if(!/^[a-z0-9_]+$/.test(collection))throw new Error('Invalid collection');this.token=token; this.requestImpl=requestImpl;this.collection=collection; }
  async request(method, endpoint, data) {
    if(this.requestImpl) return this.requestImpl(method,endpoint,data);
    const body = data === undefined ? null : JSON.stringify(data);
    const url=new URL(endpoint,'https://chat.q1.com/baas/');
    if(url.origin!=='https://chat.q1.com'||!url.pathname.startsWith('/baas/'))throw Object.assign(new Error('Untrusted data endpoint'),{code:'BAAS_UNTRUSTED_ENDPOINT'});
    const ca = typeof tls.getCACertificates === 'function' ? [...tls.getCACertificates('default'),...tls.getCACertificates('system')] : tls.rootCertificates;
    return new Promise((resolve,reject)=>{
      const request=https.request(url,{method,rejectUnauthorized:true,ca,headers:{'X-App-Key':APP_KEY,Authorization:`Bearer ${this.token}`,'Content-Type':'application/json',...(body?{'Content-Length':Buffer.byteLength(body)}:{})}},response=>{
        const chunks=[];let size=0;
        response.on('data',chunk=>{size+=chunk.length;if(size>1048576)request.destroy(Object.assign(new Error('Response too large'),{code:'BAAS_RESPONSE_TOO_LARGE'}));else chunks.push(chunk);});
        response.on('error',reject);response.on('end',()=>{if(response.statusCode<200||response.statusCode>=300)return reject(Object.assign(new Error('BaaS request failed'),{code:response.statusCode===429&&Buffer.concat(chunks).toString().includes('已达该 app 的文档数配额上限')?'BAAS_APP_DOCUMENT_QUOTA_EXCEEDED':`BAAS_HTTP_${response.statusCode}`,status:response.statusCode}));try{resolve(JSON.parse(Buffer.concat(chunks).toString()));}catch{reject(Object.assign(new Error('Invalid response'),{code:'BAAS_INVALID_RESPONSE'}));}});
      });
      request.setTimeout(30000,()=>request.destroy(Object.assign(new Error('BaaS request timed out'),{code:'BAAS_TIMEOUT'})));
      request.on('error',reject);if(body)request.write(body);request.end();
    });
  }
  async verify() { const me=await this.request('GET','v1/auth/me');if(me.is_anonymous!==false||!Array.isArray(me.roles)||!me.roles.includes('admin'))throw Object.assign(new Error('Real-name application admin required'),{code:'BAAS_WRITE_ROLE_REQUIRED'}); }
  async put(id,data) {
    if(Buffer.byteLength(JSON.stringify(data))>250000)throw Object.assign(new Error('Document exceeds safe size limit'),{code:'BAAS_DOCUMENT_TOO_LARGE'});
    try { await this.request('POST',`v1/collections/${this.collection}/docs`,{id,data}); }
    catch(error){if(error.status!==409)throw error;await this.request('PATCH',`v1/collections/${this.collection}/docs/${encodeURIComponent(id)}`,{data,merge:false,reason:'Local incremental content synchronization'});}
  }
}
function saveState(file,state) { fs.mkdirSync(path.dirname(file),{recursive:true});const temporary=`${file}.${process.pid}.tmp`;fs.writeFileSync(temporary,JSON.stringify(state));fs.renameSync(temporary,file); }
async function syncPage({repo,client,state,save,limit=50,contentIds}) {
  const scoped=Array.isArray(contentIds)&&contentIds.length>0;
  const condition=scoped?`c.id IN (${contentIds.map(()=>'?').join(',')})`:'c.collected_at >= ?';
  // Persisted retention boundary applies to both new collection and historical refresh.
  const retainedFrom = state.retentionPublishedFrom ? new Date(state.retentionPublishedFrom).toISOString().slice(0, 23).replace('T', ' ') : null;
  const protectedIds = state.retentionProtectedIds || [];
  if (!Array.isArray(protectedIds)) throw new TypeError('retentionProtectedIds must be an array');
  const retainedClause = retainedFrom ? "AND (c.published_at >= ? OR EXISTS(SELECT 1 FROM po_analyses ra WHERE ra.content_id=c.id AND (ra.severity IN ('negative','urgent') OR ra.recommend_home=1 OR ra.recommend_pin=1 OR ra.recommend_feature=1)) OR EXISTS(SELECT 1 FROM po_quality_candidates rq WHERE rq.content_id=c.id) OR EXISTS(SELECT 1 FROM po_alert_contents rac WHERE rac.content_id=c.id)" + (protectedIds.length ? ' OR c.id IN (' + protectedIds.map(() => '?').join(',') + ')' : '') + ')' : '';
  const contents=await repo.query(`SELECT c.*, s.platform FROM po_contents c LEFT JOIN po_sources s ON s.id=c.source_id WHERE ${condition} AND c.id > ? ${retainedClause} ORDER BY c.id LIMIT ?`,[...(scoped?contentIds:[state.cutover]),state.cursor||'',...(retainedFrom ? [retainedFrom, ...protectedIds] : []),limit]);
  const result={examined:contents.length,written:0,unchanged:0};
  try { for(const content of contents){
    const analyses=await repo.query('SELECT * FROM po_analyses WHERE content_id=? ORDER BY id',[content.id]);
    const translations=await repo.query('SELECT * FROM po_content_translations WHERE content_id=? ORDER BY id',[content.id]);
    const data=snapshot(content,analyses,translations),hash=crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
    if(state.hashes[content.id]!==hash){await client.put(content.id,data);state.hashes[content.id]=hash;result.written++;}else result.unchanged++;
    state.cursor=content.id;
  } } catch(error) { if(result.written||result.unchanged)await save(state);throw error; }
  if(contents.length<limit)state.cursor='';
  await save(state);
  return result;
}
function readToken(file) {
  const runtimeRoot = process.env.PUBLIC_OPINION_RUNTIME_ROOT || path.resolve(__dirname, '../..');
  return require(path.join(runtimeRoot, 'server/src/services/baasDataClient')).readToken(file);
}
async function syncChanged({ repo, client, state, save, limit = 50 }) {
  const ids = Object.keys(state.hashes).sort();
  if (!ids.length) return { examined: 0, written: 0 };
  // These update columns use the database's Beijing wall clock, unlike publication timestamps.
  const since = state.changeSince || '2026-10-14 11:29:45';
  // Read only timestamp/index columns. Joining three wide rows per tracked ID
  // thrashes the buffer pool even when each lookup uses a unique index.
  // Merge all three clocks before limiting: an early clock must not hide a
  // later analysis/translation update or advance the global cursor too far.
  const tracked = new Set(ids), changes = new Map();
  const stamp = value => value instanceof Date ? value.toISOString().slice(0, 23).replace('T', ' ') : String(value);
  for (const [sql, params] of [
    ['SELECT id,last_seen_at AS changed_at FROM po_contents FORCE INDEX (po_contents_change_clock_idx) WHERE last_seen_at>=?', [since]],
    ['SELECT content_id AS id,analyzed_at AS changed_at FROM po_analyses FORCE INDEX (po_analyses_change_clock_idx) WHERE analyzed_at>=?', [since]],
    ["SELECT content_id AS id,updated_at AS changed_at FROM po_content_translations FORCE INDEX (po_translations_change_clock_idx) WHERE target_language='zh-CN' AND translation_version=? AND updated_at>=?", [process.env.AI_TRANSLATION_VERSION || 'translation-v1', since]]
  ]) {
    for (const row of await repo.query(sql, params)) {
      if (!tracked.has(row.id)) continue;
      const changed = stamp(row.changed_at);
      if (!changes.has(row.id) || changed > changes.get(row.id)) changes.set(row.id, changed);
    }
  }
  const rows = [...changes].map(([id, changed_at]) => ({ id, changed_at }))
    .filter(row => row.changed_at > since || (row.changed_at === since && row.id > (state.changeId || '')))
    .sort((a, b) => a.changed_at.localeCompare(b.changed_at) || a.id.localeCompare(b.id)).slice(0, limit);
  let written = 0;
  for (const row of rows) {
    const temporary = { ...state, cursor: '' };
    const result = await syncPage({ repo, client, state: temporary, contentIds: [row.id], save: async () => {} });
    written += result.written;
    state.changeSince = row.changed_at instanceof Date ? row.changed_at.toISOString().slice(0, 23).replace('T', ' ') : String(row.changed_at);
    state.changeId = row.id; await save(state);
  }
  return { examined: rows.length, written };
}
async function run() {
  const runtimeRoot=process.env.PUBLIC_OPINION_RUNTIME_ROOT||path.resolve(__dirname,'../..');
  require(path.join(runtimeRoot,'server/src/runtimeEnv')).loadRuntimeEnv();
  const {Repository}=require(path.join(runtimeRoot,'server/src/db/repository'));const repo=new Repository();
  const file='C:/ProgramData/PublicOpinion/data/baas-live/state.json';
  let lock;
  try {
    lock=await repo.pool.getConnection();const [rows]=await lock.query("SELECT GET_LOCK('po_baas_live_writer',0) acquired");if(!Number(rows[0].acquired))return;
    let state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
    if(!state){const rows=await repo.query("SELECT DATE_FORMAT(DATE_ADD(NOW(),INTERVAL 1 SECOND),'%Y-%m-%d %H:%i:%s') cutover");state={cutover:rows[0].cutover,cursor:'',hashes:{}};saveState(file,state);}
    if(process.argv.includes('--init')){console.log(JSON.stringify({initialized:true,cutover:state.cutover}));return;}
    const client=new BaasClient(readToken('C:/ProgramData/PublicOpinion/config/baas-data-token.dpapi'));await client.verify();
    const result=await syncPage({repo,client,state,save:state=>saveState(file,state)});
    const changes = await syncChanged({ repo, client, state, save: state => saveState(file, state) });
    let historical={examined:0,written:0};
    if(state.trackedIds?.length){const refresh={...state,cursor:state.refreshCursor||''};historical=await syncPage({repo,client,state:refresh,contentIds:state.trackedIds,save:updated=>{state.refreshCursor=updated.cursor;saveState(file,state);}});}
    const { publishMetadata } = require(path.join(runtimeRoot, 'server/src/services/baasReadMetadata'));
    const metadata = await publishMetadata({ repo, token: client.token, contentIds: Object.keys(state.hashes).sort(), previousHash: state.metadataHash });
    state.metadataHash = metadata.hash; saveState(file, state);
    if (process.env.PUBLIC_OPINION_QUERY_PROJECTOR_MODULE) {
      const projector = process.env.PUBLIC_OPINION_QUERY_PROJECTOR_MODULE;
      if (!path.isAbsolute(projector)) throw new Error('Query projector must be an absolute module path');
      await require(projector).synchronize({ repo, token: client.token, contentIds: Object.keys(state.hashes).sort() });
    }
    const status={at:new Date().toISOString(),cutover:state.cutover,...result,changedExamined:changes.examined,changedUpdated:changes.written,historyExamined:historical.examined,historyUpdated:historical.written,metadataWritten:metadata.written,acknowledgedContents:Object.keys(state.hashes).length,status:'success'};
    saveState('C:/ProgramData/PublicOpinion/data/baas-live/status.json',status);console.log(JSON.stringify(status));
  } finally {if(lock){try{await lock.query("SELECT RELEASE_LOCK('po_baas_live_writer')");}finally{lock.release();}}await repo.pool.end();}
}
function main(){return run().catch(error=>{const status={at:new Date().toISOString(),status:'failed',code:/^[A-Z0-9_]+$/.test(error.code||'')?error.code:'BAAS_SYNC_FAILED'};saveState('C:/ProgramData/PublicOpinion/data/baas-live/status.json',status);console.error(JSON.stringify(status));process.exitCode=1;});}
if(require.main===module)main();
module.exports={BaasClient,snapshot,syncPage,syncChanged,saveState,readToken,main};
