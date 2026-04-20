# 徽章管理后台页面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 bigPlayer 原型的后台管理目录下新增 `BadgeManage.html`，包含徽章列表页和新增/编辑弹窗，并更新侧边导航数据。

**Architecture:** 单 HTML 文件，无框架，纯原生 JS 操作 DOM。列表常驻，弹窗以遮罩层覆盖。复用 bigPlayer/shared 中的 sidebar.css / sidebar.js / sidebar-data.js，与现有 client 端原型保持一致的工程模式。

**Tech Stack:** HTML5, CSS3（原生），Vanilla JS，无构建工具，文件直接在浏览器中运行。

---

## 文件变更清单

| 操作 | 文件 | 职责 |
|------|------|------|
| 新建 | `bigPlayer/admin/community/BadgeManage.html` | 徽章管理完整页面（列表 + 弹窗） |
| 修改 | `bigPlayer/shared/sidebar-data.js` | 后台管理 → 社区功能 → 徽章管理 条目 |

---

## Task 1：创建目录并更新 sidebar-data.js

**Files:**
- Modify: `bigPlayer/shared/sidebar-data.js`

- [ ] **Step 1: 在 sidebar-data.js 的"社区功能"children 数组中插入徽章管理目录节点**

找到以下位置（`label: '社区功能'` 的 dir 节点，其 `children: []`），替换为：

```js
{
  type: 'dir',
  label: '社区功能',
  children: [
    {
      type: 'dir',
      label: '徽章管理',
      children: [
        {
          type: 'item',
          label: '徽章管理',
          version: 'v3.0.9',
          href: 'admin/community/BadgeManage.html'
        },
        {
          type: 'item',
          label: '徽章分类管理',
          version: 'v3.0.9',
          href: 'admin/community/BadgeManage.html'
        }
      ]
    }
  ]
},
```

- [ ] **Step 2: 创建目录**

```bash
mkdir -p bigPlayer/admin/community
```

- [ ] **Step 3: 验证侧边栏数据**

在浏览器打开现有的 `bigPlayer/client/profile/personalization/Badge.html`，确认左侧导航"后台管理 → 社区功能"下出现"徽章管理"子目录，展开后有"徽章管理"和"徽章分类管理"两个条目。

- [ ] **Step 4: Commit**

```bash
git add bigPlayer/shared/sidebar-data.js
git commit -m "feat: add badge manage admin nav entries to sidebar-data"
```

---

## Task 2：创建 BadgeManage.html 基础骨架

**Files:**
- Create: `bigPlayer/admin/community/BadgeManage.html`

- [ ] **Step 1: 创建 HTML 文件，写入页面骨架**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>徽章管理 - 大玩家后台</title>
<link rel="stylesheet" href="../../shared/sidebar.css">
<style>
/* 全局 */
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
</style>
</head>
<body>
<nav id="sidebar" class="sidebar"></nav>
<div class="admin-main" id="admin-main">
  <!-- 内容区，后续任务填充 -->
</div>
<script src="../../shared/sidebar-data.js"></script>
<script src="../../shared/sidebar.js"></script>
<script>
  initSidebar({
    root: '../..',
    currentHref: 'admin/community/BadgeManage.html'
  });
</script>
</body>
</html>
```

- [ ] **Step 2: 在浏览器打开文件，确认**

- 左侧深色 sidebar 正常渲染
- "后台管理 → 社区功能 → 徽章管理 → 徽章管理"高亮激活
- 右侧内容区为空白（正常，后续填充）

- [ ] **Step 3: Commit**

```bash
git add bigPlayer/admin/community/BadgeManage.html
git commit -m "feat: add BadgeManage.html skeleton with sidebar"
```

---

## Task 3：实现列表页 CSS 样式

**Files:**
- Modify: `bigPlayer/admin/community/BadgeManage.html`（`<style>` 块）

- [ ] **Step 1: 在 `<style>` 块中补充所有列表页样式**

在已有的 `/* 全局 */` 样式后追加：

```css
/* ── 页面卡片 ── */
.page-card {
  background: #fff;
  border-radius: 4px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
  margin-bottom: 16px;
  overflow: hidden;
}

