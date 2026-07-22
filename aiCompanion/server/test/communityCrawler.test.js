const assert = require('assert');
const http = require('http');
const { CommunityCrawler } = require('../src/services/communityCrawler');

function listen(handler) {
  return new Promise(resolve => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function close(server) {
  return new Promise(resolve => server.close(resolve));
}

async function main() {
  let post1Hits = 0;
  const server = await listen((req, res) => {
    if (req.url === '/login' && req.method === 'GET') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<form><input type="hidden" name="csrf" value="ok"></form>');
      return;
    }
    if (req.url === '/login' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        assert.ok(body.includes('csrf=ok'));
        assert.ok(body.includes('username=reader'));
        assert.ok(body.includes('password=secret'));
        res.setHeader('Set-Cookie', 'sid=abc; HttpOnly; Path=/');
        res.end('welcome');
      });
      return;
    }
    if (!String(req.headers.cookie || '').includes('sid=abc')) {
      res.statusCode = 401;
      res.end('login required');
      return;
    }
    if (req.url === '/check') {
      res.end('signed in');
      return;
    }
    if (req.url === '/') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<title>Home</title><a href="/post/1">post</a><article>community home page content is visible after login.</article>');
      return;
    }
    if (req.url === '/post/1') {
      post1Hits += 1;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<title>Post 1</title><a href="/post/1/comments">comments</a><article>post body with useful knowledge.</article>');
      return;
    }
    if (req.url === '/post/1/comments') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<title>Comments</title><section>first comment and second comment are both captured.</section>');
      return;
    }
    res.statusCode = 404;
    res.end('not found');
  });

  try {
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const crawler = new CommunityCrawler({
      baseUrl,
      loginUrl: '/login',
      authCheckPath: '/check',
      authCheckText: 'signed in',
      startPaths: ['/'],
      allowedHosts: [`127.0.0.1:${address.port}`],
      username: 'reader',
      password: 'secret',
      usernameField: 'username',
      passwordField: 'password',
      extraLoginFields: {},
      authCookie: '',
      loginSuccessText: 'welcome',
      loginFailureText: 'login required',
      userAgent: 'community-crawler-test',
      requestTimeoutMs: 5000,
      maxRetries: 0,
      retryBaseMs: 1,
      delayMs: 0,
      maxPages: 0,
      maxDepth: 3,
      minContentChars: 10,
      maxContentChars: 2000,
    });
    const result = await crawler.crawl();
    assert.strictEqual(result.pages.length, 3);
    assert.strictEqual(result.seenCount, 3);
    assert.ok(result.pages.some(page => page.title === 'Comments' && page.content.includes('second comment')));

    const dedupedCrawler = new CommunityCrawler({
      baseUrl,
      loginUrl: '/login',
      authCheckPath: '/check',
      authCheckText: 'signed in',
      startPaths: ['/'],
      allowedHosts: [`127.0.0.1:${address.port}`],
      username: 'reader',
      password: 'secret',
      usernameField: 'username',
      passwordField: 'password',
      extraLoginFields: {},
      authCookie: '',
      loginSuccessText: 'welcome',
      loginFailureText: 'login required',
      userAgent: 'community-crawler-test',
      requestTimeoutMs: 5000,
      maxRetries: 0,
      retryBaseMs: 1,
      delayMs: 0,
      maxPages: 0,
      maxDepth: 3,
      minContentChars: 10,
      maxContentChars: 2000,
      existingPageUrls: [`${baseUrl}/post/1`],
    });
    const dedupedResult = await dedupedCrawler.crawl();
    assert.strictEqual(dedupedResult.pages.length, 2);
    assert.strictEqual(dedupedResult.seenCount, 3);
    assert.ok(dedupedResult.pages.some(page => page.title === 'Comments'));
    assert.ok(!dedupedResult.pages.some(page => page.title === 'Post 1'));
    assert.strictEqual(post1Hits, 2);
    console.log('communityCrawler.test passed');
  } finally {
    await close(server);
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
