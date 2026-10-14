'use strict';
// Production metadata/empty-table reads only. Never invoke migration executor.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root='C:/Users/Administrator/AppData/Roaming/Code/User/project manage';
const mysql=require('node:module').createRequire(root+'/bigPlayer/public-opinion-system/package.json')('mysql2/promise');
const directory=root+'/.temp/qa-v068-readonly',source=root+'/.temp/risk-normalization-20261010/migration-six-intents-v099/attempt2';
const candidate=root+'/.temp/risk-normalization-20261010/candidate-current-unified-release-v097';
const envFile='C:/ProgramData/PublicOpinion/config/public-opinion.env';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const names=['po_current_analysis_intents','po_current_analysis_repair_records','po_current_analysis_intent_audit','po_overseas_current_intent_proof_audit','po_current_translation_intents','po_current_translation_intent_audit'];
const switches=['PO_CURRENT_ANALYSIS_INTENT_CONFIG','PO_CURRENT_TRANSLATION_INTENT_CONFIG'];
const statements=text=>text.replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean).map(s=>s.replace(/\s+/g,' '));
const indexes=rows=>rows.map(r=>[r.Key_name,Number(r.Non_unique),Number(r.Seq_in_index),r.Column_name]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
const result={status:'FAIL',startedUtc:new Date().toISOString(),productionWrites:false,DDL:false,servicesRestarted:false,realCollection:false,AI:false,notifications:false,loadedProof:false,cases:[],tables:[],queryKinds:[]};
let conn;
async function query(sql,args=[]){assert(/^(?:SELECT |SHOW CREATE TABLE |SHOW INDEX FROM |SET SESSION TRANSACTION READ ONLY$|START TRANSACTION READ ONLY$|ROLLBACK$)/.test(sql),'Forbidden statement');result.queryKinds.push(sql.split(' ').slice(0,3).join(' '));return conn.query(sql,args)}
(async()=>{
 assert.equal(process.argv[2],'--read-only-six-intents');assert(!fs.existsSync(directory),'Preserve prior run');fs.mkdirSync(directory);
 const sql=fs.readFileSync(source+'/migration.sql','utf8');assert.equal(hash(sql),'ecffbe7ba114a0987f2cf0e9baf8fe32a7ad2dabf6abe8057f3978f6a85467f9');
 const ddl=statements(sql),expected=statements(['001_current_analysis_intents.isolated.sql','002_overseas_intent_proof_audit.isolated.sql','003_current_translation_intents.isolated.sql'].map(f=>fs.readFileSync(candidate+'/schema/'+f,'utf8')).join('\n'));
 assert.deepEqual(ddl,expected,'Exact frozen schema semantics');assert.equal(ddl.length,6);
 const before=fs.readFileSync(source+'/environment-before.bin'),staged=fs.readFileSync(source+'/environment-staged.bin'),live=fs.readFileSync(envFile);
 assert.equal(hash(before),'a1d8ed681765d989a8c7a14e312dd1caa74c8f8a9d96298e30f102227d5c5952');assert.equal(hash(staged),'56182482ead213d48231cf7c24db8b64e2db512243f772a9fd6d9426e749e9c7');assert.deepEqual(live,staged);assert.deepEqual(live.subarray(0,before.length),before);
 const text=before.toString('utf8'),newline=text.includes('\r\n')?'\r\n':'\n';
 const suffix=(text.endsWith('\n')?'':newline)+switches.map(k=>k+'={"enabled":false}').join(newline)+newline;
 assert.deepEqual(live.subarray(before.length),Buffer.from(suffix),'Only approved two disabled lines appended');
 for(const key of switches){const lines=live.toString('utf8').split(/\r?\n/).filter(l=>new RegExp('^\\s*(?:export\\s+)?'+key+'\\s*=').test(l));assert.equal(lines.length,1);assert.deepEqual(JSON.parse(lines[0].slice(lines[0].indexOf('=')+1)),{enabled:false})}
 result.cases.push({name:'strict_environment_prefix_and_exact_disabled_suffix',status:'PASS',beforeSha:hash(before),afterSha:hash(live),configRuntimeLoaded:'UNKNOWN'});
 process.loadEnvFile(envFile);
 conn=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,connectTimeout:5000});
 await query('SET SESSION TRANSACTION READ ONLY');await query('START TRANSACTION READ ONLY');
 const [[readonly]]=await query('SELECT @@tx_read_only AS readOnly');assert.equal(Number(readonly.readOnly),1);result.readOnlySession=true;
 const [all]=await query("SELECT TABLE_NAME AS name FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' AND LEFT(TABLE_NAME,3)='po_' ORDER BY TABLE_NAME");
 const base=JSON.parse(fs.readFileSync(source+'/base-definitions-before.json','utf8'));assert.equal(base.length,33);assert.deepEqual(all.map(r=>r.name).sort(),[...base.map(r=>r.name),...names].sort());
 for(let i=0;i<names.length;i++){
  const name=names[i];assert(ddl[i].startsWith('CREATE TABLE '+name+' ('));
  const [[create]]=await query('SHOW CREATE TABLE `'+name+'`'),definition=create['Create Table'];
  const [cols]=await query('SELECT COLUMN_NAME AS name,DATA_TYPE AS dataType,COLUMN_TYPE AS columnType,IS_NULLABLE AS nullable,COLUMN_DEFAULT AS defaultValue,CHARACTER_MAXIMUM_LENGTH AS maxLength,DATETIME_PRECISION AS precisionValue FROM information_schema.columns WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION',[name]);
  const body=ddl[i].slice(ddl[i].indexOf('(')+1,ddl[i].lastIndexOf(') ENGINE'));
  // Split only commas outside nested type/index/default expressions.
  let depth=0,at=0;const parts=[];for(let j=0;j<body.length;j++){if(body[j]==='(')depth++;if(body[j]===')')depth--;if(body[j]===','&&depth===0){parts.push(body.slice(at,j).trim());at=j+1}}parts.push(body.slice(at).trim());
  const columnSpecs=parts.filter(p=>! /^(?:UNIQUE KEY |KEY |PRIMARY KEY )/.test(p));assert.equal(cols.length,columnSpecs.length);
  for(let j=0;j<columnSpecs.length;j++){
   const spec=columnSpecs[j],match=spec.match(/^(\w+) (VARCHAR\((\d+)\)|CHAR\((\d+)\)|DATETIME\((\d+)\)|BIGINT UNSIGNED|JSON)(?:\s|$)/);assert(match,'Known frozen column type');const c=cols[j];assert.equal(c.name,match[1]);
   const type=match[2].startsWith('VARCHAR')?'varchar':match[2].startsWith('CHAR')?'char':match[2].startsWith('DATETIME')?'datetime':match[2]==='JSON'?'longtext':'bigint';assert.equal(c.dataType,type);
   assert.equal(c.nullable,spec.includes('NOT NULL')||spec.includes('PRIMARY KEY')?'NO':'YES');
   if(type==='varchar'||type==='char')assert.equal(Number(c.maxLength),Number(match[3]||match[4]));
   if(type==='datetime')assert.equal(Number(c.precisionValue),3);
   if(type==='bigint')assert(c.columnType.includes('unsigned'));
   if(type==='longtext')assert(definition.includes('CHECK (json_valid(`'+c.name+'`))'),'JSON check preserved');
   if(spec.includes("DEFAULT 'pending'"))assert.equal(String(c.defaultValue).replace(/^'|'$/g,''),'pending');
   if(spec.includes('DEFAULT CURRENT_TIMESTAMP(3)'))assert.equal(String(c.defaultValue).toLowerCase(),'current_timestamp(3)');
  }
  const expectedIndexes=[];for(const part of parts){let m=part.match(/^(?:(UNIQUE )?KEY (\w+)|PRIMARY KEY)\s*\(([^)]+)\)/);if(m){const key=part.startsWith('PRIMARY KEY')?'PRIMARY':m[2],nonUnique=part.startsWith('PRIMARY KEY')||m[1]?0:1;m[3].split(',').forEach((c,j)=>expectedIndexes.push([key,nonUnique,j+1,c.trim()]))}else if(part.includes('PRIMARY KEY'))expectedIndexes.push(['PRIMARY',0,1,part.split(' ')[0]])}
  const [actualIndexes]=await query('SHOW INDEX FROM `'+name+'`');assert.deepEqual(indexes(actualIndexes),expectedIndexes.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
  assert(definition.includes('ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'));
  const [[count]]=await query('SELECT COUNT(*) AS n FROM `'+name+'`');assert.equal(Number(count.n),0);
  result.tables.push({name,definition,definitionSha:hash(definition),columns:cols,indexes:indexes(actualIndexes),rows:0});
 }
 result.cases.push({name:'six_live_frozen_definitions_indexes_and_empty_tables',status:'PASS',tables:6});
 for(const old of base){assert(/^po_[a-z0-9_]+$/.test(old.name));const [[row]]=await query('SHOW CREATE TABLE `'+old.name+'`');assert.equal(hash(row['Create Table'].replace(/AUTO_INCREMENT=\d+\s*/g,'')),old.normalizedSha256,'Original table structural definition '+old.name)}
 result.cases.push({name:'33_live_base_structures_match_preDDL_snapshot',status:'PASS',beforeOrigin:'Developer preDDL snapshot; independently matched live SHOW CREATE',autoIncrementCounterExcluded:true});
 await query('ROLLBACK');await conn.end();conn=null;
 assert.equal(hash(fs.readFileSync(envFile)),hash(live),'Environment stable during read');
 result.status='PASS_INDEPENDENT_READONLY_SCHEMA_CONFIG_ONLY';
})().catch(e=>{result.error=String(e.code||'QA_ASSERTION');result.failureMessage=/^AssertionError/.test(e.name)?'Assertion mismatch; details withheld to avoid config/credentials exposure':'Read-only verification failed; details withheld';process.exitCode=1;}).finally(async()=>{
 if(conn){await conn.rollback().catch(()=>{});await conn.end().catch(()=>{})}
 result.finishedUtc=new Date().toISOString();if(fs.existsSync(directory))fs.writeFileSync(directory+'/result.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({status:result.status,error:result.error,cases:result.cases,verifiedTables:result.tables.length,productionWrites:false,loadedProof:false}));
});
