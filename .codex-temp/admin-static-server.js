const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(process.cwd(), 'dist');
const port = Number(process.env.PORT || 5282);

const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function sendFile(filePath, res) {
  fs.readFile(filePath, (readError, data) => {
    if (readError) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(String(readError));
      return;
    }

    res.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': mime[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  let filePath = path.normalize(path.join(root, urlPath === '/' ? '/index.html' : urlPath));

  if (!filePath.startsWith(root)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('forbidden');
    return;
  }

  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      filePath = path.join(root, 'index.html');
    }

    sendFile(filePath, res);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`LOCAL http://127.0.0.1:${port}/`);
});
