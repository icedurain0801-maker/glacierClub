# 搜索结果页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新建 `bigPlayer/client/home/search-results.html`，实现搜索结果页，包含综合 / 创作 / 用户三个 Tab，6 种内容模板，以及 Tab 可交互切换。

**Architecture:** 单文件 HTML 原型，延续现有页面风格（Tailwind CDN + 原生 JS）。顶部复用 `search.html` 的蓝色渐变顶栏，Tab 切换机制复用 `home.html` 的 `data-tab` 模式，卡片样式与 `home.html` 的 `.wf-card` 投影卡保持视觉一致。同时更新 `search.html` 使搜索提交后跳转到结果页，并在 `sidebar-data.js` 注册新页面入口。

**Tech Stack:** HTML / CSS（Tailwind CDN）/ 原生 JS / Google Fonts（Inter + Manrope + Material Symbols）

---

## 文件清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `bigPlayer/client/home/search-results.html` | 搜索结果页主文件 |
| 修改 | `bigPlayer/client/home/search.html` | 搜索框提交后跳转到结果页 |
| 修改 | `bigPlayer/shared/sidebar-data.js` | 注册新页面到侧边导航 |

---

## Task 1：搭建页面骨架（顶栏 + Tab 栏）

**Files:**
- Create: `bigPlayer/client/home/search-results.html`

