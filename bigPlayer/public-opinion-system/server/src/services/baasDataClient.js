const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const tls = require('node:tls');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const APP_KEY = 'pk_2baf095458a842a080b8faa613ce1855';
const COLLECTION = 'po_live_contents_v1';
class BaasClient {
  constructor(token, requestImpl, collection=COLLECTION) { if(!token || /\s/.test(token)) throw Object.assign(new Error('Missing data access token'),{code:'BAAS_TOKEN_REQUIRED'}); if(!/^[a-z0-9_]+$/.test(collection))throw new Error('Invalid collection');this.token=token; this.requestImpl=requestImpl;this.collection=collection; }
  async request(method, endpoint, data, options = {}) {
    if(this.requestImpl) return this.requestImpl(method,endpoint,data);
    const body = data === undefined ? null : JSON.stringify(data);
    const url=new URL(endpoint,'https://chat.q1.com/baas/');
    if(url.origin!=='https://chat.q1.com'||!url.pathname.startsWith('/baas/'))throw Object.assign(new Error('Untrusted data endpoint'),{code:'BAAS_UNTRUSTED_ENDPOINT'});
    const ca = typeof tls.getCACertificates === 'function' ? [...tls.getCACertificates('default'),...tls.getCACertificates('system')] : tls.rootCertificates;
    return new Promise((resolve,reject)=>{
      const request=https.request(url,{method,signal:options.signal,rejectUnauthorized:true,ca,headers:{'X-App-Key':APP_KEY,Authorization:`Bearer ${this.token}`,'Content-Type':'application/json',...(body?{'Content-Length':Buffer.byteLength(body)}:{})}},response=>{
        const chunks=[];let size=0;
        response.on('data',chunk=>{size+=chunk.length;if(size>1048576)request.destroy(Object.assign(new Error('Response too large'),{code:'BAAS_RESPONSE_TOO_LARGE'}));else chunks.push(chunk);});
        response.on('error',reject);response.on('end',()=>{if(response.statusCode<200||response.statusCode>=300)return reject(Object.assign(new Error('BaaS request failed'),{code:response.statusCode===429&&Buffer.concat(chunks).toString().includes('已达该 app 的文档数配额上限')?'BAAS_APP_DOCUMENT_QUOTA_EXCEEDED':`BAAS_HTTP_${response.statusCode}`,status:response.statusCode}));try{resolve(JSON.parse(Buffer.concat(chunks).toString()));}catch{reject(Object.assign(new Error('Invalid response'),{code:'BAAS_INVALID_RESPONSE'}));}});
      });
      request.setTimeout(options.timeoutMs || 30000,()=>request.destroy(Object.assign(new Error('BaaS request timed out'),{code:'BAAS_TIMEOUT'})));
      request.on('error',reject);if(body)request.write(body);request.end();
    });
  }
  async verify() { const me=await this.request('GET','v1/auth/me');if(me.is_anonymous!==false||!Array.isArray(me.roles)||!me.roles.includes('admin'))throw Object.assign(new Error('Real-name application admin required'),{code:'BAAS_WRITE_ROLE_REQUIRED'}); }
  async put(id,data) {
    if(Buffer.byteLength(JSON.stringify(data))>250000)throw Object.assign(new Error('Document exceeds safe size limit'),{code:'BAAS_DOCUMENT_TOO_LARGE'});
    try { await this.request('POST',`v1/collections/${this.collection}/docs`,{id,data}); }
    catch(error){if(error.status!==409)throw error;await this.request('PATCH',`v1/collections/${this.collection}/docs/${encodeURIComponent(id)}`,{data,merge:false,reason:'Local incremental content synchronization'});}
  }
}
function readToken(file) {
  // DPAPI LocalMachine ciphertext plus Administrator/SYSTEM-only file ACL; no plaintext env or logs.
  if(!/^[A-Za-z]:[\\/][^'\r\n]+$/.test(file))throw new Error('Invalid token file path');
  const command=`Add-Type -AssemblyName System.Security; $bytes=[IO.File]::ReadAllBytes('${file}'); $clear=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::LocalMachine); [Console]::Write([Text.Encoding]::UTF8.GetString($clear))`;
  const original = execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',windowsHide:true}).trim();
  // Only the two delegated data credentials share the existing service authorization.
  const configRoot = path.join(process.env.ProgramData || 'C:/ProgramData', 'PublicOpinion');
  const expected = ['baas-query-token.dpapi', 'baas-data-token.dpapi'].map(name => path.resolve(configRoot, 'config', name));
  if (!expected.includes(path.resolve(file))) return original;
  try {
    const config = JSON.parse(fs.readFileSync(path.join(configRoot, 'baas-dingtalk', 'config.json'), 'utf8'));
    return selectRenewedToken(original, config, fs.statSync(file).mtimeMs);
  } catch { return original; }
}
function selectRenewedToken(original, config, originalModifiedAt, env = process.env, now = Date.now()) {
  try {
    if (!config.tokenCipher || Date.parse(config.authorizedAt) <= originalModifiedAt || !Number.isFinite(Date.parse(config.authorizedAt))) return original;
    const renewed = require('../integrations/credentialCipher').decrypt(config.tokenCipher, env, { aad: 'public-opinion:baas-dingtalk:authorization:v1' });
    const before = JSON.parse(Buffer.from(original.split('.')[1], 'base64url'));
    const after = JSON.parse(Buffer.from(renewed.split('.')[1], 'base64url'));
    // Claims select a same-principal candidate only; BaaS still verifies its signature and ACL on every request.
    if (!before.sub || after.sub !== before.sub || !Number.isFinite(after.exp) || after.exp * 1000 <= now || /\s/.test(renewed)) return original;
    return renewed;
  } catch { return original; }
}
module.exports = { BaasClient, readToken, selectRenewedToken };
