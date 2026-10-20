'use strict';
const { ServiceError } = require('./errors');
function loopbackUrl(value, websocket = false) {
  let url; try { url = new URL(value); } catch { throw new ServiceError('EXTERNAL_BROWSER_URL_INVALID', '本机浏览器连接地址无效', 503); }
  if (url.hostname !== '127.0.0.1' || url.username || url.password || url.hash || url.search || !url.port
    || url.protocol !== (websocket ? 'ws:' : 'http:') || (websocket ? !/^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(url.pathname) : url.pathname !== '/')) {
    throw new ServiceError('EXTERNAL_BROWSER_URL_INVALID', '仅允许本机回环浏览器连接', 503);
  }
  return url;
}
class ExternalBrowserClient {
  constructor(env = process.env, fetchImpl = globalThis.fetch) {
    this.baseUrl = env.LOGIN_SESSION_EXTERNAL_BROWSER_URL || ''; this.token = env.LOGIN_SESSION_INTERNAL_TOKEN || ''; this.fetchImpl = fetchImpl;
  }
  async open(binding) {
    if (!this.baseUrl || !this.token) throw new ServiceError('EXTERNAL_BROWSER_NOT_CONFIGURED', '请先启动本机真实浏览器登录助手', 503);
    const url = loopbackUrl(this.baseUrl);
    try {
      const response = await this.fetchImpl(new URL('sessions', url), { method: 'POST', headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ sourceId: binding.sourceId, accountId: binding.accountId, platform: binding.platform }), signal: AbortSignal.timeout(20000) });
      const body = await response.json();
      if (!response.ok) throw new ServiceError(body.error?.code || 'EXTERNAL_BROWSER_OPEN_FAILED', '无法打开本机真实浏览器', response.status);
      loopbackUrl(body.data?.endpoint, true);
      return body.data.endpoint;
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError('EXTERNAL_BROWSER_UNAVAILABLE', '本机真实浏览器登录助手未运行或连接失败', 503);
    }
  }
}
module.exports = { ExternalBrowserClient, loopbackUrl };
