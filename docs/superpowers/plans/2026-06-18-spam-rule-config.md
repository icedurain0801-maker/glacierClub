# 内容治理配置页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `bigPlayer/admin/` 下新建 `content-governance/` 目录，创建灌水判定配置页 `SpamRuleConfig.html`，并更新侧边栏数据。

**Architecture:** 原生 HTML + CSS + JS，无框架，遵循 `bigPlayer/admin/constraint.md` 规范。页面采用三主 Tab（总开关 / 词库管理 / 规则配置），词库管理内含子 Tab（灌水词库 / 恶意词库），所有状态存于页内 JS 对象 `CONFIG`，保存操作以 `alert` 占位。

**Tech Stack:** 原生 HTML5 / CSS3 / Vanilla JS；侧边栏共享脚本 `bigPlayer/shared/sidebar-data.js` / `sidebar.js` / `sidebar.css`

---

## 文件变更清单

| 操作 | 文件 |
|------|------|
| 新建目录 + 文件 | `bigPlayer/admin/content-governance/SpamRuleConfig.html` |
| 修改 | `bigPlayer/shared/sidebar-data.js`（在「后台管理」group 添加「内容治理」dir） |
| 修改 | `bigPlayer/admin/memory.md`（记录新页面） |

---

## Task 1：更新侧边栏数据

**Files:**
- Modify: `bigPlayer/shared/sidebar-data.js`

- [ ] **Step 1：定位插入位置**

打开 `bigPlayer/shared/sidebar-data.js`，找到「后台管理」group（约第 122 行），在「社区功能」dir 条目之前插入以下内容：

```js
{
  type: 'dir',
  label: '内容治理',
  children: [
    {
      type: 'item',
      label: '灌水判定配置',
      version: 'v1.0.0',
      href: 'admin/content-governance/SpamRuleConfig.html'
    }
  ]
},
```

插入后「后台管理」children 顺序为：内容管理 → **内容治理（新）** → 社区功能 → 用户管理 → 日志管理 → 数据分析 → 版块管理。

- [ ] **Step 2：验证 JS 语法**

```bash
node --check "bigPlayer/shared/sidebar-data.js"
```

期望输出：无报错（命令静默退出）。

- [ ] **Step 3：Commit**

```bash
git add bigPlayer/shared/sidebar-data.js
git commit -m "feat: add content-governance dir to sidebar"
```

---

## Task 2：创建页面骨架（HTML 结构 + 侧边栏接入）

**Files:**
- Create: `bigPlayer/admin/content-governance/SpamRuleConfig.html`

- [ ] **Step 1：创建目录和文件，写入 HTML 骨架**

