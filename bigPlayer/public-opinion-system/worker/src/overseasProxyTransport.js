'use strict';
const { spawn } = require('node:child_process');
function networkFailure(error) {
  for(let current=error,depth=0;current&&depth<6;current=current.cause,depth++) {
    const code=current.code||current.name;
    if(['UND_ERR_CONNECT_TIMEOUT','ETIMEDOUT','TimeoutError'].includes(code))return 'OVERSEAS_NETWORK_TIMEOUT';
    if(['ECONNREFUSED','ENETUNREACH','EHOSTUNREACH','ECONNRESET'].includes(code))return 'OVERSEAS_NETWORK_UNAVAILABLE';
    if(String(code).startsWith('CERT_')||['UNABLE_TO_VERIFY_LEAF_SIGNATURE','DEPTH_ZERO_SELF_SIGNED_CERT'].includes(code))return 'OVERSEAS_TLS_FAILED';
  }
  return error?.code||'OVERSEAS_PRODUCTION_FAILED';
}
// Secrets go over stdin, never argv or disk. Certificate verification stays enabled.
function createProxyFetch(proxyUrl) {
  const proxy=new URL(proxyUrl);
  if(proxy.protocol!=='http:'||proxy.hostname!=='127.0.0.1'||!proxy.port||proxy.username||proxy.password)throw Object.assign(new Error('invalid local proxy'),{code:'OVERSEAS_PROXY_CONFIG_INVALID'});
  return (input,options={})=>new Promise((resolve,reject)=>{
    const url=new URL(input);
    if(url.protocol!=='https:'||url.hostname!=='club-en.q1.com'||(url.port&&url.port!=='443')||(options.method&&options.method!=='GET'))return reject(Object.assign(new Error('request outside scope'),{code:'OVERSEAS_PRODUCTION_REQUEST_SCOPE'}));
    const quote=value=>'"'+String(value).replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
    const headers=Object.entries(options.headers||{});
    if(headers.some(([k,v])=>/[\r\n]/.test(k+v)))return reject(Object.assign(new Error('invalid header'),{code:'OVERSEAS_PRODUCTION_REQUEST_SCOPE'}));
    const config=['url = '+quote(url.href),'proxy = '+quote(proxy.href),...headers.map(([k,v])=>'header = '+quote(k+': '+v))].join('\n');
    const child=spawn('C:/Windows/System32/curl.exe',['--config','-','--silent','--show-error','--include','--suppress-connect-headers','--connect-timeout','8','--max-time','15','--max-filesize','16777216'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let finished=false,size=0;const chunks=[];
    const fail=error=>{if(finished)return;finished=true;options.signal?.removeEventListener('abort',abort);child.kill();reject(error);};
    const abort=()=>fail(options.signal.reason||Object.assign(new Error('aborted'),{name:'AbortError'}));
    if(options.signal?.aborted)return abort();options.signal?.addEventListener('abort',abort,{once:true});
    child.on('error',fail);child.stdin.on('error',fail);child.stderr.resume();child.stdout.on('data',chunk=>{size+=chunk.length;if(size>17*1024*1024)return fail(Object.assign(new Error('response too large'),{code:'OVERSEAS_RESPONSE_TOO_LARGE'}));chunks.push(chunk);});
    child.on('close',code=>{
      if(finished)return;
      if(code!==0)return fail(Object.assign(new Error('overseas transport failed'),{code:code===28?'ETIMEDOUT':[7,52,56].includes(code)?'ECONNRESET':[35,60].includes(code)?'CERT_TRANSPORT_FAILED':'OVERSEAS_PROXY_CONNECT_FAILED'}));
      try {
        const raw=Buffer.concat(chunks),end=raw.indexOf('\r\n\r\n');if(end<0)throw Object.assign(new Error('invalid HTTP response'),{code:'MALFORMED_RESPONSE'});
        const lines=raw.subarray(0,end).toString().split('\r\n');const status=Number(lines.shift().split(' ')[1]),responseHeaders=new Headers();
        for(const line of lines){const i=line.indexOf(':');if(i>0)responseHeaders.append(line.slice(0,i),line.slice(i+1).trim());}
        const result=new Response([204,205,304].includes(status)?null:raw.subarray(end+4),{status,headers:responseHeaders});Object.defineProperty(result,'url',{value:url.href});finished=true;options.signal?.removeEventListener('abort',abort);resolve(result);
      }catch(error){fail(error);}
    });child.stdin.end(config+'\n');
  });
}
async function retryNetwork(operation,{signal,attempts=3,delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
  for(let attempt=0;attempt<attempts;attempt++) {
    if(signal?.aborted)throw signal.reason;
    try{return await operation();}catch(error){if(signal?.aborted||attempt===attempts-1||!['OVERSEAS_NETWORK_TIMEOUT','OVERSEAS_NETWORK_UNAVAILABLE','OVERSEAS_PROXY_CONNECT_FAILED'].includes(networkFailure(error)))throw error;await delay(500*(attempt+1));}
  }
}
module.exports={createProxyFetch,networkFailure,retryNetwork};