- [ ] **Step 1：创建文件，写入页面骨架**

  复制 `search.html` 开头的 `<head>` 部分（包含 Tailwind CDN、Google Fonts、sidebar.css 引用、tailwind.config、基础 CSS），然后修改为以下结构：

  ```html
  <!DOCTYPE html>
  <html lang="zh-CN">
  <head>
  <meta charset="utf-8"/>
  <meta content="width=device-width, initial-scale=1.0" name="viewport"/>
  <link rel="stylesheet" href="../../shared/sidebar.css">
  <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@700;800&family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
  <script>
  tailwind.config = {
    darkMode: "class",
    theme: {
      extend: {
        colors: {
          "on-surface-variant": "#566166",
          "primary": "#0061a4",
          "primary-dim": "#005590",
          "surface-container-low": "#f0f4f7",
          "surface-variant": "#d9e4ea",
          "outline": "#717c82",
          "on-primary-container": "#00548f",
          "surface-container": "#e8eff3",
          "on-background": "#2a3439",
          "on-surface": "#2a3439",
          "background": "#f7f9fb",
          "surface": "#f7f9fb",
          "outline-variant": "#a9b4b9",
          "surface-container-high": "#e1e9ee",
          "surface-container-highest": "#d9e4ea",
        },
        fontFamily: { headline: ["Manrope"], body: ["Inter"], label: ["Inter"] }
      }
    }
  }
  </script>
  <style>
    .material-symbols-outlined {
      font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
      font-size: 22px; line-height: 1; user-select: none;
    }
    body { min-height: 100dvh; }
    .phone-shell { width: 375px; flex-shrink: 0; }
    .phone-inner {
      width: 375px; height: 667px;
      display: flex; flex-direction: column;
      overflow: hidden; position: relative;
    }
    @media (max-width: 430px) {
      body { background: #f7f9fb; align-items: flex-start; }
      .phone-shell { width: 100vw; margin: 0 !important; border-radius: 0 !important; box-shadow: none !important; position: static !important; }
      .phone-inner { width: 100vw; height: 100dvh; min-height: unset; }
    }
    .no-scrollbar::-webkit-scrollbar { display: none; }
    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

    /* ── 蓝色渐变顶区（复用 search.html）── */
    .search-top {
      background: linear-gradient(175deg, #003d7a 0%, #0061a4 55%, #1a7fc4 100%);
      padding: 20px 16px 28px;
      flex-shrink: 0;
    }
    .back-row {
      display: flex; align-items: center; gap: 6px;
      color: rgba(255,255,255,0.75);
      font-size: 14px; font-weight: 500;
      margin-bottom: 18px; cursor: pointer;
    }
    .back-row .material-symbols-outlined { font-size: 20px; color: rgba(255,255,255,0.75); }
    .input-glass {
      display: flex; align-items: center; gap: 10px;
      background: rgba(255,255,255,0.16);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255,255,255,0.28);
      border-radius: 14px;
      padding: 10px 14px;
    }
    .input-glass .material-symbols-outlined { color: rgba(255,255,255,0.65); font-size: 20px; }
    .input-glass input {
      flex: 1; background: transparent; border: none; outline: none;
      font-size: 14px; font-family: Inter, sans-serif; color: #ffffff;
    }
    .input-glass input::placeholder { color: rgba(255,255,255,0.45); }

    /* ── Tab 栏 ── */
    .results-body {
      background: #f7f9fb;
      border-radius: 22px 22px 0 0;
      margin-top: -16px;
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .tab-bar {
      display: flex;
      border-bottom: 1px solid #e1e9ee;
      background: #fff;
      border-radius: 22px 22px 0 0;
      flex-shrink: 0;
    }
    .tab-item {
      flex: 1; text-align: center;
      font-size: 13px; font-weight: 500;
      color: #566166;
      padding: 13px 0;
      border-bottom: 2px solid transparent;
      cursor: pointer;
      transition: color 0.15s;
    }
    .tab-item.active {
      font-weight: 700;
      color: #1f2937;
      border-bottom: 2px solid #0061a4;
    }
    .tab-panel { display: none; flex: 1; overflow-y: auto; }
    .tab-panel.active { display: block; }
    .tab-panel::-webkit-scrollbar { display: none; }

    /* ── 结果卡片 ── */
    .result-card {
      background: #fff;
      border-radius: 10px;
      padding: 12px 14px;
      margin: 0 12px 10px;
      box-shadow: 0 2px 8px rgba(0,97,164,0.07);
    }
    .card-user-row {
      display: flex; align-items: center; gap: 8px;
      margin-bottom: 8px;
    }
    .card-avatar {
      width: 32px; height: 32px; border-radius: 50%;
      object-fit: cover; flex-shrink: 0;
      background: linear-gradient(135deg, #93c5fd, #3b82f6);
    }
    .card-avatar.official { background: linear-gradient(135deg, #bae6fd, #0284c7); }
    .card-user-info { flex: 1; min-width: 0; }
    .card-username {
      font-size: 13px; font-weight: 600; color: #1f2937;
      display: flex; align-items: center; gap: 4px;
    }
    .official-tag {
      font-size: 10px; font-weight: 700;
      background: #0061a4; color: #fff;
      padding: 1px 5px; border-radius: 4px;
    }
    .card-meta { font-size: 11px; color: #a9b4b9; }
    .follow-btn {
      font-size: 11px; color: #0061a4;
      border: 1px solid #0061a4;
      border-radius: 999px; padding: 3px 12px;
      white-space: nowrap; cursor: pointer;
      flex-shrink: 0;
    }
    .card-text {
      font-size: 13px; color: #374151;
      line-height: 1.5; margin-bottom: 8px;
      display: -webkit-box;
      -webkit-line-clamp: 3; -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .card-image {
      width: 100%; border-radius: 8px;
      margin-bottom: 8px; display: block;
      background: linear-gradient(135deg, #0061a4, #0891b2);
      height: 160px; object-fit: cover;
    }
    .card-stats {
      display: flex; gap: 12px;
      font-size: 11px; color: #a9b4b9;
    }

    /* ── section 标题 ── */
    .section-title {
      font-size: 12px; font-weight: 700;
      color: #0061a4;
      padding: 14px 14px 8px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .section-count { font-size: 11px; font-weight: 400; color: #a9b4b9; }

    /* ── 用户列表行 ── */
    .user-row {
      display: flex; align-items: center; gap: 10px;
      padding: 12px 14px;
      border-bottom: 1px solid #f0f4f7;
    }
    .user-row:last-child { border-bottom: none; }
    .user-avatar {
      width: 44px; height: 44px; border-radius: 50%;
      background: linear-gradient(135deg, #93c5fd, #3b82f6);
      flex-shrink: 0;
    }
    .user-info { flex: 1; min-width: 0; }
    .user-name { font-size: 14px; font-weight: 600; color: #1f2937; }
    .user-sub { font-size: 11px; color: #a9b4b9; margin-top: 2px; }

    /* ── 空状态 ── */
    .empty-state {
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      padding: 48px 24px 24px;
      text-align: center;
    }
    .empty-icon {
      font-size: 48px; margin-bottom: 12px; opacity: .45;
    }
    .empty-title { font-size: 15px; font-weight: 600; color: #566166; margin-bottom: 6px; }
    .empty-sub { font-size: 13px; color: #a9b4b9; }

    /* ── 热词胶囊 ── */
    .hot-chips { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 14px; }
    .hot-chip {
      background: #e8f0fb; color: #0061a4;
      font-size: 12px; border-radius: 999px;
      padding: 5px 12px; cursor: pointer;
    }
  </style>
  </head>
  <body class="bg-[#f0f4f8] font-body text-on-surface flex justify-center items-start">
  <nav id="sidebar" class="sidebar hidden"></nav>

  <div class="phone-shell my-5 rounded-lg shadow-[2px_0_16px_rgba(0,0,0,0.10)] overflow-hidden bg-surface sticky top-5 self-start">
  <div class="phone-inner">

    <!-- 顶部蓝色区 -->
    <div class="search-top">
      <div class="back-row" onclick="history.back()">
        <span class="material-symbols-outlined">arrow_back</span>
        <span>返回</span>
      </div>
      <div class="input-glass">
        <span class="material-symbols-outlined">search</span>
        <input type="search" id="search-input" placeholder="请输入帖子内容/标题"/>
      </div>
    </div>

    <!-- 结果区 -->
    <div class="results-body">

      <!-- Tab 栏 -->
      <div class="tab-bar">
        <div class="tab-item active" data-tab="all" onclick="switchTab('all')">综合</div>
        <div class="tab-item" data-tab="posts" onclick="switchTab('posts')">创作</div>
        <div class="tab-item" data-tab="users" onclick="switchTab('users')">用户</div>
      </div>

      <!-- 综合面板 -->
      <div class="tab-panel active" id="panel-all">
        <!-- 内容由 JS 渲染 -->
      </div>

      <!-- 创作面板 -->
      <div class="tab-panel" id="panel-posts">
        <!-- 内容由 JS 渲染 -->
      </div>

      <!-- 用户面板 -->
      <div class="tab-panel" id="panel-users">
        <!-- 内容由 JS 渲染 -->
      </div>

    </div>

  </div>
  </div>

  <script src="../../shared/sidebar-data.js"></script>
  <script src="../../shared/bottom-nav.js"></script>
  </body>
  </html>
  ```

