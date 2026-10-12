'use strict';
const path=require('node:path');
const {spawnSync}=require('node:child_process');
function main(argv=process.argv.slice(2)) {
 if(argv.length!==1 || argv[0]!=='--isolated')throw Object.assign(new Error('PRODUCTION_EXECUTION_DISABLED'),{code:'PRODUCTION_EXECUTION_DISABLED'});
 // This is an offline validation entry, NOT a production collection command.
 const tests=['lastNightSite16TaskFlow.test.js','lastNightTaskCheckpointStore.test.js','lastNightSite16IsolatedExecutor.test.js'].map(name=>path.resolve(__dirname,'../worker/test',name));
 const result=spawnSync(process.execPath,['--test',...tests],{stdio:'inherit',cwd:path.resolve(__dirname,'..'),timeout:30000,windowsHide:true});
 if(result.error)throw result.error;
 if(result.status!==0)throw Object.assign(new Error('LAST_NIGHT_ISOLATED_VALIDATION_FAILED'),{code:'LAST_NIGHT_ISOLATED_VALIDATION_FAILED'});
 return{status:'LAST_NIGHT_ISOLATED_VALIDATION_PASSED',productionExecuted:false,fullChainComplete:false};
}
if(require.main===module){try{console.log(JSON.stringify(main()));}catch(error){console.error(error.code||'LAST_NIGHT_ISOLATED_FAILED');process.exitCode=1;}}
module.exports={main};
