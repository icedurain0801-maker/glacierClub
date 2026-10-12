'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const project = path.resolve(__dirname, '../../..'), output = path.resolve(project, '../../.temp/sync-auth-persistence-fix-20261010');
const apiBaseline = 'C:/ProgramData/PublicOpinion/releases/release-20261010-capability-probe-fix';
const frontBaseline = 'C:/ProgramData/PublicOpinion/frontend3001/releases/release-20261010-capability-v213';
const apiCandidate = path.join(output,'api-release'), frontCandidate = path.join(output,'frontend-release');
assert(!fs.existsSync(apiCandidate) && !fs.existsSync(frontCandidate)); fs.mkdirSync(output,{recursive:true});
fs.cpSync(apiBaseline,apiCandidate,{recursive:true}); fs.cpSync(frontBaseline,frontCandidate,{recursive:true});
function block(file,start,end) {
  const target=path.join(apiCandidate,file), before=fs.readFileSync(target,'utf8'), after=fs.readFileSync(path.join(project,file),'utf8');
  const a=before.indexOf(start),b=before.indexOf(end,a),c=after.indexOf(start),d=after.indexOf(end,c); assert(a>=0&&b>a&&c>=0&&d>c);
  fs.writeFileSync(target,before.slice(0,a)+after.slice(c,d)+before.slice(b));
}
block('server/src/connectors/bigPlayerH5Connector.js','  async loadApiToken(','  async requestQ1(');
block('server/src/services/credentialContext.js','  async loadSecretObject(','\n}\n\nfunction parseSecretObject');
block('server/src/db/repository.js','  async upsertAccountCredential(','  async clearAccountCredential(');
block('server/src/app.js','    const publicMessages = {','    const publicMessage = ');
for(const file of ['assets/sources.js','sources.html'])fs.copyFileSync(path.join(project,'../admin/PublicOpinion',file),path.join(frontCandidate,'public/admin/PublicOpinion',file));
const hash = file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function files(root,prefix=''){return fs.readdirSync(root,{withFileTypes:true}).flatMap(e=>{assert(!e.isSymbolicLink());const rel=path.posix.join(prefix,e.name);return e.isDirectory()?files(path.join(root,e.name),rel):[rel];});}
const changes=[];
for(const [baseline,candidate,expected,manifest] of [
  [apiBaseline,apiCandidate,['server/src/app.js','server/src/services/credentialContext.js','server/src/connectors/bigPlayerH5Connector.js','server/src/db/repository.js'],'package-release-manifest.json'],
  [frontBaseline,frontCandidate,['public/admin/PublicOpinion/assets/sources.js','public/admin/PublicOpinion/sources.html'],'frontend3001-release-manifest.json']
]) {
  const changed=files(baseline).filter(file=>file!==manifest&&hash(path.join(baseline,file))!==hash(path.join(candidate,file)));
  assert.deepEqual(changed.sort(),expected.sort()); changes.push(...changed.map(file=>({release:candidate,path:file,sha256:hash(path.join(candidate,file)),baselineSha256:hash(path.join(baseline,file))})));
}
const report={apiBaseline,frontBaseline,apiCandidate,frontCandidate,changes};fs.writeFileSync(path.join(output,'candidate.json'),JSON.stringify(report,null,2));console.log('PASS: isolated candidate contains exactly six changed runtime files');