- [ ] **Step 2：在浏览器打开确认骨架渲染正确**

  用 Live Server 或 `python -m http.server 8080` 打开 `bigPlayer/client/home/search-results.html`。

  预期：蓝色顶栏显示、白色底区浮起、三个 Tab 标签可见、综合 Tab 默认激活（粗体 + 蓝色下划线）。

- [ ] **Step 3：提交骨架**

  ```bash
  git add bigPlayer/client/home/search-results.html
  git commit -m "feat(search): add search results page skeleton"
  ```

---

## Task 2：Tab 切换 JS + 综合面板内容

**Files:**
- Modify: `bigPlayer/client/home/search-results.html`（在 `</body>` 前的 `<script>` 块追加）

- [ ] **Step 1：在文件末尾 `</body>` 之前插入 JS**

  找到文件底部 `<script src="../../shared/bottom-nav.js"></script>` 之后、`</body>` 之前，添加：

  ```html
  <script>
  // ── Tab 切换 ──
  function switchTab(tab) {
    document.querySelectorAll('.tab-item').forEach(el => {
      el.classList.toggle('active', el.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-panel').forEach(el => {
      el.classList.toggle('active', el.id === 'panel-' + tab);
    });
  }

  // ── URL 参数读取 ──
  const params = new URLSearchParams(location.search);
  const query = params.get('q') || '';
  document.getElementById('search-input').value = query;

  // ── mock 数据 ──
  const MOCK_POSTS = [
    {
      id: 1, official: true,
      username: '茂加', level: 'lv14', time: '1年前',
      text: '【茂加社区升级计划3.0】亲爱的旅行者们，今天完成升级计划了吗？',
      hasImage: true, imageBg: 'linear-gradient(135deg,#f97316,#dc2626)',
      imageLabel: '炽焰圣凤',
      likes: 1703, comments: 218
    },
    {
      id: 2, official: false,
      username: '浩瀚星河', level: 'lv9', time: '1年前',
      text: '社区升级了，比以前好看了',
      hasImage: false,
      likes: 1, comments: 2
    },
    {
      id: 3, official: false,
      username: '星河入梦、', level: 'lv7', time: '2年前',
      text: '升级后发现很多新功能，特别是搜索变快了好多，点赞！',
      hasImage: false,
      likes: 34, comments: 9
    },
    {
      id: 4, official: true,
      username: '茂加', level: 'lv14', time: '2年前',
      text: '【茂加社区升级计划2.0】今天完成了吗？',
      hasImage: true, imageBg: 'linear-gradient(135deg,#0061a4,#0891b2)',
      imageLabel: '升级公告',
      likes: 4201, comments: 512
    },
    {
      id: 5, official: false,
      username: '夜行者', level: 'lv11', time: '1年前',
      text: '社区升级后排版真的好看，收藏了！',
      hasImage: true, imageBg: 'linear-gradient(135deg,#7c3aed,#db2777)',
      imageLabel: '新版截图',
      likes: 89, comments: 14
    },
    {
      id: 6, official: false,
      username: '风影追月', level: 'lv5', time: '3年前',
      text: '界面清爽了好多，继续加油！',
      hasImage: false,
      likes: 12, comments: 3
    }
  ];

  const MOCK_USERS = [
    { username: '潇潇星河', level: 'lv8', followers: 56, avatarBg: 'linear-gradient(135deg,#fda4af,#f43f5e)' },
    { username: '星河', level: 'lv5', followers: 12, avatarBg: 'linear-gradient(135deg,#93c5fd,#3b82f6)' },
    { username: '星河飞扬', level: 'lv12', followers: 203, avatarBg: 'linear-gradient(135deg,#fdba74,#f97316)' },
    { username: '星河入梦、', level: 'lv7', followers: 44, avatarBg: 'linear-gradient(135deg,#6ee7b7,#059669)' },
    { username: '星河暗恋记', level: 'lv3', followers: 8, avatarBg: 'linear-gradient(135deg,#c4b5fd,#7c3aed)' },
    { username: '星河以北', level: 'lv6', followers: 31, avatarBg: 'linear-gradient(135deg,#fde68a,#d97706)' },
    { username: '星河暖阳', level: 'lv9', followers: 77, avatarBg: 'linear-gradient(135deg,#a5f3fc,#0891b2)' }
  ];

  const HOT_KEYWORDS = ['星灵', '狩魂者', 'S5赛季', '公会招募', '新手攻略', '炽焰圣凤', '超能联赛', '装备强化'];

  // ── 生成卡片 HTML ──
  function postCardHTML(post) {
    const avatarClass = post.official ? 'card-avatar official' : 'card-avatar';
    const officialTag = post.official ? '<span class="official-tag">官方</span>' : '';
    const imageHTML = post.hasImage
      ? `<div class="card-image" style="background:${post.imageBg};display:flex;align-items:center;justify-content:center;">
           <span style="color:rgba(255,255,255,0.9);font-size:14px;font-weight:700;">${post.imageLabel}</span>
         </div>`
      : '';
    return `
      <div class="result-card">
        <div class="card-user-row">
          <div class="${avatarClass}"></div>
          <div class="card-user-info">
            <div class="card-username">${post.username}${officialTag}</div>
            <div class="card-meta">${post.level} · ${post.time} · 在超能世界发布了动态</div>
          </div>
          <div class="follow-btn">+关注</div>
        </div>
        <div class="card-text">${post.text}</div>
        ${imageHTML}
        <div class="card-stats">
          <span>👍 ${post.likes}</span>
          <span>💬 ${post.comments}</span>
        </div>
      </div>`;
  }

  // ── 渲染综合面板 ──
  function renderAll() {
    const official = MOCK_POSTS.filter(p => p.official);
    const community = MOCK_POSTS.filter(p => !p.official);
    let html = '';
    if (official.length) {
      html += `<div class="section-title">官方相关</div>`;
      html += official.map(postCardHTML).join('');
    }
    if (community.length) {
      html += `<div class="section-title">相关创作</div>`;
      html += community.map(postCardHTML).join('');
    }
    document.getElementById('panel-all').innerHTML = html || emptyStateHTML();
  }

  // ── 渲染创作面板 ──
  function renderPosts() {
    const html = `<div class="section-title">全部创作 <span class="section-count">共 ${MOCK_POSTS.length} 条</span></div>`
      + MOCK_POSTS.map(postCardHTML).join('');
    document.getElementById('panel-posts').innerHTML = html;
  }

  // ── 渲染用户面板 ──
  function renderUsers() {
    const rows = MOCK_USERS.map(u => `
      <div class="user-row">
        <div class="user-avatar" style="background:${u.avatarBg};"></div>
        <div class="user-info">
          <div class="user-name">${u.username}</div>
          <div class="user-sub">${u.level} · ${u.followers} 关注者</div>
        </div>
        <div class="follow-btn">+关注</div>
      </div>`).join('');
    document.getElementById('panel-users').innerHTML = rows || emptyStateHTML();
  }

  // ── 空状态 ──
  function emptyStateHTML() {
    const chips = HOT_KEYWORDS.map(k => `<span class="hot-chip">${k}</span>`).join('');
    return `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">没有找到相关内容</div>
        <div class="empty-sub">换个关键词试试？</div>
      </div>
      <div class="section-title">大家都在搜</div>
      <div class="hot-chips">${chips}</div>`;
  }

  // ── 初始化渲染 ──
  renderAll();
  renderPosts();
  renderUsers();
  </script>
  ```