新建 `bigPlayer/admin/content-governance/SpamRuleConfig.html`，内容如下（后续 Task 补充各 Tab 内容）：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>灌水判定配置 - 大玩家后台</title>
<link rel="stylesheet" href="../../shared/sidebar.css">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif;
  background: #f5f7fa;
  min-height: 100vh;
  display: flex;
}
.admin-main {
  flex: 1;
  min-height: 100vh;
  padding: 24px;
  overflow-y: auto;
}
.page-card {
  background: #fff;
  border-radius: 4px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
  margin-bottom: 16px;
  overflow: hidden;
}
.tab-bar {
  display: flex;
  border-bottom: 1px solid #e8e8e8;
  padding: 0 20px;
}
.tab-item {
  padding: 14px 16px;
  font-size: 14px;
  color: #595959;
  cursor: pointer;
  position: relative;
  user-select: none;
}
.tab-item.active { color: #1890ff; font-weight: 500; }
.tab-item.active::after {
  content: '';
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 2px;
  background: #1890ff;
  border-radius: 1px 1px 0 0;
}
.tab-panel { display: none; padding: 20px; }
.tab-panel.active { display: block; }
/* 子 Tab */
.sub-tab-bar {
  display: flex;
  border-bottom: 1px solid #f0f0f0;
  margin-bottom: 16px;
}
.sub-tab-item {
  padding: 10px 16px;
  font-size: 13px;
  color: #595959;
  cursor: pointer;
  position: relative;
  user-select: none;
}
.sub-tab-item.active { color: #1890ff; font-weight: 500; }
.sub-tab-item.active::after {
  content: '';
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 2px;
  background: #1890ff;
  border-radius: 1px 1px 0 0;
}
.sub-tab-panel { display: none; }
.sub-tab-panel.active { display: block; }
</style>
</head>
<body>
<nav id="sidebar" class="sidebar"></nav>

<div class="admin-main" id="admin-main">
  <div class="page-card">
    <!-- 主 Tab 栏 -->
    <div class="tab-bar">
      <div class="tab-item active" onclick="switchMainTab('switch')">总开关</div>
      <div class="tab-item" onclick="switchMainTab('words')">词库管理</div>
      <div class="tab-item" onclick="switchMainTab('rules')">规则配置</div>
    </div>

    <!-- Tab 1: 总开关 -->
    <div class="tab-panel active" id="panel-switch">
      <!-- Task 3 填充 -->
    </div>

    <!-- Tab 2: 词库管理 -->
    <div class="tab-panel" id="panel-words">
      <!-- Task 4 填充 -->
    </div>

    <!-- Tab 3: 规则配置 -->
    <div class="tab-panel" id="panel-rules">
      <!-- Task 5 填充 -->
    </div>
  </div>
</div>

<!-- FAB + 需求说明面板（Task 6 填充）-->

<script src="../../shared/sidebar-data.js"></script>
<script src="../../shared/sidebar.js"></script>
<script>
initSidebar({
  root: '../..',
  currentHref: 'admin/content-governance/SpamRuleConfig.html'
});

// ── 主 Tab 切换 ──
function switchMainTab(id) {
  document.querySelectorAll('.tab-bar .tab-item').forEach((el, i) => {
    const ids = ['switch', 'words', 'rules'];
    el.classList.toggle('active', ids[i] === id);
  });
  document.querySelectorAll('.tab-panel').forEach(el => {
    el.classList.toggle('active', el.id === 'panel-' + id);
  });
}
</script>
</body>
</html>
```

- [ ] **Step 2：在浏览器中验证骨架**

```bash
cd "bigPlayer/admin/content-governance"
python -m http.server 8082
```

访问 `http://localhost:8082/SpamRuleConfig.html`，确认：侧边栏加载正常、「内容治理 > 灌水判定配置」高亮、三个主 Tab 可点击切换。

- [ ] **Step 3：Commit**

```bash
git add bigPlayer/admin/content-governance/SpamRuleConfig.html
git commit -m "feat: add SpamRuleConfig page skeleton"
```

---

## Task 3：总开关 Tab

**Files:**
- Modify: `bigPlayer/admin/content-governance/SpamRuleConfig.html`

- [ ] **Step 1：在 `panel-switch` 中写入总开关内容**

将 `<!-- Task 3 填充 -->` 替换为：

```html
<div style="max-width:600px;">
  <div style="display:flex;align-items:center;gap:16px;padding:8px 0;">
    <span style="font-size:14px;color:#262626;font-weight:500;">内容治理功能</span>
    <div class="toggle-track" id="global-toggle" onclick="toggleGlobal()" title="点击切换开关">
      <div class="toggle-thumb"></div>
    </div>
    <span id="global-status" style="font-size:13px;color:#52c41a;">已开启</span>
  </div>
  <p style="font-size:12px;color:#8c8c8c;margin-top:8px;line-height:1.8;">
    关闭后所有判定规则停止运行，已有打标数据不受影响。
  </p>
</div>
```

在 `<style>` 块补充 Toggle 样式（放在现有样式末尾）：

```css
/* ── Toggle 开关 ── */
.toggle-track {
  width: 36px; height: 20px;
  border-radius: 20px;
  background: #1890ff;
  position: relative;
  cursor: pointer;
  transition: background 0.2s;
  flex-shrink: 0;
}
.toggle-track.off { background: #d9d9d9; }
.toggle-thumb {
  width: 14px; height: 14px;
  border-radius: 50%;
  background: #fff;
  position: absolute;
  top: 3px; left: 19px;
  transition: left 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.toggle-track.off .toggle-thumb { left: 3px; }
```

在 `<script>` 中补充（放在 `switchMainTab` 函数后）：

```js
// ── CONFIG 数据对象 ──
const CONFIG = {
  globalEnabled: true,
  spamWords: [
    { word: 'good', createdAt: '2026-06-01 10:00:00' },
    { word: 'nice', createdAt: '2026-06-01 10:00:00' },
    { word: '顶',   createdAt: '2026-06-01 10:00:00' },
    { word: '赞',   createdAt: '2026-06-01 10:00:00' },
    { word: '666',  createdAt: '2026-06-01 10:00:00' }
  ],
  maliciousWords: [
    { word: '垃圾', createdAt: '2026-06-01 10:00:00' },
    { word: '骗子', createdAt: '2026-06-01 10:00:00' },
    { word: '滚',   createdAt: '2026-06-01 10:00:00' }
  ],
  rules: {
    R1: true, R2: true, R3: true, R4: true, R5: true,
    R6: true, R7: true, R8: true, R9: true
  },
  spamThreshold: 2,
  markedThreshold: 1
};

function toggleGlobal() {
  CONFIG.globalEnabled = !CONFIG.globalEnabled;
  const track = document.getElementById('global-toggle');
  const status = document.getElementById('global-status');
  track.classList.toggle('off', !CONFIG.globalEnabled);
  status.textContent = CONFIG.globalEnabled ? '已开启' : '已关闭';
  status.style.color = CONFIG.globalEnabled ? '#52c41a' : '#8c8c8c';
}
```

- [ ] **Step 2：验证总开关交互**

刷新页面，点击 Toggle，确认：开启时轨道蓝色、滑块右侧、文字「已开启」绿色；关闭时轨道灰色、滑块左侧、文字「已关闭」灰色。

- [ ] **Step 3：Commit**

```bash
git add bigPlayer/admin/content-governance/SpamRuleConfig.html
git commit -m "feat: add global switch tab"
```

---

## Task 4：词库管理 Tab（灌水词库 + 恶意词库）

**Files:**
- Modify: `bigPlayer/admin/content-governance/SpamRuleConfig.html`

- [ ] **Step 1：写入词库 Tab HTML**

将 `<!-- Task 4 填充 -->` 替换为：

```html
<!-- 子 Tab 栏 -->
<div class="sub-tab-bar">
  <div class="sub-tab-item active" onclick="switchWordTab('spam')">灌水词库</div>
  <div class="sub-tab-item" onclick="switchWordTab('malicious')">恶意词库</div>
</div>

<!-- 灌水词库面板 -->
<div class="sub-tab-panel active" id="word-panel-spam">
  <div class="word-action-bar">
    <input class="word-input" id="spam-input" type="text" placeholder="输入词语，按 Enter 添加" onkeydown="if(event.key==='Enter')addWord('spam')">
    <button class="btn-sm btn-primary" onclick="addWord('spam')">添加</button>
    <button class="btn-sm btn-default" onclick="openImportModal('spam')">导入</button>
    <a class="btn-link" onclick="downloadTemplate()">下载导入模板</a>
  </div>
  <table class="word-table">
    <thead><tr><th>词语</th><th style="width:180px;">创建时间</th><th style="width:80px;">操作</th></tr></thead>
    <tbody id="spam-table-body"></tbody>
  </table>
</div>

<!-- 恶意词库面板 -->
<div class="sub-tab-panel" id="word-panel-malicious">
  <div class="word-action-bar">
    <input class="word-input" id="malicious-input" type="text" placeholder="输入词语，按 Enter 添加" onkeydown="if(event.key==='Enter')addWord('malicious')">
    <button class="btn-sm btn-primary" onclick="addWord('malicious')">添加</button>
    <button class="btn-sm btn-default" onclick="openImportModal('malicious')">导入</button>
    <a class="btn-link" onclick="downloadTemplate()">下载导入模板</a>
  </div>
  <table class="word-table">
    <thead><tr><th>词语</th><th style="width:180px;">创建时间</th><th style="width:80px;">操作</th></tr></thead>
    <tbody id="malicious-table-body"></tbody>
  </table>
</div>
```

- [ ] **Step 2：在 `<style>` 补充词库相关样式**

```css
/* ── 词库操作栏 ── */
.word-action-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.word-input {
  height: 32px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  padding: 0 10px;
  font-size: 13px;
  color: #262626;
  outline: none;
  min-width: 220px;
  cursor: text;
}
.word-input:focus { border-color: #1890ff; box-shadow: 0 0 0 2px rgba(24,144,255,0.15); }
.btn-sm {
  height: 32px;
  padding: 0 14px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid #d9d9d9;
}
.btn-primary { background: #1890ff; color: #fff; border-color: #1890ff; }
.btn-primary:hover { background: #40a9ff; border-color: #40a9ff; }
.btn-default { background: #fff; color: #595959; }
.btn-default:hover { border-color: #1890ff; color: #1890ff; }
.btn-link {
  font-size: 13px;
  color: #1890ff;
  cursor: pointer;
  text-decoration: none;
  padding: 0 4px;
}
.btn-link:hover { color: #40a9ff; }
/* ── 词库表格 ── */
.word-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.word-table th {
  padding: 12px;
  font-weight: 500;
  color: #262626;
  border-bottom: 1px solid #e8e8e8;
  text-align: left;
  background: #fafafa;
}
.word-table td {
  padding: 12px;
  color: #595959;
  border-bottom: 1px solid #f0f0f0;
}
.word-table tr:hover td { background: #fafeff; }
.btn-del {
  background: none;
  border: none;
  font-size: 13px;
  color: #ff4d4f;
  cursor: pointer;
  padding: 0;
}
.btn-del:hover { color: #ff7875; }
```

- [ ] **Step 3：在 `<script>` 补充词库逻辑**

```js
// ── 子 Tab 切换 ──
function switchWordTab(type) {
  document.querySelectorAll('.sub-tab-item').forEach((el, i) => {
    el.classList.toggle('active', i === (type === 'spam' ? 0 : 1));
  });
  document.getElementById('word-panel-spam').classList.toggle('active', type === 'spam');
  document.getElementById('word-panel-malicious').classList.toggle('active', type === 'malicious');
}

// ── 渲染词库表格 ──
function renderWordTable(type) {
  const list = type === 'spam' ? CONFIG.spamWords : CONFIG.maliciousWords;
  const tbody = document.getElementById(type + '-table-body');
  tbody.innerHTML = list.map((item, idx) => `
    <tr>
      <td>${item.word}</td>
      <td>${item.createdAt}</td>
      <td><button class="btn-del" onclick="deleteWord('${type}',${idx})">删除</button></td>
    </tr>
  `).join('');
}

// ── 添加词条 ──
function addWord(type) {
  const input = document.getElementById(type + '-input');
  const val = input.value.trim();
  if (!val) return;
  const list = type === 'spam' ? CONFIG.spamWords : CONFIG.maliciousWords;
  if (list.some(w => w.word === val)) { alert('词条已存在'); return; }
  const now = new Date();
  const pad = n => String(n).padStart(2,'0');
  const ts = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  list.push({ word: val, createdAt: ts });
  input.value = '';
  renderWordTable(type);
}

// ── 删除词条 ──
function deleteWord(type, idx) {
  const list = type === 'spam' ? CONFIG.spamWords : CONFIG.maliciousWords;
  list.splice(idx, 1);
  renderWordTable(type);
}

// ── 下载导入模板 ──
function downloadTemplate() {
  const csv = 'word\ngood\nnice\n顶';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = '词库导入模板.csv'; a.click();
  URL.revokeObjectURL(url);
}

// 初始渲染
renderWordTable('spam');
renderWordTable('malicious');
```

- [ ] **Step 4：验证词库功能**

刷新页面，切换到「词库管理」Tab，验证：
1. 子 Tab 「灌水词库」/「恶意词库」可切换，数据独立
2. 输入词语 + 点「添加」或按 Enter，词条出现在表格中
3. 点「删除」，词条消失
4. 重复词条弹出提示「词条已存在」
5. 点「下载导入模板」，下载文件 `词库导入模板.csv`，内容为 `word\ngood\nnice\n顶`

- [ ] **Step 5：Commit**

```bash
git add bigPlayer/admin/content-governance/SpamRuleConfig.html
git commit -m "feat: add word library tabs with add/delete/template"
```

---

## Task 5：词库导入弹窗

**Files:**
- Modify: `bigPlayer/admin/content-governance/SpamRuleConfig.html`

- [ ] **Step 1：在 `</div><!-- FAB -->` 之前写入导入弹窗 HTML**

在 `<!-- FAB + 需求说明面板（Task 6 填充）-->` 之前添加：

```html
<!-- ══ 导入弹窗 ══ -->
<div class="modal-overlay" id="import-overlay" onclick="closeImportModal()"></div>
<div class="modal-box" id="import-modal">
  <div class="modal-header">
    <span class="modal-title">导入词库</span>
    <button class="modal-close" onclick="closeImportModal()">×</button>
  </div>
  <div class="modal-body">
    <div class="upload-zone" id="upload-zone" onclick="document.getElementById('file-input').click()">
      <div style="font-size:32px;color:#bfbfbf;margin-bottom:8px;">📂</div>
      <div style="font-size:13px;color:#595959;">点击选择文件，支持 .xlsx / .csv</div>
      <div style="font-size:11px;color:#8c8c8c;margin-top:4px;">文件须包含 word 列</div>
    </div>
    <input type="file" id="file-input" accept=".csv,.xlsx" style="display:none;" onchange="handleFileUpload(event)">
    <div id="preview-area" style="display:none;margin-top:14px;">
      <div style="font-size:13px;color:#595959;margin-bottom:8px;" id="preview-count"></div>
      <table class="word-table">
        <thead><tr><th>词语（前5条预览）</th></tr></thead>
        <tbody id="preview-table-body"></tbody>
      </table>
    </div>
  </div>
  <div class="modal-footer">
    <button class="btn-sm btn-default" onclick="closeImportModal()">取消</button>
    <button class="btn-sm btn-primary" id="btn-confirm-import" onclick="confirmImport()" disabled>确认导入</button>
  </div>
</div>
```

- [ ] **Step 2：在 `<style>` 补充弹窗样式**

```css
/* ── 弹窗 ── */
.modal-overlay {
  display: none; position: fixed; inset: 0;
  background: rgba(0,0,0,0.45); z-index: 1000;
}
.modal-overlay.open { display: block; }
.modal-box {
  display: none; position: fixed;
  top: 50%; left: 50%; transform: translate(-50%,-50%);
  width: 572px; background: #fff;
  border-radius: 8px; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
  z-index: 1001; overflow: hidden;
}
.modal-box.open { display: block; }
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid #e8e8e8;
}
.modal-title { font-size: 16px; font-weight: 600; color: #262626; }
.modal-close {
  width: 24px; height: 24px; border-radius: 50%;
  background: #f0f0f0; border: none; font-size: 16px;
  color: #888; cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.modal-close:hover { background: #e0e0e0; color: #333; }
.modal-body { padding: 20px; }
.modal-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 14px 20px; border-top: 1px solid #e8e8e8;
}
.upload-zone {
  border: 2px dashed #d9d9d9; border-radius: 8px;
  padding: 32px; text-align: center; cursor: pointer;
  transition: border-color 0.2s;
}
.upload-zone:hover { border-color: #1890ff; }
```

- [ ] **Step 3：在 `<script>` 补充导入弹窗逻辑**

```js
// ── 导入弹窗状态 ──
let _importType = 'spam';
let _importWords = [];

function openImportModal(type) {
  _importType = type;
  _importWords = [];
  document.getElementById('preview-area').style.display = 'none';
  document.getElementById('file-input').value = '';
  document.getElementById('btn-confirm-import').disabled = true;
  document.getElementById('import-overlay').classList.add('open');
  document.getElementById('import-modal').classList.add('open');
}

function closeImportModal() {
  document.getElementById('import-overlay').classList.remove('open');
  document.getElementById('import-modal').classList.remove('open');
}

function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    const text = ev.target.result;
    // 简单 CSV 解析：取第一列，跳过标题行 word
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const start = lines[0].toLowerCase() === 'word' ? 1 : 0;
    _importWords = lines.slice(start).map(l => l.split(',')[0].trim()).filter(Boolean);
    // 预览
    const preview = _importWords.slice(0, 5);
    document.getElementById('preview-count').textContent = `共解析到 ${_importWords.length} 条词语`;
    document.getElementById('preview-table-body').innerHTML = preview.map(w => `<tr><td>${w}</td></tr>`).join('');
    document.getElementById('preview-area').style.display = 'block';
    document.getElementById('btn-confirm-import').disabled = _importWords.length === 0;
  };
  reader.readAsText(file, 'utf-8');
}

function confirmImport() {
  if (!_importWords.length) return;
  const list = _importType === 'spam' ? CONFIG.spamWords : CONFIG.maliciousWords;
  const now = new Date();
  const pad = n => String(n).padStart(2,'0');
  const ts = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  let added = 0;
  _importWords.forEach(w => {
    if (!list.some(x => x.word === w)) { list.push({ word: w, createdAt: ts }); added++; }
  });
  closeImportModal();
  renderWordTable(_importType);
  alert(`导入完成，新增 ${added} 条词语（重复跳过 ${_importWords.length - added} 条）`);
}
```

- [ ] **Step 4：验证导入功能**

制作测试文件 `test-words.csv`（内容：`word\nhello\nworld\ngood`），在页面中：
1. 点击「导入」按钮 → 弹窗出现
2. 选择测试文件 → 预览区显示「共解析到 3 条词语」，表格展示前 3 条
3. 点「确认导入」→ 弹窗关闭，表格更新，`good` 因重复被跳过，弹出「导入完成，新增 2 条词语（重复跳过 1 条）」
4. 点遮罩层或「取消」可关闭弹窗

- [ ] **Step 5：Commit**

```bash
git add bigPlayer/admin/content-governance/SpamRuleConfig.html
git commit -m "feat: add word import modal with CSV preview"
```

---

## Task 6：规则配置 Tab

**Files:**
- Modify: `bigPlayer/admin/content-governance/SpamRuleConfig.html`

- [ ] **Step 1：将 `<!-- Task 5 填充 -->` 替换为规则配置内容**

将 `panel-rules` 中的 `<!-- Task 5 填充 -->` 替换为：

```html
<!-- 规则列表卡片 -->
<div class="rule-card">
  <div class="rule-card-title">规则启用</div>
  <table class="word-table">
    <thead>
      <tr>
        <th style="width:48px;">启用</th>
        <th style="width:80px;">规则编号</th>
        <th style="width:140px;">规则名称</th>
        <th>说明</th>
      </tr>
    </thead>
    <tbody id="rules-table-body"></tbody>
  </table>
</div>

<!-- 阈值配置卡片 -->
<div class="rule-card" style="margin-top:16px;">
  <div class="rule-card-title">判定阈值</div>
  <div class="threshold-row">
    <span class="threshold-label">命中以下数量规则，判定为</span>
    <strong style="color:#ff4d4f;">灌水（spam）</strong>
    <span class="threshold-label">：≥</span>
    <input class="threshold-input" id="spam-threshold" type="number" min="1" value="2">
    <span class="threshold-label">条</span>
  </div>
  <div class="threshold-row" style="margin-top:10px;">
    <span class="threshold-label">命中以下数量规则，判定为</span>
    <strong style="color:#fa8c16;">嫌疑（marked）</strong>
    <span class="threshold-label">：≥</span>
    <input class="threshold-input" id="marked-threshold" type="number" min="1" value="1">
    <span class="threshold-label">条</span>
  </div>
  <p style="font-size:12px;color:#8c8c8c;margin-top:12px;">低于嫌疑阈值的内容判定为正常（normal）</p>
  <div style="margin-top:20px;">
    <button class="btn-sm btn-primary" onclick="saveRules()">保存配置</button>
  </div>
</div>
```

- [ ] **Step 2：在 `<style>` 补充规则配置样式**

```css
/* ── 规则配置卡片 ── */
.rule-card {
  border: 1px solid #e8e8e8;
  border-radius: 4px;
  overflow: hidden;
}
.rule-card-title {
  padding: 12px 16px;
  font-size: 13px;
  font-weight: 500;
  color: #262626;
  background: #fafafa;
  border-bottom: 1px solid #e8e8e8;
}
.threshold-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px 0;
}
.threshold-label { font-size: 13px; color: #595959; }
.threshold-input {
  width: 64px; height: 32px;
  border: 1px solid #d9d9d9; border-radius: 4px;
  padding: 0 8px; font-size: 13px; color: #262626;
  outline: none; text-align: center;
}
.threshold-input:focus { border-color: #1890ff; box-shadow: 0 0 0 2px rgba(24,144,255,0.15); }
.rule-checkbox {
  width: 16px; height: 16px; cursor: pointer;
  accent-color: #1890ff;
}
```

- [ ] **Step 3：在 `<script>` 补充规则配置逻辑**

```js
// ── 规则定义 ──
const RULE_DEFS = [
  { id: 'R1', name: '词库命中',    desc: '内容归一化后完全等于词库中某个词' },
  { id: 'R2', name: '有效字数不足', desc: '有效字数（去连续重复后）少于 4 个' },
  { id: 'R3', name: '无文字内容',  desc: '无任何文字或数字字符（纯表情/符号）' },
  { id: 'R4', name: '表情符号占比高', desc: '表情+符号字符占总字符比 ≥ 70%' },
  { id: 'R5', name: '单字符占比高', desc: '最高频单字符占总字符比 ≥ 80%' },
  { id: 'R6', name: '整条复读',    desc: '内容为某子串重复 ≥ 3 次' },
  { id: 'R7', name: '纯数字',      desc: '去除标点后内容全为数字' },
  { id: 'R8', name: '词库词堆砌',  desc: '所有切分片段均属于词库词条' },
  { id: 'R9', name: '键盘乱码',    desc: '连续键位串或无元音字母串' },
];

function renderRulesTable() {
  const tbody = document.getElementById('rules-table-body');
  tbody.innerHTML = RULE_DEFS.map(r => `
    <tr>
      <td style="text-align:center;">
        <input type="checkbox" class="rule-checkbox" ${CONFIG.rules[r.id] ? 'checked' : ''}
          onchange="CONFIG.rules['${r.id}'] = this.checked">
      </td>
      <td style="font-weight:500;color:#262626;">${r.id}</td>
      <td>${r.name}</td>
      <td style="color:#8c8c8c;">${r.desc}</td>
    </tr>
  `).join('');
}

function saveRules() {
  const spamVal = parseInt(document.getElementById('spam-threshold').value, 10);
  const markedVal = parseInt(document.getElementById('marked-threshold').value, 10);
  if (isNaN(spamVal) || isNaN(markedVal) || spamVal < 1 || markedVal < 1) {
    alert('阈值必须为正整数'); return;
  }
  if (spamVal <= markedVal) {
    alert('灌水阈值必须大于嫌疑阈值'); return;
  }
  CONFIG.spamThreshold = spamVal;
  CONFIG.markedThreshold = markedVal;
  alert('保存成功');
}

renderRulesTable();
```

- [ ] **Step 4：验证规则配置功能**

刷新页面，切换到「规则配置」Tab，验证：
1. R1~R9 全部显示，默认全部勾选
2. 取消勾选某条规则，`CONFIG.rules` 中对应项变为 `false`
3. 将灌水阈值改为 `1`，嫌疑阈值改为 `2`，点「保存配置」→ 弹出「灌水阈值必须大于嫌疑阈值」
4. 正确值（灌水 `3`，嫌疑 `1`）→ 弹出「保存成功」

- [ ] **Step 5：Commit**

```bash
git add bigPlayer/admin/content-governance/SpamRuleConfig.html
git commit -m "feat: add rule config tab with threshold validation"
```

---

## Task 7：需求说明浮窗（FAB）

**Files:**
- Modify: `bigPlayer/admin/content-governance/SpamRuleConfig.html`

- [ ] **Step 1：将 `<!-- FAB + 需求说明面板（Task 6 填充）-->` 替换为 FAB 完整结构**

```html
<!-- ══ 需求说明 FAB ══ -->
<style>
.help-fab {
  position: fixed; right: 24px; bottom: 24px;
  width: 120px; height: 120px; border-radius: 16px;
  background: linear-gradient(145deg, #1890ff 0%, #096dd9 100%);
  color: #fff; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 6px;
  cursor: pointer; box-shadow: 0 4px 16px rgba(24,144,255,0.4);
  z-index: 800; user-select: none;
  transition: box-shadow 0.2s;
}
.help-fab:hover { box-shadow: 0 6px 24px rgba(24,144,255,0.55); }
.help-fab-icon { font-size: 32px; }
.help-fab-text { font-size: 12px; font-weight: 500; }
.help-panel {
  position: fixed; top: 0; right: -500px; width: 480px; height: 100vh;
  background: #fff; box-shadow: -4px 0 24px rgba(0,0,0,0.12);
  z-index: 850; display: flex; flex-direction: column;
  transition: right 0.3s cubic-bezier(.4,0,.2,1);
}
.help-panel.open { right: 0; }
.help-panel-overlay { display: none; position: fixed; inset: 0; z-index: 849; }
.help-panel-overlay.open { display: block; }
.help-panel-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 20px; border-bottom: 1px solid #e8e8e8; flex-shrink: 0;
}
.help-panel-title {
  font-size: 16px; font-weight: 600; color: #262626;
  display: flex; align-items: center; gap: 8px;
}
.help-panel-title::before {
  content: ''; width: 4px; height: 18px;
  background: #1890ff; border-radius: 2px;
}
.help-panel-close {
  width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
  border-radius: 50%; background: #f5f5f5; font-size: 16px; color: #888;
  cursor: pointer; border: none; transition: background 0.15s;
}
.help-panel-close:hover { background: #e0e0e0; color: #333; }
.help-panel-body { flex: 1; overflow-y: auto; padding: 20px; }
.help-version-block { border: 1px solid #e8e8e8; border-radius: 8px; margin-bottom: 12px; overflow: hidden; }
.help-version-hd {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; cursor: pointer; background: #fff; user-select: none;
  transition: background 0.15s;
}
.help-version-hd:hover { background: #f0f7ff; }
.help-version-hd.is-latest { background: #e6f7ff; }
.help-version-num { font-size: 13px; font-weight: 700; color: #262626; }
.help-version-date { font-size: 11px; color: #aaa; margin-left: 4px; }
.help-version-badge { font-size: 10px; font-weight: 600; color: #fff; background: #1890ff; border-radius: 8px; padding: 1px 7px; margin-left: 4px; }
.help-version-arrow { margin-left: auto; font-size: 11px; color: #bbb; transition: transform 0.2s; }
.help-version-block.open .help-version-arrow { transform: rotate(180deg); }
.help-version-body { display: none; padding: 14px 16px; border-top: 1px solid #e8e8e8; background: #fafcfe; }
.help-version-block.open .help-version-body { display: block; }
.help-section { margin-bottom: 14px; }
.help-section:last-child { margin-bottom: 0; }
.help-section-title { font-size: 12px; font-weight: 600; color: #1890ff; margin-bottom: 6px; display: flex; align-items: center; gap: 5px; }
.help-section-title::before { content: ''; width: 3px; height: 12px; background: #1890ff; border-radius: 2px; flex-shrink: 0; }
.help-section p { font-size: 12px; color: #555; line-height: 1.9; }
.help-section ul { padding-left: 16px; }
.help-section ul li { font-size: 12px; color: #555; line-height: 2; }
</style>

<div class="help-fab" id="help-fab" onclick="openHelp()">
  <div class="help-fab-icon">📋</div>
  <div class="help-fab-text">需求说明</div>
</div>

<div class="help-panel-overlay" id="help-panel-overlay" onclick="closeHelp()"></div>
<div class="help-panel" id="help-panel">
  <div class="help-panel-header">
    <div class="help-panel-title">灌水判定配置 — 需求说明</div>
    <button class="help-panel-close" onclick="closeHelp()">×</button>
  </div>
  <div class="help-panel-body">
    <div class="help-version-block open">
      <div class="help-version-hd is-latest" onclick="this.parentElement.classList.toggle('open')">
        <span class="help-version-num">v1.0.0</span>
        <span class="help-version-date">2026-06-18</span>
        <span class="help-version-badge">最新</span>
        <span class="help-version-arrow">▼</span>
      </div>
      <div class="help-version-body">
        <div class="help-section">
          <div class="help-section-title">背景与目标</div>
          <p>社区积分体系催生大量灌水内容。本期只做「判定」，不做惩罚：对每条新发布内容输出 normal / marked / spam 三档状态标记。</p>
        </div>
        <div class="help-section">
          <div class="help-section-title">总开关</div>
          <ul>
            <li>关闭后所有判定规则停止运行，已有打标数据不受影响。</li>
          </ul>
        </div>
        <div class="help-section">
          <div class="help-section-title">词库管理</div>
          <ul>
            <li>灌水词库与恶意词库独立维护，互不影响。</li>
            <li>支持单条输入添加与 CSV 批量导入（word 列）。</li>
            <li>下载导入模板可获得标准格式示例。</li>
          </ul>
        </div>
        <div class="help-section">
          <div class="help-section-title">规则配置</div>
          <ul>
            <li>R1~R9 每条规则可独立启用/禁用。</li>
            <li>灌水阈值：命中规则数 ≥ N 判定为 spam（默认 2）。</li>
            <li>嫌疑阈值：命中规则数 ≥ M 判定为 marked（默认 1）。</li>
            <li>灌水阈值必须大于嫌疑阈值。</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 2：在 `<script>` 末尾补充 FAB 逻辑**

```js
function openHelp() {
  document.getElementById('help-panel').classList.add('open');
  document.getElementById('help-panel-overlay').classList.add('open');
}
function closeHelp() {
  document.getElementById('help-panel').classList.remove('open');
  document.getElementById('help-panel-overlay').classList.remove('open');
}
```

- [ ] **Step 3：验证 FAB 功能**

刷新页面，验证：
1. 右下角蓝色「需求说明」FAB 显示正常
2. 点击 FAB，面板从右侧滑入，版本内容折叠/展开正常
3. 点遮罩或关闭按钮，面板收回

- [ ] **Step 4：Commit**

```bash
git add bigPlayer/admin/content-governance/SpamRuleConfig.html
git commit -m "feat: add help FAB panel"
```

---

## Task 8：更新 memory.md + 最终验收

**Files:**
- Modify: `bigPlayer/admin/memory.md`

- [ ] **Step 1：在 memory.md 已完成页面表格中追加新页面**

在「已完成页面」表格末尾追加一行：

```
| 灌水判定配置 | `admin/content-governance/SpamRuleConfig.html` | v1.0.0 | 2026-06-18 |
```

在「版本历史摘要」表格末尾追加：

```
| v1.0.0 | 2026-06-18 | 新增内容治理目录，灌水判定配置页：总开关 / 词库管理（灌水+恶意词库，支持增删导入）/ 规则配置（R1-R9 + spam/marked 阈值可配） |
```

在「目录结构规划」更新 `content-governance/` 状态为已完成：

```
├── content-governance/ # 内容治理
│   └── SpamRuleConfig.html  ✓ 已完成
```

- [ ] **Step 2：全流程验收**

按顺序验证以下所有功能：

1. **侧边栏**：「后台管理 → 内容治理 → 灌水判定配置」高亮激活
2. **总开关 Tab**：Toggle 开/关切换，状态文字颜色正确
3. **词库管理 Tab → 灌水词库**：添加词条、删除词条、重复提示、Enter 键添加
4. **词库管理 Tab → 恶意词库**：切换子 Tab 后数据独立
5. **导入流程**：上传 CSV → 预览 → 确认导入 → 去重提示
6. **下载模板**：文件下载，内容含 word 列头和示例词
7. **规则配置 Tab**：R1~R9 全部显示，checkbox 可勾选
8. **阈值校验**：spam ≤ marked 时保存报错，正确值保存成功
9. **FAB**：面板开/关，版本内容折叠/展开

- [ ] **Step 3：Commit**

```bash
git add bigPlayer/admin/memory.md
git commit -m "docs: update admin memory with SpamRuleConfig"
```

---

## 自检结果

- **Spec 覆盖**：总开关 ✓、灌水词库 ✓、恶意词库 ✓、词库导入+模板 ✓、R1~R9 勾选 ✓、spam/marked 阈值可配 ✓、阈值校验 ✓、FAB ✓、侧边栏注册 ✓
- **Placeholder**：无 TBD/TODO
- **类型一致性**：`CONFIG.spamWords` / `CONFIG.maliciousWords` 结构 `{word, createdAt}` 在 Task 3~5 全部一致；`renderWordTable(type)` 签名在 Task 4、5 一致；`deleteWord(type, idx)` 签名一致
