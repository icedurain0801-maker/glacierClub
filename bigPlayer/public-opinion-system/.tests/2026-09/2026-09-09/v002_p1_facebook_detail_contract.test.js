const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '../../..');
const appSource = fs.readFileSync(path.join(repositoryRoot, 'server/src/app.js'), 'utf8');
const validatorSource = fs.readFileSync(path.join(repositoryRoot, 'server/src/services/sourceValidators.js'), 'utf8');
const contentSource = fs.readFileSync(path.resolve(repositoryRoot, '../admin/PublicOpinion/assets/content.js'), 'utf8');
const contentHtml = fs.readFileSync(path.resolve(repositoryRoot, '../admin/PublicOpinion/content.html'), 'utf8');

test('Facebook 只允许用于 overview 和 sources 的只读筛选', () => {
  assert.match(appSource, /const READ_PLATFORM_FILTERS = new Set\(\[\.\.\.SOURCE_PLATFORMS, 'facebook'\]\);/);
  assert.match(appSource, /if \(query\.platform\) query\.platform = parseReadPlatform\(query\.platform\);/);
  assert.match(appSource, /resource === 'sources'[\s\S]*?resolveRequestScope\(url, \{ readPlatform: true \}\)[\s\S]*?platform: scope\.platform/);
  assert.match(appSource, /resource === 'overview'[\s\S]*?resolveRequestScope\(url, \{ readPlatform: true \}\)[\s\S]*?parseReadPlatform\(value\)/);
});

test('采集源写入平台白名单未开放 Facebook、x 或 lounge', () => {
  const sourcePlatforms = validatorSource.match(/const SOURCE_PLATFORMS = new Set\(\[([^\]]+)]\);/)?.[1] || '';
  assert.doesNotMatch(sourcePlatforms, /['"]facebook['"]/);
  assert.doesNotMatch(sourcePlatforms, /['"]x['"]/);
  assert.doesNotMatch(sourcePlatforms, /['"]lounge['"]/);
  assert.match(appSource, /function parsePlatform\(value\)[\s\S]*?SOURCE_PLATFORMS\.has\(platform\)/);
});

test('内容详情展示风险等级和分析状态，并刷新脚本缓存版本', () => {
  assert.match(contentSource, /<span>风险等级<\/span><br><span class="severity \$\{esc\(item\.severity \|\| 'normal'\)\}">\$\{severityLabel\(item\.severity\)\}<\/span>/);
  assert.match(contentSource, /<span>分析状态<\/span><br><span class="analysis-status \$\{esc\(status\)\}">\$\{esc\(analysisStatusLabel\(status\)\)\}<\/span>/);
  assert.match(contentHtml, /assets\/content\.js\?v=26/);
  assert.doesNotMatch(contentHtml, /assets\/content\.js\?v=25/);
});