- [ ] **Step 2：浏览器验证 Tab 切换**

  在浏览器中依次点击"综合""创作""用户"三个 Tab，确认：
  - 每次切换后激活 Tab 变粗体 + 蓝色下划线
  - 对应内容面板显示，其余隐藏
  - 综合面板：官方相关 section + 相关创作 section 均显示
  - 创作面板：显示条目数"共 6 条"
  - 用户面板：头像列表显示 7 条用户行

- [ ] **Step 3：验证 URL 参数回填**

  在地址栏追加 `?q=社区升级`，刷新页面，确认搜索框内显示"社区升级"。

- [ ] **Step 4：提交**

  ```bash
  git add bigPlayer/client/home/search-results.html
  git commit -m "feat(search): add tab switching and mock data rendering"
  ```

---

## Task 3：空状态展示（无结果模板）

**Files:**
- Modify: `bigPlayer/client/home/search-results.html`

- [ ] **Step 1：在 JS 中加入无结果判断逻辑**

  找到 `renderAll()` 函数，在函数最开始加一行判断。若 `query` 长度为 0 或不在已知关键词中触发空状态（demo 用关键词 `xyzabc` 触发）：

  在 `renderAll` 函数内，将：
  ```js
  let html = '';
  if (official.length) {
  ```
  改为：
  ```js
  // demo：关键词含 'empty' 时强制展示空状态
  if (query.toLowerCase().includes('empty')) {
    document.getElementById('panel-all').innerHTML = emptyStateHTML();
    document.getElementById('panel-posts').innerHTML = emptyStateHTML();
    document.getElementById('panel-users').innerHTML = emptyStateHTML();
    return;
  }
  let html = '';
  if (official.length) {
  ```

  同时将 `renderPosts()` 和 `renderUsers()` 的调用位置不变（`emptyStateHTML` 已被 `renderAll` 提前 return 时覆盖所有面板）。

