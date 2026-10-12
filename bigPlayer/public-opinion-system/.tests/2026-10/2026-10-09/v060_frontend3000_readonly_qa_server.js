'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '../../../..');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const requests = [];
const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  let url;
  try { url = new URL(req.url, 'http://127.0.0.1:3000'); } catch { res.writeHead(400); res.end(); return; }
  if (url.pathname === '/qa/requests') { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(requests)); return; }
  if (url.pathname.startsWith('/api/')) {
    requests.push({ path: url.pathname, regionCode: url.searchParams.get('regionCode'), communityId: url.searchParams.get('communityId') });
    if (requests.length > 1000) requests.shift();
    const upstream = http.get(`http://127.0.0.1:4320${url.pathname}${url.search}`, response => {
      res.writeHead(response.statusCode || 502, { 'content-type': response.headers['content-type'] || 'application/octet-stream', 'cache-control': 'no-store' });
      response.pipe(res);
    });
    upstream.setTimeout(10000, () => upstream.destroy());
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Upstream unavailable'); });
    return;
  }
  if (url.pathname === '/') { res.writeHead(302, { location: '/admin/PublicOpinion/index.html' }); res.end(); return; }
  let decoded;
  try { decoded = decodeURIComponent(url.pathname); } catch { res.writeHead(400); res.end(); return; }
  if (!decoded.startsWith('/admin/PublicOpinion/') && !decoded.startsWith('/shared/') && !decoded.startsWith('/public-opinion-system/shared/')) { res.writeHead(404); res.end(); return; }
  const file = path.resolve(root, `.${decoded}`);
  const relative = path.relative(root, file);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) { res.writeHead(404); res.end(); return; }
  let stat;
  try { stat = fs.lstatSync(file); } catch { res.writeHead(404); res.end(); return; }
  if (!stat.isFile() || stat.isSymbolicLink()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream', 'content-length': stat.size, 'cache-control': 'no-store' });
  if (req.method === 'HEAD') { res.end(); return; }
  fs.createReadStream(file).pipe(res);
});

server.listen(3000, '127.0.0.1', () => console.log('QA frontend listening on 127.0.0.1:3000'));
