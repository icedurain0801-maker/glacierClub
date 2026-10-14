'use strict';
// Reuse the exact independent legacy cases; preserve the previous failure script/artifact.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const previous=path.join(__dirname,'v054_risk_legacy_recheck.cjs');
const source=fs.readFileSync(previous,'utf8').replaceAll('candidate-nc7FdP','candidate-xeQZCM').replaceAll('qa-v054-risk-recheck-','qa-v055-risk-recheck-');
const compiled=new Module(__filename,module);
compiled.filename=__filename;
compiled.paths=module.paths;
compiled._compile(source,__filename);