- [ ] **Step 2：浏览器验证空状态**

  打开 `search-results.html?q=empty`，确认三个 Tab 均显示：
  - 🔍 图标居中
  - "没有找到相关内容 / 换个关键词试试？"
  - "大家都在搜"热词胶囊（8 个）

- [ ] **Step 3：提交**

  ```bash
  git add bigPlayer/client/home/search-results.html
  git commit -m "feat(search): add empty state with hot keyword chips"
  ```

---

## Task 4：更新 search.html — 提交后跳转结果页

**Files:**
- Modify: `bigPlayer/client/home/search.html`

- [ ] **Step 1：给搜索框和热榜词绑定跳转逻辑**

  在 `search.html` 的 `<input type="search"` 标签，添加 `id="main-search"` 和 `onkeydown` 事件：

  找到：
  ```html
  <input type="search" placeholder="请输入帖子内容/标题" autofocus/>
  ```
  改为：
  ```html
  <input type="search" id="main-search" placeholder="请输入帖子内容/标题" autofocus
         onkeydown="if(event.key==='Enter'&&this.value.trim())location.href='search-results.html?q='+encodeURIComponent(this.value.trim())"/>
  ```

- [ ] **Step 2：给热榜词绑定跳转**

  在 `search.html` 末尾 `</body>` 前添加：
  ```html
  <script>
  document.querySelectorAll('.hot-item').forEach(el => {
    el.addEventListener('click', () => {
      const title = el.querySelector('.hot-title').textContent.replace(/热|新/g,'').trim();
      location.href = 'search-results.html?q=' + encodeURIComponent(title);
    });
  });
  document.querySelectorAll('.history-chip').forEach(el => {
    el.addEventListener('click', () => {
      const text = el.textContent.trim();
      location.href = 'search-results.html?q=' + encodeURIComponent(text);
    });
  });
  </script>
  ```

