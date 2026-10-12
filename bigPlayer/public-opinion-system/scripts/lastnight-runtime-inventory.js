'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const project=path.resolve(__dirname,'..');
const fail=()=>{throw Object.assign(new Error('LAST_NIGHT_CANDIDATE_INVENTORY_INVALID'),{code:'LAST_NIGHT_CANDIDATE_INVENTORY_INVALID'});};
const sha=file=>crypto.createHash('sha256').update(fs.lstatSync(file).isSymbolicLink()?`workspace-link:${fs.realpathSync(file)}`:fs.readFileSync(file)).digest('hex');
function inventory() {
  const files=new Set();
  const inside=file=>{const rel=path.relative(project,file);if(!rel||rel.startsWith('..')||path.isAbsolute(rel)) fail();};
  function visit(file) {
    file=path.resolve(file);inside(file);
    if(files.has(file)) return;
    if(!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink()||!fs.statSync(file).isFile()) fail();
    files.add(file);
    if(file.endsWith('.js')) {
      const source=fs.readFileSync(file,'utf8');
      for(const match of source.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        if(match[1].startsWith('.')) visit(require.resolve(path.resolve(path.dirname(file),match[1])));
      }
    }
  }
  visit(path.join(project,'scripts/lastnight-bounded-runtime.js'));
  visit(path.join(project,'scripts/lastnight-precise-alignment.js'));
  visit(path.join(project,'scripts/lastnight-catchup-handoff.js'));
  // Repository is deliberately loaded only after plan/env gates at runtime.
  visit(path.join(project,'server/src/db/repository.js'));
  for(const name of ['package.json','package-lock.json']) visit(path.join(project,name));
  function walk(dir) {
    if(fs.lstatSync(dir).isSymbolicLink()) fail();
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
      const file=path.join(dir,entry.name);
      if(entry.isSymbolicLink()) {
        const workspace={'public-opinion-system-server':'server','public-opinion-system-worker':'worker'}[entry.name];
        if(dir!==path.join(project,'node_modules')||!workspace||fs.realpathSync(file)!==fs.realpathSync(path.join(project,workspace))) fail();
        files.add(file);visit(path.join(project,workspace,'package.json'));continue;
      }
      if(entry.isDirectory()) walk(file);else if(entry.isFile()) files.add(file);else fail();
    }
  }
  // Freeze actual installed dependencies, including dynamic loaders/data, without upgrading.
  walk(path.join(project,'node_modules'));
  return [...files].sort().map(file=>({path:file,sha256:sha(file)}));
}
function verifyInventory(plan) {
  const expected=inventory();
  if(plan.nodeVersion!==process.version||!Array.isArray(plan.files)||plan.files.length!==expected.length) fail();
  const seen=new Set();
  for(const entry of plan.files) {
    if(typeof entry?.path!=='string'||!path.isAbsolute(entry.path)||entry.path!==path.resolve(entry.path)) fail();
    const key=entry.path.toLowerCase();if(seen.has(key)) fail();seen.add(key);
    const required=expected.find(item=>item.path===entry.path);
    if(!required||required.sha256!==entry.sha256) fail();
  }
  return expected.length;
}
module.exports={inventory,verifyInventory};
