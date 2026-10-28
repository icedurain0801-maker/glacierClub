'use strict';
// Run in the interactive user's desktop, never in Session 0 as a Windows service.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { Resolver } = require('node:dns').promises;
const { isIP } = require('node:net');
const { authenticate } = require('./security');
const { readJson, sendJson } = require('./httpServer');
const { bindingKey } = require('../../shared/facebookBrowser');
const { ServiceError } = require('./errors');
class ExternalBrowserBroker {
  constructor({ executablePath, profileRoot, verificationDnsServers = [], spawnImpl = spawn }) {
    this.executablePath = executablePath; this.profileRoot = profileRoot; this.spawnImpl = spawnImpl; this.sessions = new Map(); this.pending = new Map();
    this.verificationDnsServers = verificationDnsServers;
  }
  async open(binding) {
    const key = bindingKey(binding);
    if (this.pending.has(key)) return this.pending.get(key);
    const operation = this.launch(key); this.pending.set(key, operation);
    try { return await operation; } finally { this.pending.delete(key); }
  }
  async launch(key) {
    const existing = this.sessions.get(key);
    if (existing && existing.child.exitCode === null && existing.child.signalCode === null) return { endpoint: existing.endpoint };
    if (this.sessions.size >= 16) throw new ServiceError('EXTERNAL_BROWSER_CAPACITY', '真实浏览器会话容量已满', 503);
    const profile = path.join(this.profileRoot, crypto.createHash('sha256').update(key).digest('hex').slice(0,32), crypto.randomUUID());
    await fs.mkdir(profile, { recursive: true });
    const args = ['--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--lang=en-US','--no-first-run','--no-default-browser-check','--new-window','about:blank'];
    if (this.verificationDnsServers.length) {
      if (this.verificationDnsServers.some(value=>!isIP(value))) throw new ServiceError('FACEBOOK_VERIFICATION_DNS_INVALID','验证域名 DNS 配置无效',503);
      const resolver=new Resolver({timeout:2500,tries:1}); resolver.setServers(this.verificationDnsServers);
      const address=(await resolver.resolve4('www.fbsbx.com')).find(value=>isIP(value)===4&&!/^(0|10|127|169\.254|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(value));
      if(!address)throw new ServiceError('FACEBOOK_VERIFICATION_DNS_FAILED','验证域名解析失败',503);
      args.unshift(`--host-resolver-rules=MAP www.fbsbx.com ${address}`);
    }
    const child = this.spawnImpl(this.executablePath, args, { windowsHide: false, stdio: 'ignore' });
    let failure; child.once('error', error => { failure = error; });
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline && !failure && child.exitCode === null) {
      try {
        const [port, suffix] = (await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split(/\r?\n/);
        if (!/^\d+$/.test(port) || Number(port)<1 || Number(port)>65535 || !/^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(suffix)) throw new Error('invalid endpoint');
        const endpoint = `ws://127.0.0.1:${port}${suffix}`;
        this.sessions.set(key,{child,endpoint,profile}); child.once('exit',()=>this.sessions.delete(key));
        return { endpoint };
      } catch { await new Promise(resolve=>setTimeout(resolve,100)); }
    }
    child.kill(); throw new ServiceError('EXTERNAL_BROWSER_OPEN_FAILED','真实浏览器未能启动',503);
  }
  close() { for (const value of this.sessions.values()) value.child.kill(); this.sessions.clear(); }
}
function createBrokerServer({ broker, internalToken }) {
  return http.createServer(async(req,res)=>{try{
    authenticate(req,internalToken);
    if (req.method!=='POST'||req.url!=='/sessions') throw new ServiceError('NOT_FOUND','接口不存在',404);
    if (req.headers.origin) throw new ServiceError('FORBIDDEN','仅允许登录服务调用',403);
    const input=await readJson(req,2048);
    if (Object.keys(input).some(k=>!['sourceId','accountId','platform'].includes(k))) throw new ServiceError('INVALID_INPUT','不支持的参数',400);
    sendJson(res,200,{data:await broker.open(input)});
  }catch(error){sendJson(res,error.status||500,{error:{code:error.code||'EXTERNAL_BROWSER_FAILED',message:'真实浏览器请求未完成'}})}});
}
if(require.main===module){
  require('./env').loadLocalEnvironment();
  const { resolveBrowserExecutable } = require('./index');
  const executablePath = resolveBrowserExecutable(process.env);
  if(!executablePath || !process.env.LOGIN_SESSION_INTERNAL_TOKEN) throw Error('EXTERNAL_BROWSER_CONFIGURATION_REQUIRED');
  const broker=new ExternalBrowserBroker({executablePath,profileRoot:process.env.LOGIN_SESSION_EXTERNAL_PROFILE_ROOT||'E:/CodexData/public-opinion/external-browser-profiles',verificationDnsServers:String(process.env.LOGIN_SESSION_FACEBOOK_VERIFICATION_DNS_SERVERS||'').split(',').map(v=>v.trim()).filter(Boolean)});
  const server=createBrokerServer({broker,internalToken:process.env.LOGIN_SESSION_INTERNAL_TOKEN});
  server.listen(Number(process.env.LOGIN_SESSION_EXTERNAL_BROWSER_PORT||4312),'127.0.0.1',()=>console.log('external-browser-broker ready on loopback'));
  server.on('error',()=>{broker.close();process.exitCode=1});
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{broker.close();server.close()});
}
module.exports={ExternalBrowserBroker,createBrokerServer};
