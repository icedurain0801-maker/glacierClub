'use strict';
const {SOURCE_ID}=require('./lastNightScope');
const fail=()=>{throw Object.assign(new Error('LAST_NIGHT_DB_READONLY_GUARD'),{code:'LAST_NIGHT_DB_READONLY_GUARD'});};
const normalize=sql=>typeof sql==='string'?sql.replace(/\s+/g,' ').trim():'';
const SQL=[
  'SELECT CURRENT_USER() AS identity,DATABASE() AS db,@@port AS port',
  'SELECT s.*,g.region_code,c.status AS community_status FROM po_sources s JOIN po_games g ON g.id=s.game_id JOIN po_communities c ON c.id=s.community_id WHERE s.id=?',
  'SELECT * FROM po_accounts WHERE id=? AND source_id=?',
  'SELECT site_id,url,enabled FROM po_source_sites WHERE source_id=? ORDER BY site_id',
  'SELECT id, account_id, credential_type, status, expire_at, last_checked_at, failure_reason, secret_ref, secret_cipher FROM po_credentials WHERE account_id=? AND credential_type=? ORDER BY updated_at DESC LIMIT 1'
];
function assertRead(sql,params,accountId) {
  const index=SQL.indexOf(normalize(sql));
  const expected=[[],[SOURCE_ID],[accountId,SOURCE_ID],[SOURCE_ID],[accountId,'api_token']][index];
  if(!expected||!Array.isArray(params)||params.length!==expected.length||params.some((value,i)=>value!==expected[i])) fail();
}
function protectReadonlyRepository(repo,accountId) {
  const original=repo.pool.query.bind(repo.pool);
  repo.pool.query=(sql,params=[])=>{assertRead(sql,params,accountId);return original({sql,timeout:8000},params);};
  repo.pool.execute=fail;repo.pool.getConnection=fail;
  const facade=Object.create(null);
  facade.query=(sql,params=[])=>{assertRead(sql,params,accountId);return repo.query(sql,params);};
  facade.getCredentialByAccount=(id,type,options)=>{
    if(id!==accountId||type!=='api_token'||options?.includeSecret!==true) fail();
    return repo.getCredentialByAccount.call(facade,id,type,options);
  };
  // Prove dispatch refusal before resolver/HTTP: all probes are rejected locally.
  let denied=0;
  for(const sql of ['UPDATE po_contents SET title=?','SELECT GET_LOCK(?,0)','SELECT 1 INTO OUTFILE ?','SELECT 1; DELETE FROM po_contents']) {
    let rejected=false;
    try {facade.query(sql,[]);} catch(error) {if(error.code!=='LAST_NIGHT_DB_READONLY_GUARD') throw error;denied++;rejected=true;}
    if(!rejected) throw Object.assign(new Error('LAST_NIGHT_GUARD_PROOF_FAILED'),{code:'LAST_NIGHT_GUARD_PROOF_FAILED'});
  }
  return {repo:Object.freeze(facade),evidence:{mode:'exact-readonly-capability',allowedMethods:['query','getCredentialByAccount'],startupDeniedProbes:denied}};
}
module.exports={assertRead,protectReadonlyRepository};
