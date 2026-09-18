'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const configPath = process.env.FRONTEND3001_CONFIG_FILE;
if (!configPath || !path.isAbsolute(configPath)) throw new Error('FRONTEND3001_CONFIG_FILE must be an absolute path');
const configStat = fs.lstatSync(configPath);
if (!configStat.isFile() || configStat.isSymbolicLink()) throw new Error('Frontend config must be a regular non-link file');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));

const listenHost = String(config.listenHost || '::');
const listenPort = Number(config.listenPort);
if (!Number.isInteger(listenPort) || listenPort !== 3001) throw new Error('listenPort must be 3001');
const upstream = new URL(String(config.upstreamOrigin || ''));
if (upstream.protocol !== 'http:' || upstream.hostname !== '127.0.0.1' || upstream.port !== '4320' || upstream.pathname !== '/') {
  throw new Error('upstreamOrigin must be http://127.0.0.1:4320');
}

const releaseRoot = __dirname;
const staticRoot = path.join(releaseRoot, 'public');
const mime = new Map([
  ['.css', 'text/css; charset=utf-8'], ['.gif', 'image/gif'], ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'], ['.jpeg', 'image/jpeg'], ['.jpg', 'image/jpeg'], ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.png', 'image/png'], ['.svg', 'image/svg+xml'], ['.webp', 'image/webp'],
]);
const hopByHop = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);

function safeStaticPath(rawPathname) {
  let pathname;
  try { pathname = decodeURIComponent(rawPathname); } catch { return null; }
  if (pathname.includes('\0')) return null;
  const relative = pathname.replace(/^\/+/, '').replaceAll('/', path.sep);
  const candidate = path.resolve(staticRoot, relative);
  const relation = path.relative(staticRoot, candidate);
  return relation && !relation.startsWith('..') && !path.isAbsolute(relation) ? candidate : null;
}

function proxyRequest(req, res, requestUrl) {
  const target = new URL(`${requestUrl.pathname}${requestUrl.search}`, upstream);
  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) if (!hopByHop.has(name.toLowerCase())) headers[name] = value;
  headers.host = upstream.host;
  headers['x-forwarded-host'] = req.headers.host || '';
  headers['x-forwarded-proto'] = 'http';
  const proxy = http.request(target, { method: req.method, headers, timeout: 30000 }, response => {
    const responseHeaders = {};
    for (const [name, value] of Object.entries(response.headers)) if (!hopByHop.has(name.toLowerCase())) responseHeaders[name] = value;
    res.writeHead(response.statusCode || 502, responseHeaders);
    response.pipe(res);
  });
  proxy.on('timeout', () => proxy.destroy(new Error('upstream timeout')));
  proxy.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    res.end('Upstream unavailable');
  });
  req.on('aborted', () => proxy.destroy());
  req.pipe(proxy);
}

const server = http.createServer((req, res) => {
  let requestUrl;
  try { requestUrl = new URL(req.url, 'http://frontend3001.local'); } catch { res.writeHead(400); res.end('Bad request'); return; }
  if (requestUrl.pathname === '/healthz/frontend') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: true, service: 'PublicOpinionFrontend3001' }));
    return;
  }
  if (requestUrl.pathname === '/health' || requestUrl.pathname.startsWith('/api/')) {
    proxyRequest(req, res, requestUrl);
    return;
  }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { allow: 'GET, HEAD' }); res.end(); return; }
  if (requestUrl.pathname === '/') {
    res.writeHead(302, { location: '/admin/PublicOpinion/index.html', 'cache-control': 'no-store' });
    res.end();
    return;
  }
  const file = safeStaticPath(requestUrl.pathname);
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  let stat;
  try { stat = fs.lstatSync(file); } catch { res.writeHead(404); res.end('Not found'); return; }
  if (!stat.isFile() || stat.isSymbolicLink()) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, {
    'content-type': mime.get(path.extname(file).toLowerCase()) || 'application/octet-stream',
    'content-length': stat.size,
    'x-content-type-options': 'nosniff',
  });
  if (req.method === 'HEAD') { res.end(); return; }
  const stream = fs.createReadStream(file);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
});

server.requestTimeout = 65000;
server.headersTimeout = 66000;
server.keepAliveTimeout = 5000;
server.listen({ host: listenHost, port: listenPort, ipv6Only: false }, () => {
  process.stdout.write(`PublicOpinionFrontend3001 listening on ${listenHost}:${listenPort}\n`);
});

function shutdown() {
  server.close(error => process.exit(error ? 1 : 0));
  setTimeout(() => process.exit(1), 25000).unref();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
