'use strict';
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {createRequire,builtinModules}=require('node:module');
const root=path.resolve(process.argv[2]||''),sourceRoot=path.resolve(process.argv[3]||''),write=process.argv.includes('--write-manifest');
const manifestName='package-worker-release-manifest.json',builtins=new Set([...builtinModules,...builtinModules.map(x=>`node:${x}`)]);
function fail(m){throw new Error(m)} function inside(r,c){const x=path.relative(r,c);return x===''||(!x.startsWith('..')&&!path.isAbsolute(x))}
function walk(dir){let out=[];for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name),s=fs.lstatSync(f);if(s.isSymbolicLink())fail(`reparse point is forbidden: ${f}`);if(e.isDirectory())out=out.concat(walk(f));else if(e.isFile())out.push(f);else fail(`unsupported release entry: ${f}`)}return out}
for(const req of ['package.json','package-lock.json','worker/src/worker.js','server/src/runtimeEnv.js','scripts/q1_crawler.py']){const f=path.join(root,req);if(!fs.existsSync(f)||!fs.statSync(f).isFile())fail(`required Worker release file missing: ${req}`)}
const files=walk(root).filter(f=>path.basename(f)!==manifestName);
for(const file of files){const rel=path.relative(root,file).replaceAll('\\','/');if(!(rel==='package.json'||rel==='package-lock.json'||rel==='scripts/q1_crawler.py'||rel.startsWith('worker/src/')||rel.startsWith('server/src/')||rel.startsWith('shared/')||rel.startsWith('node_modules/')))fail(`Worker release allowlist violation: ${rel}`);const text=fs.readFileSync(file).toString('utf8');if(!rel.startsWith('node_modules/')&&(text.toLowerCase().includes(sourceRoot.toLowerCase())||/[A-Za-z]:\\Users\\|[A-Za-z]:\\[^\\\r\n]*\\AppData\\/i.test(text)))fail(`source path leakage: ${rel}`)}
const patterns=[/require(?:\.resolve)?\(\s*['"]([^'"]+)['"]\s*\)/g,/import\(\s*['"]([^'"]+)['"]\s*\)/g];
for(const file of files.filter(f=>f.endsWith('.js')&&!f.includes(`${path.sep}node_modules${path.sep}`))){const src=fs.readFileSync(file,'utf8');new Function(src);const resolve=createRequire(file);for(const p of patterns)for(const m of src.matchAll(p)){if(builtins.has(m[1]))continue;const target=resolve.resolve(m[1]);if(!inside(root,target))fail(`dependency escaped RuntimeRoot: ${m[1]} from ${file}`)}}
const entries=files.map(f=>({path:path.relative(root,f).replaceAll('\\','/'),sha256:crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')})).sort((a,b)=>a.path.localeCompare(b.path));const mf=path.join(root,manifestName);
if(write)fs.writeFileSync(mf,JSON.stringify({algorithm:'sha256',kind:'worker',files:entries},null,2)+'\n');else{const m=JSON.parse(fs.readFileSync(mf));if(m.algorithm!=='sha256'||m.kind!=='worker'||JSON.stringify(m.files)!==JSON.stringify(entries))fail('Worker release manifest mismatch')}
console.log(`PASS: verified Worker release (${entries.length} files)`);
