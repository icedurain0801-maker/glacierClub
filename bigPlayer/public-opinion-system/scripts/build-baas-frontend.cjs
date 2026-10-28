const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const project = path.resolve(__dirname, '..');
const repository = path.resolve(project, '../..');
const publicRoot = process.env.PUBLIC_OPINION_FRONTEND_PUBLIC_ROOT
  ? path.resolve(process.env.PUBLIC_OPINION_FRONTEND_PUBLIC_ROOT) : path.resolve(project, '..');
const pagesRoot = path.join(publicRoot, 'admin/PublicOpinion');
const output = path.join(repository, '.temp', `public-opinion-baas-frontend-${Date.now()}`);
const { HOSTED_API: api, verify } = require('./verify-baas-frontend.cjs');
const pages = fs.readdirSync(pagesRoot).filter(file => file.endsWith('.html')).map(file => file.slice(0, -5)).sort();
function write(relative, data) {
  const target = path.join(output, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, data);
}
function copy(source, relative) { write(relative, fs.readFileSync(source)); }
function versionStaticRefs(html, pageFile) {
  return html.replace(/((?:src|href)=["'])([^"']+)(["'])/g, (match, prefix, ref, quote) => {
    const relative = ref.split(/[?#]/)[0];
    if (/^(?:https?:|data:|#)/.test(ref) || !/\.(?:js|css|svg)$/.test(relative)) return match;
    const target = path.resolve(path.dirname(pageFile), relative);
    if (!target.startsWith(publicRoot + path.sep) || !fs.existsSync(target)) throw new Error(`Missing static resource: ${relative}`);
    const version = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex').slice(0, 12);
    return `${prefix}${relative}?v=${version}${quote}`;
  });
}
function build() {
  // A fixed output under the repository temporary directory; never copy server files or env.
  fs.mkdirSync(output, { recursive: true });
  if (fs.readdirSync(output).length) throw new Error('Build directory must be empty; choose a fresh directory or explicitly clear this fixed build output.');
  const bootstrap = `<script>window.PUBLIC_OPINION_API=${JSON.stringify(api)};window.PUBLIC_OPINION_REQUIRE_SSO=true;</script>`;
  for (const page of pages) {
    const source = fs.readFileSync(path.join(pagesRoot, `${page}.html`), 'utf8');
    write(`admin/PublicOpinion/${page}.html`, versionStaticRefs(source, path.join(pagesRoot, `${page}.html`)).replace(/<head>/i, `<head>${bootstrap}`));
  }
  for (const file of ['public-opinion.css', 'opinion-favicon.svg', 'opinion-favicon-v2.svg']) copy(path.join(pagesRoot, file), `admin/PublicOpinion/${file}`);
  for (const file of fs.readdirSync(path.join(pagesRoot, 'assets'))) {
    if (!/\.(?:js|css|svg)$/.test(file) || /\.(?:test|spec)\./.test(file)) continue;
    copy(path.join(pagesRoot, 'assets', file), `admin/PublicOpinion/assets/${file}`);
  }
  for (const file of ['sidebar.js', 'sidebar-data.js', 'sidebar.css']) copy(path.join(publicRoot, 'shared', file), `shared/${file}`);
  copy(path.join(publicRoot, 'public-opinion-system/shared/riskModes.js'), 'public-opinion-system/shared/riskModes.js');
  copy(path.join(publicRoot, 'public-opinion-system/shared/singlePostOutput.js'), 'public-opinion-system/shared/singlePostOutput.js');
  write('index.html', '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>舆情分析系统</title></head><body><a href="admin/PublicOpinion/index.html">进入舆情分析系统</a><script>location.replace("admin/PublicOpinion/index.html"+location.search+location.hash)</script></body></html>');
  const files = [];
  function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) walk(file); else files.push({ path: path.relative(output,file).replaceAll('\\','/'), sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') }); } }
  walk(output);
  const report = { output, api, pages: pages.length, files };
  verify(report);
  return report;
}
if (require.main === module) console.log(JSON.stringify(build(), null, 2));
module.exports = { build, output, pages, api };
