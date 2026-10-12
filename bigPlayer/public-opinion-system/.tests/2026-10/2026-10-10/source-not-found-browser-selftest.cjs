'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const project = path.resolve(__dirname, '../../..');
const repo = path.resolve(project, '../..');
const baseline = 'C:/ProgramData/PublicOpinion/frontend3001/releases/release-20260924123831-boardid-save';
const output = path.join(repo, '.temp/source-not-found-independent-20261010');
const candidate = path.join(output, 'release-source-draft-v211');
const targets = ['public/admin/PublicOpinion/assets/sources.js', 'public/admin/PublicOpinion/sources.html'];
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function list(root, prefix = '') {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const relative = path.posix.join(prefix, entry.name);
    return entry.isDirectory() ? list(path.join(root, entry.name), relative) : [relative];
  });
}
async function browserCheck(root, fixed) {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    const communityId = '8b1f0000000000000000000000000022';
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.pathname.startsWith('/api/')) {
        if (request.method() !== 'GET') {
          writes.push({ method: request.method(), path: url.pathname });
          return route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'source not found' } } });
        }
        const data = url.pathname.endsWith('/communities')
          ? [{ id: communityId, name: '我要当老祖', status: 'enabled', region_code: 'domestic' }] : [];
        return route.fulfill({ json: { data, meta: {} } });
      }
      const file = path.resolve(root, 'public', '.' + url.pathname);
      assert(file.startsWith(path.resolve(root, 'public') + path.sep));
      if (!fs.existsSync(file)) return route.fulfill({ status: 200, body: '', contentType: 'text/plain' });
      const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
      return route.fulfill({ body: fs.readFileSync(file), contentType: types[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto(`https://fixture.invalid/admin/PublicOpinion/sources.html?regionCode=domestic&communityId=${communityId}&platform=bigplayer_h5`);
    await page.locator('#addBtn').click();
    await page.locator('#cfgName').fill('自测草稿');
    await page.locator('#cfgBoardId').fill('22');
    await page.locator('[data-site-url]').first().fill('https://example.invalid/');
    await page.locator('#h5AuthPassword').click();
    if (fixed) {
      assert.equal(await page.locator('#btnCreate').count(), 1);
      assert.equal(await page.locator('#btnSaveSource,#btnCheckAuth,#btnCheckLogin,#btnCheckCapabilities').count(), 0);
      assert.equal(await page.locator('#cfgName').inputValue(), '自测草稿');
      assert.equal(await page.locator('#cfgBoardId').inputValue(), '22');
      assert.equal(await page.locator('[data-site-url]').first().inputValue(), 'https://example.invalid/');
      await page.locator('#cfgH5Account').fill('synthetic-account');
      await page.locator('#h5AuthToken').click();
      await page.locator('#h5AuthPassword').click();
      assert.equal(await page.locator('#cfgH5Account').inputValue(), 'synthetic-account');
      assert.equal(await page.locator('#btnCreate').count(), 1);
      assert.equal(writes.length, 0);
      assert.deepEqual(errors, []);
    } else {
      assert.equal(await page.locator('#btnSaveSource').count(), 1);
      await page.locator('#btnCheckAuth').click();
      await page.locator('#toast').filter({ hasText: 'source not found' }).waitFor();
      assert(writes.some(item => item.path.includes('/undefined/')));
    }
    await page.screenshot({ path: path.join(output, fixed ? 'fixed.png' : 'baseline.png') });
    return { fixed, writes, pageErrors: errors, result: 'PASS' };
  } finally { await browser.close(); }
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  if (!fs.existsSync(candidate)) {
    fs.cpSync(baseline, candidate, { recursive: true });
    for (const target of targets) fs.copyFileSync(path.join(project, '..', target.replace('public/', '')), path.join(candidate, target));
  }
  for (const target of targets) assert.equal(hash(path.join(project, '..', target.replace('public/', ''))), hash(path.join(candidate, target)));
  const changed = list(baseline).filter(file => file !== 'frontend3001-release-manifest.json' && hash(path.join(baseline, file)) !== hash(path.join(candidate, file)));
  assert.deepEqual(changed.sort(), [...targets].sort());
  const results = [await browserCheck(baseline, false), await browserCheck(candidate, true)];
  const report = { date: '2026-10-10', candidate, baseline, changed, files: targets.map(file => ({ path: file, baselineSha256: hash(path.join(baseline, file)), sha256: hash(path.join(candidate, file)) })), browser: results, isolation: 'All browser requests fulfilled locally; synthetic data; no real API writes or authentication' };
  fs.writeFileSync(path.join(output, 'selftest.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