/* ── Tab 栏 ── */
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
.tab-item.active {
  color: #1890ff;
  font-weight: 500;
}
.tab-item.active::after {
  content: '';
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 2px;
  background: #1890ff;
  border-radius: 1px 1px 0 0;
}

/* ── 筛选栏 ── */
.filter-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid #f0f0f0;
}
.filter-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #595959;
}
.filter-required { color: #ff4d4f; }
.filter-select, .filter-input {
  height: 32px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  padding: 0 10px;
  font-size: 13px;
  color: #262626;
  background: #fff;
  outline: none;
  cursor: pointer;
  min-width: 140px;
}
.filter-input { min-width: 160px; cursor: text; }
.filter-select:focus, .filter-input:focus { border-color: #1890ff; box-shadow: 0 0 0 2px rgba(24,144,255,0.2); }
.btn-query {
  height: 32px;
  padding: 0 16px;
  background: #1890ff;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-query:hover { background: #40a9ff; }

/* ── 操作栏 ── */
.action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid #f0f0f0;
}
.btn-add {
  height: 32px;
  padding: 0 16px;
  background: #1890ff;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-add:hover { background: #40a9ff; }
.toolbar-icons { display: flex; gap: 8px; }
.toolbar-icon {
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid #d9d9d9; border-radius: 4px;
  font-size: 14px; cursor: pointer; color: #595959;
  background: #fff;
}
.toolbar-icon:hover { border-color: #1890ff; color: #1890ff; }

/* ── 表格 ── */
.table-wrap { overflow-x: auto; }
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
thead tr { background: #fafafa; }
th {
  padding: 12px 12px;
  text-align: left;
  font-weight: 500;
  color: #262626;
  border-bottom: 1px solid #e8e8e8;
  white-space: nowrap;
}
td {
  padding: 14px 12px;
  color: #595959;
  border-bottom: 1px solid #f0f0f0;
  vertical-align: middle;
}
tbody tr:hover { background: #fafeff; }

/* 级别标签 */
.level-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid transparent;
  white-space: nowrap;
}
.level-rare     { color: #fa8c16; background: #fff7e6; border-color: #ffd591; }
.level-uncommon { color: #722ed1; background: #f9f0ff; border-color: #d3adf7; }
.level-epic     { color: #f5222d; background: #fff1f0; border-color: #ffa39e; }
.level-legend   { color: #1890ff; background: #e6f7ff; border-color: #91d5ff; }
.level-normal   { color: #8c6e3f; background: #fdf6ec; border-color: #d4b483; }

/* 状态 */
.status-pass { color: #52c41a; font-weight: 500; }
.status-reject { color: #ff4d4f; font-weight: 500; }

/* 操作按钮 */
.op-btn {
  background: none; border: none;
  font-size: 13px; cursor: pointer;
  padding: 2px 4px;
}
.op-edit { color: #1890ff; }
.op-edit:hover { color: #40a9ff; }
.op-delete { color: #ff4d4f; }
.op-delete:hover { color: #ff7875; }

/* 图标预览 */
.badge-icon-preview {
  width: 40px; height: 40px;
  clip-path: polygon(50% 0%, 97% 34%, 79% 97%, 21% 97%, 3% 34%);
  display: flex; align-items: center; justify-content: center;
  font-size: 18px;
}

/* 描述省略 */
.desc-cell {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── 分页 ── */
.pagination {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 14px 20px;
  font-size: 13px;
  color: #595959;
}
.page-total { margin-right: 8px; }
.page-btn {
  min-width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid #d9d9d9; border-radius: 4px;
  cursor: pointer; font-size: 13px; background: #fff;
  padding: 0 6px;
  transition: all 0.2s;
  user-select: none;
}
.page-btn:hover { border-color: #1890ff; color: #1890ff; }
.page-btn.active { background: #1890ff; border-color: #1890ff; color: #fff; }
.page-btn.disabled { color: #d9d9d9; cursor: not-allowed; border-color: #d9d9d9; }
.page-jump {
  display: flex; align-items: center; gap: 6px; margin-left: 8px;
}
.page-jump input {
  width: 44px; height: 28px;
  border: 1px solid #d9d9d9; border-radius: 4px;
  text-align: center; font-size: 13px; outline: none;
}
.page-size-select {
  height: 28px;
  border: 1px solid #d9d9d9; border-radius: 4px;
  padding: 0 6px; font-size: 13px; outline: none;
  cursor: pointer;
}
```

- [ ] **Step 2: 在浏览器刷新，确认无 CSS 报错（控制台无红色错误）**

---

## Task 4：渲染列表页 HTML 结构与 Mock 数据

**Files:**
- Modify: `bigPlayer/admin/community/BadgeManage.html`（`#admin-main` 内容 + `<script>` 块）

- [ ] **Step 1: 将 `#admin-main` 的内容替换为完整列表 HTML**

```html
<div class="admin-main" id="admin-main">
  <div class="page-card">
    <!-- Tab 栏 -->
    <div class="tab-bar">
      <div class="tab-item active" id="tab-list">徽章列表</div>
      <div class="tab-item" id="tab-audit">审核列表</div>
    </div>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <div class="filter-item">
        <span><span class="filter-required">*</span> 所属版块：</span>
        <select class="filter-select" id="filter-module">
          <option value="超能世界">超能世界</option>
          <option value="天墙传说手游">天墙传说手游</option>
          <option value="逍遥情缘">逍遥情缘</option>
          <option value="太初界">太初界</option>
          <option value="钓鱼世界">钓鱼世界</option>
          <option value="泰坦降临">泰坦降临</option>
          <option value="天墙传说">天墙传说</option>
          <option value="择日飞仙">择日飞仙</option>
        </select>
      </div>
      <div class="filter-item">
        <span>状态：</span>
        <select class="filter-select" id="filter-status">
          <option value="">全部</option>
          <option value="审核通过">审核通过</option>
          <option value="已拒绝">已拒绝</option>
        </select>
      </div>
      <div class="filter-item">
        <span>徽章名称：</span>
        <input type="text" class="filter-input" id="filter-name" placeholder="名称">
      </div>
      <div class="filter-item">
        <span>徽章分类：</span>
        <select class="filter-select" id="filter-category">
          <option value="">全部</option>
          <option value="活跃成就">活跃成就</option>
          <option value="社交影响">社交影响</option>
          <option value="互动传播">互动传播</option>
        </select>
      </div>
      <button class="btn-query" onclick="renderTable()">查询</button>
    </div>

    <!-- 操作栏 -->
    <div class="action-bar">
      <button class="btn-add" id="btn-open-add">新增</button>
      <div class="toolbar-icons">
        <div class="toolbar-icon" title="列设置">⊟</div>
        <div class="toolbar-icon" title="刷新">↺</div>
        <div class="toolbar-icon" title="全屏">⛶</div>
      </div>
    </div>

    <!-- 表格 -->
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>排序</th>
            <th>徽章名称</th>
            <th>级别</th>
            <th>图标</th>
            <th>描述</th>
            <th>分类</th>
            <th>获得条件</th>
            <th>徽章领取人数</th>
            <th>状态</th>
            <th>审核人</th>
            <th>审核时间</th>
            <th>审核备注</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody id="table-body"></tbody>
      </table>
    </div>

    <!-- 分页 -->
    <div class="pagination">
      <span class="page-total">共50条</span>
      <div class="page-btn disabled">‹</div>
      <div class="page-btn active">1</div>
      <div class="page-btn">2</div>
      <div class="page-btn">3</div>
      <div class="page-btn">4</div>
      <div class="page-btn">5</div>
      <div class="page-btn">›</div>
      <select class="page-size-select"><option>10条/页</option><option>20条/页</option><option>50条/页</option></select>
      <div class="page-jump">
        跳至 <input type="number" min="1" max="5" placeholder=""> 页
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: 在 `initSidebar(...)` 调用后，追加 Mock 数据和表格渲染脚本**

```html
<script>
  // Mock 数据：5条，覆盖5种级别
  const MOCK_BADGES = [
    { sort: 1, name: '花式点赞', level: 'rare',     levelText: '珍贵', icon: '👍', desc: '在社区内累计【点赞】100次', category: '活跃成就', condition: '累计点赞，100次',  count: 7891,  status: '审核通过', reviewer: '梁仓', reviewTime: '2025-12-02 11:19:13', reviewNote: '通过' },
    { sort: 1, name: '花式点赞', level: 'uncommon', levelText: '稀有', icon: '👍', desc: '在社区内累计【点赞】500次', category: '活跃成就', condition: '累计点赞，500次',  count: 1980,  status: '审核通过', reviewer: '梁仓', reviewTime: '2025-12-02 11:19:13', reviewNote: '通过' },
    { sort: 1, name: '花式点赞', level: 'epic',     levelText: '史诗', icon: '👍', desc: '在社区内累计【点赞】1000次', category: '活跃成就', condition: '累计点赞，1000次', count: 1190,  status: '审核通过', reviewer: '梁仓', reviewTime: '2025-12-02 11:19:13', reviewNote: '通过' },
    { sort: 1, name: '花式点赞', level: 'legend',   levelText: '传奇', icon: '👍', desc: '在社区内累计【点赞】10000次', category: '活跃成就', condition: '累计点赞，10000次', count: 50,   status: '审核通过', reviewer: '梁仓', reviewTime: '2025-12-02 11:19:13', reviewNote: '通过' },
    { sort: 1, name: '花式点赞', level: 'normal',   levelText: '普通', icon: '👍', desc: '在社区内累计【点赞】10次',   category: '活跃成就', condition: '累计点赞，10次',   count: 33022, status: '审核通过', reviewer: '梁仓', reviewTime: '2025-12-02 11:19:13', reviewNote: '通过' },
  ];

  const ICON_BG = {
    rare: 'background:linear-gradient(145deg,#f5c842 0%,#c98a00 100%)',
    uncommon: 'background:linear-gradient(145deg,#b27fdb 0%,#6a1faa 100%)',
    epic: 'background:linear-gradient(145deg,#f07070 0%,#c01010 100%)',
    legend: 'background:linear-gradient(145deg,#70b8ff 0%,#0060d0 100%)',
    normal: 'background:linear-gradient(145deg,#c89850 0%,#7a5020 100%)',
  };

  function renderTable() {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = MOCK_BADGES.map(b => `
      <tr>
        <td>${b.sort}</td>
        <td>${b.name}</td>
        <td><span class="level-tag level-${b.level}">${b.levelText}</span></td>
        <td><div class="badge-icon-preview" style="${ICON_BG[b.level]}">${b.icon}</div></td>
        <td class="desc-cell" title="${b.desc}">${b.desc}</td>
        <td>${b.category}</td>
        <td>${b.condition}</td>
        <td>${b.count.toLocaleString()}</td>
        <td><span class="${b.status === '审核通过' ? 'status-pass' : 'status-reject'}">${b.status}</span></td>
        <td>${b.reviewer}</td>
        <td>${b.reviewTime}</td>
        <td>${b.reviewNote}</td>
        <td>
          <button class="op-btn op-edit" onclick="openEditModal(${MOCK_BADGES.indexOf(b)})">编辑</button>
          <button class="op-btn op-delete">删除</button>
        </td>
      </tr>
    `).join('');
  }

  renderTable();

  // Tab 切换
  document.getElementById('tab-list').addEventListener('click', () => {
    document.getElementById('tab-list').classList.add('active');
    document.getElementById('tab-audit').classList.remove('active');
  });
  document.getElementById('tab-audit').addEventListener('click', () => {
    document.getElementById('tab-audit').classList.add('active');
    document.getElementById('tab-list').classList.remove('active');
  });
</script>
```

- [ ] **Step 3: 浏览器验证**

  - 5条 Mock 数据正确渲染，5种级别标签颜色不同
  - 图标列显示五边形（各级别颜色）
  - 描述列超长省略
  - 筛选/查询按钮可点击（重新渲染表格）
  - Tab 切换高亮正常

- [ ] **Step 4: Commit**

```bash
git add bigPlayer/admin/community/BadgeManage.html
git commit -m "feat: render badge list table with mock data and filter bar"
```

---

## Task 5：弹窗 CSS 样式

**Files:**
- Modify: `bigPlayer/admin/community/BadgeManage.html`（`<style>` 块末尾追加）

- [ ] **Step 1: 在 `<style>` 末尾追加弹窗相关样式**

```css
/* ── 弹窗遮罩 ── */
.modal-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  z-index: 1000;
  align-items: center;
  justify-content: center;
}
.modal-overlay.open { display: flex; }

.modal-box {
  background: #fff;
  border-radius: 8px;
  width: 520px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
  position: relative;
}

/* 弹窗顶部 */
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #e8e8e8;
  flex-shrink: 0;
}
.modal-title { font-size: 16px; font-weight: 600; color: #262626; }
.modal-close {
  width: 24px; height: 24px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%; background: #f0f0f0;
  color: #888; font-size: 14px; cursor: pointer;
  font-weight: 600; border: none;
  transition: background 0.15s;
}
.modal-close:hover { background: #e0e0e0; }

/* 语言 Tab */
.modal-lang-bar {
  padding: 12px 20px 0;
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.modal-lang-tab {
  padding: 5px 14px;
  border: 1px solid #1890ff;
  border-radius: 4px;
  font-size: 13px;
  color: #1890ff;
  cursor: pointer;
  background: #e6f7ff;
}

/* 弹窗正文（可滚动） */
.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

/* 表单字段 */
.form-row {
  display: flex;
  align-items: flex-start;
  margin-bottom: 16px;
  gap: 8px;
}
.form-label {
  width: 88px;
  flex-shrink: 0;
  font-size: 13px;
  color: #595959;
  padding-top: 7px;
  text-align: right;
}
.form-required { color: #ff4d4f; }
.form-control {
  flex: 1;
}
.form-input, .form-select {
  width: 100%;
  height: 34px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  padding: 0 10px;
  font-size: 13px;
  color: #262626;
  outline: none;
  background: #fff;
}
.form-input:focus, .form-select:focus {
  border-color: #1890ff;
  box-shadow: 0 0 0 2px rgba(24,144,255,0.15);
}

/* 所属版块 pill */
.module-pill {
  display: inline-block;
  padding: 4px 12px;
  background: #e6f7ff;
  color: #1890ff;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
}

/* 图标上传区 */
.upload-box {
  width: 100px; height: 100px;
  border: 1.5px dashed #d9d9d9;
  border-radius: 6px;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  cursor: pointer; color: #bfbfbf;
  font-size: 24px; gap: 4px;
  transition: border-color 0.2s;
}
.upload-box:hover { border-color: #1890ff; color: #1890ff; }
.upload-hint { font-size: 11px; color: #bfbfbf; margin-top: 6px; line-height: 1.6; }

/* 获得条件行 */
.condition-row {
  display: flex; align-items: center; gap: 8px; width: 100%;
}
.condition-row .form-select { flex: 0 0 130px; width: 130px; }
.condition-row .form-input  { flex: 1; }
.condition-unit { font-size: 13px; color: #595959; white-space: nowrap; }

/* ── 奖品选择 ── */
.prize-row {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.prize-select { flex: 0 0 110px; width: 110px; }
.prize-item-input { flex: 1; min-width: 100px; }
.prize-qty-input { flex: 0 0 80px; width: 80px; }
.btn-prize-add {
  height: 34px; padding: 0 12px;
  background: #1890ff; color: #fff;
  border: none; border-radius: 4px;
  font-size: 13px; cursor: pointer;
  white-space: nowrap;
  transition: background 0.2s;
}
.btn-prize-add:hover { background: #40a9ff; }
.btn-prize-add:disabled { background: #bfbfbf; cursor: not-allowed; }
.btn-prize-clear {
  height: 34px; padding: 0 12px;
  background: #fff; color: #595959;
  border: 1px solid #d9d9d9; border-radius: 4px;
  font-size: 13px; cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}
.btn-prize-clear:hover { border-color: #ff4d4f; color: #ff4d4f; }

/* 已添加奖品列表 */
.prize-added-list {
  display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;
}
.prize-tag {
  display: flex; align-items: center; gap: 5px;
  background: #fff0e6; border: 1px solid #ffbb96;
  border-radius: 20px; padding: 4px 10px;
  font-size: 12px; color: #d4380d;
}
.prize-tag-remove {
  cursor: pointer; font-size: 13px;
  color: #d4380d; line-height: 1;
  margin-left: 2px;
}
.prize-tag-remove:hover { color: #ff4d4f; }

/* 弹窗底部 */
.modal-footer {
  padding: 12px 20px;
  border-top: 1px solid #e8e8e8;
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
}
.btn-submit {
  height: 36px; padding: 0 24px;
  background: #1890ff; color: #fff;
  border: none; border-radius: 4px;
  font-size: 14px; font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-submit:hover { background: #40a9ff; }
```

- [ ] **Step 2: 浏览器刷新，确认无 CSS 解析错误**

---

## Task 6：弹窗 HTML 结构

**Files:**
- Modify: `bigPlayer/admin/community/BadgeManage.html`（在 `#admin-main` 之后，第一个 `<script>` 之前插入）

- [ ] **Step 1: 在 `</body>` 前插入弹窗 HTML（紧接在 `#admin-main` 闭合标签后）**

```html
<!-- 新增/编辑徽章弹窗 -->
<div class="modal-overlay" id="badge-modal">
  <div class="modal-box">
    <div class="modal-header">
      <span class="modal-title" id="modal-title">新增徽章</span>
      <button class="modal-close" id="modal-close-btn">×</button>
    </div>
    <div class="modal-lang-bar">
      <div class="modal-lang-tab">中文</div>
    </div>
    <div class="modal-body">
      <!-- 所属版块 -->
      <div class="form-row">
        <div class="form-label"><span class="form-required">*</span> 所属版块：</div>
        <div class="form-control"><span class="module-pill">超能世界</span></div>
      </div>
      <!-- 徽章名称 -->
      <div class="form-row">
        <div class="form-label"><span class="form-required">*</span> 徽章名称：</div>
        <div class="form-control">
          <input type="text" class="form-input" id="f-name" placeholder="请输入徽章名称">
        </div>
      </div>
      <!-- 描述 -->
      <div class="form-row">
        <div class="form-label"><span class="form-required">*</span> 描述：</div>
        <div class="form-control">
          <input type="text" class="form-input" id="f-desc" placeholder="请输入徽章描述">
        </div>
      </div>
      <!-- 级别 -->
      <div class="form-row">
        <div class="form-label"><span class="form-required">*</span> 级别：</div>
        <div class="form-control">
          <select class="form-select" id="f-level">
            <option value="">请选择</option>
            <option value="normal">普通</option>
            <option value="rare">珍贵</option>
            <option value="uncommon">稀有</option>
            <option value="epic">史诗</option>
            <option value="legend">传奇</option>
          </select>
        </div>
      </div>
      <!-- 图标 -->
      <div class="form-row">
        <div class="form-label"><span class="form-required">*</span> 图标：</div>
        <div class="form-control">
          <div class="upload-box">
            <span>＋</span>
          </div>
          <div class="upload-hint">尺寸建议64×64，png/jpg格式，内存2M以内</div>
        </div>
      </div>
      <!-- 分类 -->
      <div class="form-row">
        <div class="form-label"><span class="form-required">*</span> 分类：</div>
        <div class="form-control">
          <select class="form-select" id="f-category">
            <option value="">请选择徽章分类</option>
            <option value="活跃成就">活跃成就</option>
            <option value="社交影响">社交影响</option>
            <option value="互动传播">互动传播</option>
          </select>
        </div>
      </div>
      <!-- 获得条件 -->
      <div class="form-row">
        <div class="form-label"><span class="form-required">*</span> 获得条件：</div>
        <div class="form-control">
          <div class="condition-row">
            <select class="form-select" id="f-cond-type">
              <option value="连续登录">连续登录</option>
              <option value="累计点赞">累计点赞</option>
              <option value="累计评论">累计评论</option>
              <option value="累计发帖">累计发帖</option>
              <option value="累计收藏">累计收藏</option>
            </select>
            <input type="number" class="form-input" id="f-cond-val" placeholder="数值" min="1">
            <span class="condition-unit" id="cond-unit">天</span>
          </div>
        </div>
      </div>
      <!-- 排序 -->
      <div class="form-row">
        <div class="form-label"><span class="form-required">*</span> 排序：</div>
        <div class="form-control">
          <input type="number" class="form-input" id="f-sort" min="1">
        </div>
      </div>
      <!-- 奖品选择 -->
      <div class="form-row">
        <div class="form-label">奖品选择：</div>
        <div class="form-control">
          <div class="prize-row">
            <select class="form-select prize-select" id="prize-type">
              <option value="道具">游戏道具</option>
              <option value="头像框">头像框</option>
            </select>
            <input type="text" class="form-input prize-item-input" id="prize-item-name" placeholder="请输入物品名称（ID）">
            <input type="number" class="form-input prize-qty-input" id="prize-qty" placeholder="最大输入：999999" min="1" max="999999">
            <button class="btn-prize-add" id="btn-prize-add">添加</button>
            <button class="btn-prize-clear" id="btn-prize-clear">清空</button>
          </div>
          <div class="prize-added-list" id="prize-added-list"></div>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-submit" id="btn-modal-submit">提交</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: 浏览器刷新，此时弹窗处于 `display:none`（不可见），页面不应有任何布局变化**

---

## Task 7：弹窗交互 JS

**Files:**
- Modify: `bigPlayer/admin/community/BadgeManage.html`（已有 `<script>` 块末尾追加）

- [ ] **Step 1: 在已有 JS 末尾追加弹窗交互逻辑**

```js
// ── 弹窗开关 ──
const modal = document.getElementById('badge-modal');

function openModal(title) {
  document.getElementById('modal-title').textContent = title;
  modal.classList.add('open');
}
function closeModal() {
  modal.classList.remove('open');
  // 重置奖品列表
  addedPrizes = [];
  renderPrizeList();
  // 重置输入框
  document.getElementById('prize-item-name').value = '';
  document.getElementById('prize-qty').value = '';
}

document.getElementById('btn-open-add').addEventListener('click', () => openModal('新增徽章'));
document.getElementById('modal-close-btn').addEventListener('click', closeModal);
document.getElementById('btn-modal-submit').addEventListener('click', closeModal);

// 点遮罩关闭
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

function openEditModal(idx) {
  openModal('编辑徽章');
  const b = MOCK_BADGES[idx];
  document.getElementById('f-name').value = b.name;
  document.getElementById('f-desc').value = b.desc;
  document.getElementById('f-level').value = b.level;
  document.getElementById('f-category').value = b.category;
  document.getElementById('f-sort').value = b.sort;
}

// ── 获得条件单位切换 ──
document.getElementById('f-cond-type').addEventListener('change', function() {
  const unitMap = { '连续登录': '天', '累计点赞': '次', '累计评论': '次', '累计发帖': '次', '累计收藏': '次' };
  document.getElementById('cond-unit').textContent = unitMap[this.value] || '次';
});

// ── 奖品选择交互 ──
let addedPrizes = [];
const MAX_PRIZES = 5;

const prizeTypeSelect = document.getElementById('prize-type');
const prizeQtyInput   = document.getElementById('prize-qty');

prizeTypeSelect.addEventListener('change', function() {
  // 头像框不需要数量
  prizeQtyInput.style.display = this.value === '头像框' ? 'none' : '';
});

function renderPrizeList() {
  const list = document.getElementById('prize-added-list');
  const addBtn = document.getElementById('btn-prize-add');
  list.innerHTML = addedPrizes.map((p, i) => `
    <div class="prize-tag">
      ${p.type === '头像框' ? '🖼️' : '🎁'}
      ${p.name}${p.qty ? '×' + p.qty : ''}
      <span class="prize-tag-remove" onclick="removePrize(${i})">×</span>
    </div>
  `).join('');
  addBtn.disabled = addedPrizes.length >= MAX_PRIZES;
}

function removePrize(idx) {
  addedPrizes.splice(idx, 1);
  renderPrizeList();
}

document.getElementById('btn-prize-add').addEventListener('click', () => {
  const type = prizeTypeSelect.value;
  const name = document.getElementById('prize-item-name').value.trim();
  const qty  = document.getElementById('prize-qty').value.trim();

  if (!name) { alert('请输入物品名称'); return; }
  if (type === '道具' && !qty) { alert('请输入数量'); return; }
  if (addedPrizes.length >= MAX_PRIZES) { alert('最多添加5个奖品'); return; }

  addedPrizes.push({ type, name, qty: type === '头像框' ? '' : qty });
  document.getElementById('prize-item-name').value = '';
  document.getElementById('prize-qty').value = '';
  renderPrizeList();
});

document.getElementById('btn-prize-clear').addEventListener('click', () => {
  document.getElementById('prize-item-name').value = '';
  document.getElementById('prize-qty').value = '';
});
```

- [ ] **Step 2: 浏览器验证全部交互**

  1. 点"新增"→ 弹窗打开，标题"新增徽章"
  2. 点表格"编辑"→ 弹窗打开，标题"编辑徽章"，名称/描述/级别/分类/排序回填
  3. 点 × 或点遮罩 → 弹窗关闭
  4. 选"游戏道具"：名称输入框 + 数量输入框 + 添加 → 出现橙色奖品 tag，tag 右侧 × 可移除
  5. 选"头像框"：数量输入框自动隐藏，添加后 tag 无数量
  6. 添加满5个时，添加按钮禁用
  7. 点"清空"→ 当前输入行清空（已添加列表不清除）
  8. 获得条件切换"连续登录"→ 单位显示"天"，切换"累计点赞"→ 单位显示"次"

- [ ] **Step 3: Commit**

```bash
git add bigPlayer/admin/community/BadgeManage.html
git commit -m "feat: add badge manage modal with prize selection interaction"
```

---

## Task 8：变更文档

**Files:**
- Create: `.claude/docs/2026-04/2026-04-07/v309_changelog.md`

- [ ] **Step 1: 创建目录并写入变更文档**

```bash
mkdir -p ".claude/docs/2026-04/2026-04-07"
```

```markdown
# v3.0.9 变更文档

**日期：** 2026-04-07  
**版本：** v3.0.9

## 新增

### 后台管理 — 徽章管理页面

- 新增 `bigPlayer/admin/community/BadgeManage.html`
- 功能包含：
  - 徽章列表（筛选栏：版块/状态/名称/分类；表格含排序/级别/图标/描述/分类/条件/领取人数/状态/操作）
  - 新增/编辑徽章弹窗（遮罩覆盖，含所属版块、名称、描述、级别、图标上传、分类、获得条件、排序、奖品选择）
  - 奖品选择支持"游戏道具"（道具名+数量）和"头像框"（仅名称，无数量），最多5个
- 更新 `bigPlayer/shared/sidebar-data.js`：后台管理 → 社区功能 → 徽章管理子目录（徽章管理 + 徽章分类管理）
```

- [ ] **Step 2: Commit**

```bash
git add ".claude/docs/2026-04/2026-04-07/v309_changelog.md"
git commit -m "docs: add v3.0.9 changelog for badge manage admin page"
```

---

## 自检清单

- [x] sidebar-data.js 社区功能条目已覆盖
- [x] 筛选栏所有下拉选项与截图一致
- [x] 5种级别标签颜色均已定义
- [x] 奖品选择：游戏道具/头像框两种类型逻辑独立
- [x] 头像框隐藏数量输入框
- [x] 最多5个奖品约束
- [x] 清空按钮清空输入行（非已添加列表）
- [x] × 移除已添加奖品
- [x] 编辑弹窗回填数据
- [x] 变更文档路径符合 CLAUDE.md 规范（`.claude/docs/yyyy-MM/yyyy-MM-dd/`）
