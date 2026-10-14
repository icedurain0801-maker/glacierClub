'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {Repository}=require(path.resolve(__dirname,'../../../../../.temp/sync-auth-persistence-fix-20261010/api-compat-release/server/src/db/repository'));
const text=fs.readFileSync(path.resolve(__dirname,'../../../server/test/repository.test.js'),'utf8');const a=text.indexOf('function manualSyncHarness('),b=text.indexOf("\ntest('createSyncRun",a);
const harness=vm.runInNewContext('('+text.slice(a,b)+')',{Repository});
for(const columns of [[],['community_id','board_id','run_scope','board_run_identity'],['community_id']])test('manual sync SQL matches actual columns: '+columns.join(','),async()=>{
const h=harness();const conn=await h.repo.pool.getConnection(),original=conn.query;
conn.query=async(sql,p)=>{if(sql.startsWith('SELECT column_name FROM information_schema.columns'))return [columns.map(column_name=>({column_name}))];return original(sql,p);};
const r=await h.repo.startSourceSync({sourceId:'s1'});assert(r.run.id);const insert=h.executed.find(c=>c.sql.startsWith('INSERT INTO po_sync_runs'));assert(insert);
const fields=insert.sql.slice(0,insert.sql.indexOf('VALUES'));for(const name of ['community_id','board_id','run_scope','board_run_identity'])assert.equal(fields.includes(name),columns.includes(name));
assert.equal(insert.params.length,6+columns.length);assert(h.executed.some(c=>c.sql==='COMMIT'));
});
