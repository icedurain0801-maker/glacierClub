'use strict';
// One admission permit shared by initial queue and polling work, no timer.
function createSharedWorkerPermit(limit){
 if(!Number.isSafeInteger(limit)||limit<1||limit>1000)throw TypeError('Positive bounded concurrency required');
 let active=0;const waiting=[];
 const grant=resolve=>{active++;let released=false;resolve(Object.freeze({release(){if(released)return;released=true;active--;const next=waiting.shift();if(next)grant(next);}}));};
 return Object.freeze({acquire:()=>new Promise(resolve=>{if(active<limit)grant(resolve);else waiting.push(resolve);}),inventory:()=>Object.freeze({active,waiting:waiting.length,limit})});
}
module.exports={createSharedWorkerPermit};