- [ ] **Step 3：浏览器验证跳转**

  打开 `search.html`，在搜索框输入"社区升级"后按 Enter，确认跳转到 `search-results.html?q=社区升级` 且搜索框回填正确。

  点击热榜第 1 条"星灵"，确认跳转到 `search-results.html?q=星灵`。

- [ ] **Step 4：提交**

  ```bash
  git add bigPlayer/client/home/search.html
  git commit -m "feat(search): link search bar and hot topics to results page"
  ```

---

## Task 5：注册到侧边导航 + 创建变更文档

**Files:**
- Modify: `bigPlayer/shared/sidebar-data.js`
- Create: `.claude/docs/2026-04/2026-04-28/v001_changelog.md`

- [ ] **Step 1：在 sidebar-data.js 的首页目录下注册新页面**

  找到：
  ```js
  {
    type: 'dir',
    label: '首页',
    children: [
      {
        type: 'item',
        label: '首页',
        href: 'client-new/home_src.html'
      }
    ]
  },
  ```
  在 `children` 数组末尾追加：
  ```js
  {
    type: 'item',
    label: '搜索结果页',
    version: 'v1.0.0',
    href: 'client/home/search-results.html'
  }
  ```

- [ ] **Step 2：创建变更文档目录并写入 changelog**

  ```bash
  mkdir -p ".claude/docs/2026-04/2026-04-28"
  ```

  创建 `.claude/docs/2026-04/2026-04-28/v001_changelog.md`，内容：

  ```markdown
  # v001 搜索结果页

  新增 `bigPlayer/client/home/search-results.html`，实现搜索结果页，包含综合 / 创作 / 用户三 Tab，6 种内容模板（官方置顶、图文混排、纯文字、创作列表、用户列表、空状态），并更新 `search.html` 使搜索提交后跳转到结果页。
  ```

- [ ] **Step 3：提交**

  ```bash
  git add bigPlayer/shared/sidebar-data.js .claude/docs/2026-04/2026-04-28/v001_changelog.md
  git commit -m "feat(search): register search results page in sidebar and add changelog"
  ```

---

## 自检结果

| 规格项 | 覆盖 Task |
|--------|-----------|
| 蓝色渐变顶栏 + 玻璃态搜索框 | Task 1 |
| Tab 栏（综合/创作/用户）可切换 | Task 2 |
| T1 纯文字帖卡片 | Task 2（MOCK_POSTS id:2,3,6） |
| T2 含图帖（官方标签+图片） | Task 2（MOCK_POSTS id:1,4,5） |
| T3 创作 Tab + 条目数 | Task 2 renderPosts |
| T4 用户 Tab + 关注者数 | Task 2 renderUsers |
| T5 官方置顶 + 社区分区 | Task 2 renderAll |
| T6 空状态 + 热词胶囊 | Task 3 |
| search.html 跳转 + 回填 | Task 4 |
| sidebar 注册 | Task 5 |
| 变更文档 | Task 5 |
