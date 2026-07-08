const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(process.cwd(), 'emotionBot', 'client', 'dist');
const base = '/glacierClub/emotionbot-web';
const port = Number(process.env.PORT || 5281);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  if (urlPath === base || urlPath === `${base}/`) {
    urlPath = '/index.html';
  } else if (urlPath.startsWith(`${base}/`)) {
    urlPath = urlPath.slice(base.length);
  } else if (urlPath === '/') {
    urlPath = '/index.html';
  }

  let filePath = path.normalize(path.join(root, urlPath));
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }

  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) filePath = path.join(root, 'index.html');
    fs.readFile(filePath, (readError, data) => {
      if (readError) {
        res.writeHead(500);
        res.end(String(readError));
        return;
      }
      res.writeHead(200, {
        'content-type': mime[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store'
      });
      res.end(data);
    });
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`LOCAL http://127.0.0.1:${port}${base}/`);
});
