'use strict';
const fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto');
const { canonical } = require('./overseasBigPlayerRunContractJournal');
const { iso } = require('./overseasBigPlayerNetworkContractVerifier');
const { normalizeSiteUrls } = require('../../server/src/services/bigplayerSiteConfig');
const { boardIdOf } = require('../../shared/bigPlayerBoard');
const readers = new WeakSet();
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const fail = code => { throw Object.assign(new Error(code), { code }); };
const dbIso = value => iso(typeof value === 'string' ? value.replace(/(\.\d{3})000$/, '$1') : value);
function runId(requestId, sourceId, accountId, siteId) {
  const hex = sha(canonical(['overseas-manual-v1',requestId,sourceId,accountId,siteId])).slice(0,32);
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
async function cursorEvidence(conn, scope) {
  const [rows] = await conn.query(`SELECT id,account_id,site_id,task_kind,task_key,sync_scope,root_platform_content_id,
    status,window_start,window_end,last_item_at FROM po_sync_checkpoints
    WHERE account_id=? AND site_id=? AND status='completed' AND last_item_at IS NOT NULL
    AND task_key LIKE ? ORDER BY id FOR UPDATE`, [scope.accountId,scope.siteId,`board:${scope.boardId}:%`]);
  const seen = new Set();
  const normalized = rows.map(row => {
    if (typeof row.id !== 'string' || seen.has(row.id) || row.account_id !== scope.accountId || row.site_id !== scope.siteId
      || row.status !== 'completed' || typeof row.task_key !== 'string' || !row.task_key.startsWith(`board:${scope.boardId}:`)
      || !['posts','comments','replies','feeds'].includes(row.sync_scope)) fail('OVERSEAS_MANUAL_CURSOR_INVALID');
    seen.add(row.id);
    const result = {};
    for (const key of ['id','account_id','site_id','task_kind','task_key','sync_scope','root_platform_content_id','status','window_start','window_end','last_item_at']) {
      if (!Object.hasOwn(row,key)) fail('OVERSEAS_MANUAL_CURSOR_INVALID');
      result[key] = key === 'last_item_at' ? dbIso(row[key]) : row[key];
      if (result[key] instanceof Date) result[key] = dbIso(result[key]);
    }
    return result;
  }).sort((a,b) => a.id.localeCompare(b.id));
  return Object.freeze({siteId:scope.siteId,rowsSha256:sha(canonical(normalized)),
    maxCursor:normalized.length ? normalized.map(row=>row.last_item_at).sort().at(-1) : null});
}
function evidenceOf(value, request) {
  if (!value || Object.keys(value).sort().join(',') !== 'admissionAnchor,cursors' || !Array.isArray(value.cursors)
    || value.cursors.length !== request.bindings.length) fail('OVERSEAS_MANUAL_WINDOW_EVIDENCE_INVALID');
  const admissionAnchor = iso(value.admissionAnchor);
  if (admissionAnchor < request.expectedMarker) fail('OVERSEAS_MANUAL_WINDOW_EVIDENCE_INVALID');
  const cursors = value.cursors.map(cursor => {
    if (!cursor || Object.keys(cursor).sort().join(',') !== 'maxCursor,rowsSha256,siteId'
      || !/^[a-f0-9]{64}$/.test(cursor.rowsSha256 || '')) fail('OVERSEAS_MANUAL_WINDOW_EVIDENCE_INVALID');
    return {siteId:cursor.siteId,rowsSha256:cursor.rowsSha256,maxCursor:cursor.maxCursor === null ? null : iso(cursor.maxCursor)};
  }).sort((a,b)=>a.siteId.localeCompare(b.siteId));
  for (let i=0;i<cursors.length;i++) {
    const b = request.bindings[i], c = cursors[i];
    if (c.siteId !== b.siteId || (i && c.siteId === cursors[i-1].siteId)) fail('OVERSEAS_MANUAL_WINDOW_EVIDENCE_INVALID');
    const window = require('../../server/src/db/repository').effectiveBigPlayerWindow(admissionAnchor,c.maxCursor);
    if (dbIso(window.windowStart) !== b.windowStart || dbIso(window.windowEnd) !== b.windowEnd) fail('OVERSEAS_MANUAL_WINDOW_EVIDENCE_INVALID');
  }
  const evidence = {admissionAnchor,cursors};
  const identity = {expectedMarker:request.expectedMarker,evidence,bindings:request.bindings.map(({runId,...scope})=>scope)};
  if (sha(canonical(identity)) !== request.requestId) fail('OVERSEAS_MANUAL_RECEIPT_IDENTITY_INVALID');
  return evidence;
}
async function createOverseasManualReceipt({repositoryRoot,directory,statePolicy} = {}) {
  if (!path.isAbsolute(repositoryRoot || '') || !path.isAbsolute(directory || '')) fail('OVERSEAS_MANUAL_RECEIPT_DIRECTORY_INVALID');
  const root = await fs.realpath(repositoryRoot), temp = path.join(root,'.temp'), target = path.resolve(directory);
  const relative = path.relative(temp,target);
  if (!relative || relative === '..' || relative.startsWith('..'+path.sep) || path.isAbsolute(relative)) fail('OVERSEAS_MANUAL_RECEIPT_DIRECTORY_INVALID');
  async function recheck() {
    if(statePolicy!=null)await require('./overseasStateDirectoryPolicy').resolveStateDirectory({policy:statePolicy,directory:target});
    let current=root;
    for (const part of ['.temp',...relative.split(path.sep)]) {
      current=path.join(current,part);const stat=await fs.lstat(current);
      if(stat.isSymbolicLink() || !stat.isDirectory()) fail('OVERSEAS_MANUAL_RECEIPT_DIRECTORY_INVALID');
    }
    if(await fs.realpath(target)!==target)fail('OVERSEAS_MANUAL_RECEIPT_DIRECTORY_INVALID');
  }
  await recheck();
  const requestOf = value => require('../../server/src/db/overseasManualHandoff').requestOf(value);
  const filename = id => {
    if (!/^[a-f0-9]{64}$/.test(id || '')) fail('OVERSEAS_MANUAL_REQUEST_INVALID');
    return path.join(target,`overseas-manual-${id}.json`);
  };
  const envelope = (request,evidence) => ({format:'overseas-manual-receipt-v1',request,evidence,
    receiptSha256:sha(canonical({request,evidence}))});
  async function readEnvelope(requestId) {
    await recheck();const file=filename(requestId);let handle;
    try {
      const stat=await fs.lstat(file);
      if(stat.isSymbolicLink()||!stat.isFile()||stat.nlink!==1||stat.size>524288)fail('OVERSEAS_MANUAL_RECEIPT_FILE_INVALID');
      handle=await fs.open(file,'r');const opened=await handle.stat();
      if(opened.dev!==stat.dev||opened.ino!==stat.ino||opened.size!==stat.size)fail('OVERSEAS_MANUAL_RECEIPT_FILE_INVALID');
      const raw=await handle.readFile('utf8');let parsed;try{parsed=JSON.parse(raw);}catch{fail('OVERSEAS_MANUAL_RECEIPT_FILE_INVALID');}
      if(parsed?.format!=='overseas-manual-receipt-v1'||Object.keys(parsed).sort().join(',')!=='evidence,format,receiptSha256,request')fail('OVERSEAS_MANUAL_RECEIPT_FILE_INVALID');
      const request=requestOf(parsed.request),evidence=evidenceOf(parsed.evidence,request);
      if(request.requestId!==requestId||raw!==canonical(envelope(request,evidence))+'\n')fail('OVERSEAS_MANUAL_RECEIPT_FILE_INVALID');
      return {request,evidence};
    } finally {await handle?.close();}
  }
  async function prepare({repo,sourceId,expectedMarker,manifestSha256} = {}) {
    const expected=iso(expectedMarker);
    if(typeof repo?.pool?.getConnection!=='function'||!/^[a-f0-9]{64}$/.test(manifestSha256||''))fail('OVERSEAS_MANUAL_REQUEST_INVALID');
    const conn=await repo.pool.getConnection();let started=false,destroyed=false;let request,evidence;
    try {
      await conn.beginTransaction();started=true;
      const [rows]=await conn.query(`SELECT s.id,s.game_id,s.community_id,s.platform,s.config,s.enabled,s.default_account_id,
        s.auth_status,(s.auth_expire_at IS NOT NULL AND s.auth_expire_at<=UTC_TIMESTAMP(3)) AS auth_expired,
        DATE_FORMAT(s.collect_requested_at,'%Y-%m-%d %H:%i:%s.%f') AS marker,
        DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%d %H:%i:%s.%f') AS admission_anchor,
        g.region_code,g.enabled AS game_enabled,c.game_id AS community_game,c.status AS community_status
        FROM po_sources s JOIN po_games g ON g.id=s.game_id JOIN po_communities c ON c.id=s.community_id WHERE s.id=? FOR UPDATE`,[sourceId]);
      const s=rows[0];
      if(rows.length!==1||!s||s.id!==sourceId||s.platform!=='bigplayer_h5'||s.region_code!=='overseas'
        ||Number(s.enabled)!==1||Number(s.game_enabled)!==1||s.community_status!=='enabled'||s.community_game!==s.game_id
        ||s.auth_status!=='authorized'||Number(s.auth_expired)!==0)fail('OVERSEAS_MANUAL_SCOPE_INVALID');
      if(s.marker==null||dbIso(s.marker)!==expected)fail('WORKER_MANUAL_MARKER_CHANGED');
      let config;try{config=typeof s.config==='string'?JSON.parse(s.config):s.config;}catch{fail('OVERSEAS_MANUAL_SCOPE_INVALID');}
      if(!config||Array.isArray(config)||(Object.hasOwn(config,'deleted')&&config.deleted!==false)||!boardIdOf(s))fail('OVERSEAS_MANUAL_SCOPE_INVALID');
      const [accounts]=await conn.query(`SELECT id,source_id,game_id,community_id,platform,enabled,auth_status,
        (auth_expire_at IS NOT NULL AND auth_expire_at<=UTC_TIMESTAMP(3)) AS auth_expired FROM po_accounts WHERE id=? FOR UPDATE`,[s.default_account_id]);
      const a=accounts[0];
      if(accounts.length!==1||!a||a.id!==s.default_account_id||a.source_id!==s.id||a.game_id!==s.game_id||a.community_id!==s.community_id
        ||a.platform!==s.platform||Number(a.enabled)!==1||a.auth_status!=='authorized'||Number(a.auth_expired)!==0)fail('OVERSEAS_MANUAL_SCOPE_INVALID');
      const [credentials]=await conn.query(`SELECT id,status,(expire_at IS NOT NULL AND expire_at<=UTC_TIMESTAMP(3)) AS credential_expired,
        (secret_cipher IS NOT NULL AND OCTET_LENGTH(secret_cipher)>0) AS has_secret_cipher FROM po_credentials
        WHERE source_id=? AND account_id=? AND credential_type='api_token' ORDER BY updated_at DESC,id DESC LIMIT 1 FOR UPDATE`,[s.id,a.id]);
      if(credentials.length!==1||credentials[0].status!=='active'||Number(credentials[0].credential_expired)!==0||Number(credentials[0].has_secret_cipher)!==1)fail('OVERSEAS_MANUAL_CREDENTIAL_INVALID');
      const sites=normalizeSiteUrls(config).siteUrls.filter(site=>site.enabled).sort((a,b)=>a.siteId.localeCompare(b.siteId));
      const [registry]=await conn.query('SELECT site_id,url,url_hash,enabled FROM po_source_sites WHERE source_id=? AND enabled=1 ORDER BY site_id FOR UPDATE',[s.id]);
      if(!sites.length||sites.length!==registry.length)fail('OVERSEAS_MANUAL_SITE_CONFLICT');
      const admissionAnchor=dbIso(s.admission_anchor), cursors=[], scopes=[];
      for(const site of sites) {
        if(registry.filter(row=>row.site_id===site.siteId&&row.url===site.url&&row.url_hash===sha(site.url)&&Number(row.enabled)===1).length!==1)fail('OVERSEAS_MANUAL_SITE_CONFLICT');
        const scope={sourceId:s.id,accountId:a.id,gameId:a.game_id,communityId:a.community_id,boardId:boardIdOf(s),
          siteId:site.siteId,siteUrl:site.url,siteUrlSha256:sha(site.url),manifestSha256};
        const cursor=await cursorEvidence(conn,scope);cursors.push(cursor);
        const window=require('../../server/src/db/repository').effectiveBigPlayerWindow(admissionAnchor,cursor.maxCursor);
        scopes.push({...scope,windowStart:dbIso(window.windowStart),windowEnd:dbIso(window.windowEnd)});
      }
      evidence={admissionAnchor,cursors};
      const requestId=sha(canonical({expectedMarker:expected,evidence,bindings:scopes}));
      request=requestOf({requestId,expectedMarker:expected,bindings:scopes.map(b=>({...b,runId:runId(requestId,b.sourceId,b.accountId,b.siteId)}))});
      evidenceOf(evidence,request);
      await conn.rollback();started=false;
    } catch(error) {
      if(started)try{await conn.rollback();}catch{destroyed=true;conn.destroy();}
      throw error;
    } finally {if(!destroyed)conn.release();}
    // Publishing after releasing SQL locks is intentional. Handoff rechecks
    // scope and cursor evidence; file presence alone is never a DB commit ACK.
    await recheck();const pending=path.join(target,`.manual-${crypto.randomUUID()}.pending`);let handle,created=false;
    try {
      handle=await fs.open(pending,'wx',0o600);created=true;
      await handle.writeFile(canonical(envelope(request,evidence))+'\n');await handle.sync();await handle.close();handle=null;
      await recheck();try{await fs.link(pending,filename(request.requestId));}catch(error){if(error.code!=='EEXIST')throw error;}
      await fs.unlink(pending);created=false;
      return (await readEnvelope(request.requestId)).request;
    } finally {await handle?.close();if(created)try{await fs.unlink(pending);}catch{}}
  }
  const reader=Object.freeze({prepare,recover:async id=>(await readEnvelope(id)).request,
    async read(expected){const r=requestOf(expected),stored=await readEnvelope(r.requestId);if(canonical(stored.request)!==canonical(r))fail('OVERSEAS_MANUAL_RECEIPT_MISMATCH');return stored.request;},
    async readEvidence(expected){await this.read(expected);return (await readEnvelope(expected.requestId)).evidence;},productionActivationAllowed:false});
  readers.add(reader);return reader;
}
module.exports={createOverseasManualReceipt,isTrustedManualReceipt:value=>readers.has(value),cursorEvidence,evidenceOf,dbIso};
