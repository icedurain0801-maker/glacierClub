'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const Module = require('node:module');
const net = require('node:net');
const PORT = 43322;
const ROOT = path.resolve(__dirname, '../../..', '.temp/bigplayer-recovery-20261009');
const CANDIDATE = path.join(ROOT, 'v019-read-compat-vgfxk2');
const PATHS = Object.freeze(['/health', '/api/public-opinion/sync-runs?regionCode=domestic&pageSize=20',
  '/api/public-opinion/sync-runs/68878a64-8601-44ce-91f9-5df034e4fa7e',
  '/api/public-opinion/sources/5c21f78d-5f67-4467-963d-dcdeb5e26cab/sync-runs/latest', '/api/public-opinion/sources?regionCode=domestic']);
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const fail = code => { throw Object.assign(new Error(code), { code }); };
function selectAllowed(sql) {
  return typeof sql === 'string' && /^\s*SELECT\b/i.test(sql)
    && !/;|\/\*|--|\b(INTO|OUTFILE|DUMPFILE|FOR\s+UPDATE|LOCK|SLEEP|BENCHMARK|GET_LOCK|RELEASE_LOCK|LOAD_FILE)\b/i.test(sql);
}
function verifyIdentity(identity, grants, expectedIdentity) {
  if (!expectedIdentity || identity.identity !== expectedIdentity || identity.database_name !== 'public_opinion' || Number(identity.port) !== 3306) fail('READONLY_IDENTITY_MISMATCH');
  // User-authorized current-runtime-protected-readonly: existing account
  // privileges remain unchanged. SQL protection is enforced by our transport,
  // not inferred from SHOW GRANTS. Never persist grant text or credentials.
}
async function runProtected({ createPool, loadApp, baselineFiles, expectedIdentity, output, candidateRoot = CANDIDATE, deadlineAt = Date.now()+60000 } = {}) {
  const before = Object.fromEntries(baselineFiles.map(file => [file, sha(file)]));
  const trace = [], pools = [];
  const originalLoad = Module._load, originalFetch = globalThis.fetch;
  let initializing = true, app, server, deadline, failure;
  const controller=new AbortController();
  const destroyOwned=()=>{
    server?.closeAllConnections();
    for(const pool of pools) {
      try { pool.forceDestroy?.(); } catch {}
    }
  };
  let rejectDeadline;
  const expired=new Promise((_,reject)=>{rejectDeadline=reject;});
  expired.catch(()=>{});
  const bounded=promise=>Promise.race([promise,expired]);
  const checkDeadline=()=>{if(Date.now()>=deadlineAt) fail('READONLY_DEADLINE_EXCEEDED');};
  deadline=setTimeout(()=>{
    controller.abort();destroyOwned();
    rejectDeadline(Object.assign(new Error('READONLY_DEADLINE_EXCEEDED'),{code:'READONLY_DEADLINE_EXCEEDED'}));
  },Math.max(1,deadlineAt-Date.now()));
  const denied = () => fail('READONLY_GUARD');
  const report = { port: PORT, candidateRoot, before, results: [], queryTrace: trace };
  const guardedFactory = { createPool() {
    const pool = createPool(); pools.push(pool);
    return { query: async (value, params = []) => {
      if (initializing) fail('STARTUP_DB_IO_DENIED');
      const sql = typeof value === 'string' ? value : value.sql;
      if (!selectAllowed(sql)) denied();
      const started = Date.now();
      const result = await bounded(pool.query({ sql, timeout: 8000 }, params));
      trace.push({ sha256: crypto.createHash('sha256').update(sql).digest('hex'), ms: Date.now()-started, rows: Array.isArray(result[0]) ? result[0].length : 0 });
      return result;
    }, execute: denied, getConnection: denied, end: () => pool.end() };
  } };
  try {
    checkDeadline();
    // Install protections BEFORE any candidate application constructor runs.
    Module._load = function(request, parent, isMain) {
      if (request === 'mysql2/promise') return guardedFactory;
      return originalLoad.call(this, request, parent, isMain);
    };
    globalThis.fetch = denied;
    app = loadApp(guardedFactory);
    initializing = false;
    // Identity/grants use the underlying explicitly configured pool only;
    // app never receives getConnection/execute or SHOW GRANTS capability.
    if (pools.length !== 1) fail('UNEXPECTED_POOL_COUNT');
    const [[identity]] = await bounded(pools[0].query({sql:'SELECT CURRENT_USER() AS identity,DATABASE() AS database_name,@@port AS port',timeout:3000}));
    const [grants] = await bounded(pools[0].query({sql:'SHOW GRANTS',timeout:3000}));
    verifyIdentity(identity, grants, expectedIdentity);
    report.identity = identity;
    server = http.createServer((req,res) => {
      if (req.method !== 'GET' || !PATHS.includes(req.url)) { res.writeHead(405); res.end(); return; }
      app.handler(req,res).catch(() => { if(!res.headersSent) res.writeHead(500); res.end(); });
    });
    await bounded(new Promise((resolve,reject) => { server.once('error',reject); server.listen(PORT,'127.0.0.1',resolve); }));
    const started = Date.now();
    for (const route of PATHS) {
      if(Date.now()-started>=50000) fail('WINDOW_EXHAUSTED');
      const at = Date.now();
      const result = await bounded(originalFetch(`http://127.0.0.1:${PORT}${route}`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])}));
      const body = await bounded(result.json());
      report.results.push({path:route,http:result.status,ms:Date.now()-at,items:Array.isArray(body.data)?body.data.length:body.data?.items?.length});
      if(result.status!==200) fail('HTTP_ACCEPTANCE_FAILED');
    }
    report.status = 'PASS_READONLY_HTTP';
  } catch(error) {
    failure=error;report.status='FAIL_READONLY_EXECUTION';report.errorCode=error.code||'READONLY_EXECUTOR_FAILED';
  } finally {
    try {
      if(server) { server.closeAllConnections(); await bounded(new Promise(resolve=>server.close(resolve))); }
      await bounded(Promise.all(pools.map(pool=>pool.end())));
      checkDeadline();
    } catch(error) {
      failure ||= error;report.status='FAIL_READONLY_EXECUTION';report.errorCode=error.code||'READONLY_CLEANUP_FAILED';
      controller.abort();destroyOwned();
    }
    Module._load=originalLoad; globalThis.fetch=originalFetch;
    report.after=Object.fromEntries(baselineFiles.map(file=>[file,sha(file)]));
    report.hashesUnchanged=JSON.stringify(report.before)===JSON.stringify(report.after);
    if(!report.hashesUnchanged) report.status='FAIL_BASELINE_CHANGED';
    if(output) fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    clearTimeout(deadline);
  }
  if(!report.hashesUnchanged) fail('BASELINE_CHANGED');
  if(failure) throw failure;
  return report;
}
async function main() {
  const deadlineAt=Date.now()+60000;
  // This command is prepared only; caller must supply a separately approved
  // plan file. No default env credentials, no service mutation or migration.
  if(process.argv[2]!=='--approved-readonly' || !process.argv[3]) fail('PRODUCTION_EXECUTION_DISABLED');
  const plan=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
  if(plan.approved!==true || plan.executorSha256!==sha(__filename) || !path.isAbsolute(plan.envFile)
    || !path.isAbsolute(plan.output) || !Array.isArray(plan.baselineFiles) || plan.baselineFiles.length<8) fail('APPROVED_PLAN_REQUIRED');
  if(plan.authorizationMode!=='current-runtime-protected-readonly') fail('APPROVED_AUTHORIZATION_MODE_REQUIRED');
  const required=[path.join(CANDIDATE,'server/src/app.js'),path.join(CANDIDATE,'server/src/db/repository.js'),path.join(CANDIDATE,'package-release-manifest.json'),
    'C:/ProgramData/PublicOpinion/releases/v019-lastnight-token-20261008/server/src/app.js',
    'C:/ProgramData/PublicOpinion/releases/v019-lastnight-token-20261008/server/src/db/repository.js',
    'C:/ProgramData/PublicOpinion/releases/v019-lastnight-token-20261008/package-release-manifest.json',
    'C:/ProgramData/PublicOpinion/services/PublicOpinionApi.xml','C:/ProgramData/PublicOpinion/services/PublicOpinionWorker.xml',
    'C:/ProgramData/PublicOpinion/releases/worker-release-taptap-20260921-v055-formal1/worker/src/worker.js',
    'C:/ProgramData/PublicOpinion/frontend3001/releases/release-20260924123831-boardid-save/public/admin/PublicOpinion/assets/sources.js'];
  const canonical=file=>path.resolve(file).toLowerCase();
  if(required.some(file=>!plan.baselineFiles.map(canonical).includes(canonical(file)))) fail('BASELINE_INVENTORY_INCOMPLETE');
  if(!plan.expectedBefore || plan.baselineFiles.some(file=>!path.isAbsolute(file)||sha(file)!==plan.expectedBefore[file])) fail('APPROVED_BASELINE_CHANGED');
  if(fs.existsSync(plan.output)) fail('EVIDENCE_OUTPUT_EXISTS');
  if(sha(path.join(CANDIDATE,'package-release-manifest.json'))!=='2cb014364222f660d07e4c324b4f241a6a6ff1ebe6ace2a62ef4f9f385d45f06') fail('CANDIDATE_CHANGED');
  const manifest=JSON.parse(fs.readFileSync(path.join(CANDIDATE,'package-release-manifest.json'),'utf8'));
  if(manifest.files.length!==395 || manifest.files.some(entry=>path.isAbsolute(entry.path)||entry.path.split(/[\\/]/).includes('..')||sha(path.join(CANDIDATE,entry.path))!==entry.sha256.toLowerCase())) fail('CANDIDATE_INVENTORY_CHANGED');
  const probe=net.createServer(); await new Promise((resolve,reject)=>probe.once('error',reject).listen(PORT,'127.0.0.1',resolve)); await new Promise(resolve=>probe.close(resolve));
  process.loadEnvFile(plan.envFile);
  if(process.env.DATABASE_URL || process.env.DB_HOST!=='127.0.0.1' || Number(process.env.DB_PORT)!==3306 || process.env.DB_NAME!=='public_opinion') fail('DB_TARGET_MISMATCH');
  const mysql=require('mysql2/promise');
  process.env.PUBLIC_OPINION_SERVICE_MODE='1'; process.env.PUBLIC_OPINION_ENV_FILE=plan.envFile;
  if(Date.now()>=deadlineAt) fail('READONLY_DEADLINE_EXCEEDED');
  const result=await runProtected({ deadlineAt,expectedIdentity:plan.expectedIdentity, baselineFiles:plan.baselineFiles,output:plan.output,
    createPool:()=>{
      const pool=mysql.createPool({host:'127.0.0.1',port:3306,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:'public_opinion',connectTimeout:3000,connectionLimit:1,multipleStatements:false,dateStrings:true,timezone:'Z'});
      // mysql2's underlying pool owns only this executor's connections.
      pool.forceDestroy=()=>{for(const connection of pool.pool._allConnections.toArray()) connection.destroy();};
      return pool;
    },
    loadApp:()=>require(path.join(CANDIDATE,'server/src/app.js')) });
  console.log(JSON.stringify({status:result.status,hashesUnchanged:result.hashesUnchanged}));
}
if(require.main===module) main().catch(error=>{console.error(error.code||'READONLY_EXECUTOR_FAILED');process.exitCode=1;});
module.exports={runProtected,verifyIdentity,selectAllowed,PATHS,PORT};
