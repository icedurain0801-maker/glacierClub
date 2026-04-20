# Badge Tailwind 迁移 + 侧边栏导航修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复侧边栏点击 s5/s6 无反应的问题，并将 Badge.html 的所有自定义 CSS 替换为 Tailwind CSS CDN utility class。

**Architecture:** 任务 A 通过 URL hash 机制让侧边栏精确导航到指定 screen；任务 B 删除 Badge.html 内全部 `<style>` 内容，引入 Tailwind CDN，用 utility class 重写所有元素样式，`showScreen()` 改为操作 `hidden` class；`sidebar.css` 等共用文件不变。

**Tech Stack:** 纯 HTML/CSS/JS，Tailwind CSS CDN（`https://cdn.tailwindcss.com`），无构建工具。

---

### Task 1：sidebar-data.js — 为 s5/s6 item 添加 screen 字段

**Files:**
- Modify: `bigPlayer/shared/sidebar-data.js`

- [ ] **Step 1：修改 sidebar-data.js**

将 `徽章获得通知` 和 `角色信息确认` 两个 item 加上 `screen` 字段，`徽章墙` 不变：

```js
// 原来
{ type: 'item', label: '徽章墙', version: 'v3.0.9', href: 'client/profile/personalization/Badge.html' },
{ type: 'item', label: '徽章获得通知', version: 'v3.0.9', href: 'client/profile/personalization/Badge.html' },
{ type: 'item', label: '角色信息确认', version: 'v3.0.9', href: 'client/profile/personalization/Badge.html' }

// 改为
{ type: 'item', label: '徽章墙', version: 'v3.0.9', href: 'client/profile/personalization/Badge.html' },
{ type: 'item', label: '徽章获得通知', version: 'v3.0.9', href: 'client/profile/personalization/Badge.html', screen: 's5' },
{ type: 'item', label: '角色信息确认', version: 'v3.0.9', href: 'client/profile/personalization/Badge.html', screen: 's6' }
```

- [ ] **Step 2：手动验证**

打开 `bigPlayer/shared/sidebar-data.js`，确认：
- `徽章墙` item 无 `screen` 字段
- `徽章获得通知` item 有 `screen: 's5'`
- `角色信息确认` item 有 `screen: 's6'`

- [ ] **Step 3：Commit**

```bash
git add bigPlayer/shared/sidebar-data.js
git commit -m "fix: add screen field to 徽章获得通知 and 角色信息确认 sidebar items"
```

---

### Task 2：sidebar.js — 渲染 `<a>` 时追加 hash

**Files:**
- Modify: `bigPlayer/shared/sidebar.js`

- [ ] **Step 1：修改 sidebar.js 中 item 的 href 赋值行**

找到以下行（约第 77 行）：

```js
a.href = root + '/' + node.href;
```

改为：

```js
a.href = root + '/' + node.href + (node.screen ? '#' + node.screen : '');
```

- [ ] **Step 2：手动验证**

用浏览器打开 `bigPlayer/changelog.html`（或任意已挂载侧边栏的页面），打开开发者工具，检查 `徽章获得通知` 的 `<a>` 元素，确认 `href` 以 `#s5` 结尾，`徽章墙` 的 href 不带 hash。

- [ ] **Step 3：Commit**

```bash
git add bigPlayer/shared/sidebar.js
git commit -m "fix: append screen hash to sidebar item href when screen field exists"
```

---

### Task 3：Badge.html — 添加 hash 启动跳转 + 引入 Tailwind CDN

**Files:**
- Modify: `bigPlayer/client/profile/personalization/Badge.html`

这是后续 Tailwind 重写的准备步骤，单独提交以隔离风险。

- [ ] **Step 1：在 `<head>` 中 sidebar.css 引入之后添加 Tailwind CDN**

```html
<link rel="stylesheet" href="../../../shared/sidebar.css">
<script src="https://cdn.tailwindcss.com"></script>
```

- [ ] **Step 2：在页面底部 `initSidebar` 调用之后添加 hash 跳转逻辑**

```html
<script>
  initSidebar({
    root: '../../..',
    currentHref: 'client/profile/personalization/Badge.html'
  });
</script>
<script>
  const _hash = location.hash.slice(1);
  if (_hash && document.getElementById(_hash)) showScreen(_hash);
</script>
```

- [ ] **Step 3：验证侧边栏导航 s5/s6**

用本地 HTTP 服务器（`python -m http.server 8080`，在 `bigPlayer/` 目录）访问页面，点击侧边栏「徽章获得通知」，确认页面跳转到 s5；点击「角色信息确认」，确认跳转到 s6。

- [ ] **Step 4：Commit**

```bash
git add bigPlayer/client/profile/personalization/Badge.html
git commit -m "fix: add hash-based screen navigation on page load; add Tailwind CDN"
```

---

### Task 4：Badge.html — 删除 `<style>` 块，迁移全局布局 class

**Files:**
- Modify: `bigPlayer/client/profile/personalization/Badge.html`

- [ ] **Step 1：删除 `<style>` 标签内全部内容，保留 `#s4::before` 最小片段**

将 `<style>...</style>` 整块替换为：

```html
<style>
/* s4 光晕伪元素 — Tailwind 不支持伪元素 clip-path */
#s4::before {
  content: '';
  position: absolute; top: 0; left: 50%; transform: translateX(-50%);
  width: 200px; height: 300px;
  background: linear-gradient(180deg, rgba(80,180,255,0.15) 0%, transparent 100%);
  clip-path: polygon(40% 0%, 60% 0%, 100% 100%, 0% 100%);
  pointer-events: none;
}
</style>
```

- [ ] **Step 2：更新 `<body>` 和 `.page-wrapper`**

```html
<!-- 原 -->
<body>
<div class="page-wrapper">

<!-- 改为 -->
<body class="bg-[#f0f4f8] min-h-screen flex justify-center font-sans">
<div class="flex w-fit min-h-screen">
```

- [ ] **Step 3：更新 `.phone-shell`**

```html
<!-- 原 -->
<div class="phone-shell">

<!-- 改为 -->
<div class="flex-shrink-0 w-[375px] h-[667px] overflow-hidden sticky top-0 self-start bg-white shadow-[2px_0_16px_rgba(0,0,0,0.10)] my-5 ml-6 rounded-lg">
```

- [ ] **Step 4：更新 `.doc-panel`**

```html
<!-- 原 -->
<div class="doc-panel">

<!-- 改为 -->
<div class="flex-1 min-w-[300px] max-w-[480px] bg-white border-l border-[#e8ecf0] px-6 py-7 overflow-y-auto h-screen sticky top-0 ml-6">
```

- [ ] **Step 5：验证布局**

在浏览器中打开页面，确认三列布局正常（侧边栏 | 手机壳 375×667 | 文档区），整体水平居中。

- [ ] **Step 6：Commit**

```bash
git add bigPlayer/client/profile/personalization/Badge.html
git commit -m "refactor: replace global layout styles with Tailwind classes"
```

---

### Task 5：Badge.html — 更新 `showScreen()` 使用 `hidden` class

**Files:**
- Modify: `bigPlayer/client/profile/personalization/Badge.html`

- [ ] **Step 1：将所有 `.screen` div 的 `class="screen active"` / `class="screen"` 改为 Tailwind**

初始状态：s1 可见，s2~s6 隐藏：

```html
<!-- s1 (active, 可见) -->
<div class="flex flex-col h-[667px] overflow-hidden bg-[#f0f6fb]" id="s1">

<!-- s2~s6 (隐藏) -->
<div class="hidden flex-col h-[667px] overflow-hidden bg-[#f0f6fb]" id="s2">
<div class="hidden flex-col h-[667px] overflow-hidden bg-[#f0f6fb]" id="s3">
<div class="hidden flex-col h-[667px] overflow-hidden relative bg-[radial-gradient(ellipse_120%_60%_at_50%_30%,#1a4060_0%,#0d2535_40%,#060e18_100%)]" id="s4">
<div class="hidden flex-col h-[667px] overflow-hidden relative bg-[#f0f6fb]" id="s5">
<div class="hidden flex-col h-[667px] overflow-hidden bg-[#f5f8fc]" id="s6">
```

- [ ] **Step 2：将所有 `.doc-panel-inner` div 改为 Tailwind**

```html
<!-- doc-s1 (active, 可见) -->
<div id="doc-s1">

<!-- doc-s2~doc-s6 (隐藏) -->
<div class="hidden" id="doc-s2">
<div class="hidden" id="doc-s3">
<div class="hidden" id="doc-s4">
<div class="hidden" id="doc-s5">
<div class="hidden" id="doc-s6">
```

- [ ] **Step 3：更新 `showScreen()` 函数**

```js
function showScreen(id) {
  document.querySelectorAll('[id^="s"]:not([id^="sec"])').forEach(s => {
    if (['s1','s2','s3','s4','s5','s6'].includes(s.id)) s.classList.add('hidden');
  });
  document.getElementById(id).classList.remove('hidden');
  ['doc-s1','doc-s2','doc-s3','doc-s4','doc-s5','doc-s6'].forEach(did => {
    const el = document.getElementById(did);
    if (el) el.classList.add('hidden');
  });
  const doc = document.getElementById('doc-' + id);
  if (doc) doc.classList.remove('hidden');
  document.querySelector('.doc-panel, [class*="sticky"][class*="overflow-y-auto"]').scrollTop = 0;
}
```

> 注意：`doc-panel` class 已被 Tailwind 替换，`showScreen` 中需要改用新的选择器定位文档区。为避免脆弱选择器，给文档区 div 保留一个 `id="doc-panel"`：

在文档区 div 加 id：
```html
<div id="doc-panel" class="flex-1 min-w-[300px] ...">
```

然后 `showScreen` 中：
```js
document.getElementById('doc-panel').scrollTop = 0;
```

- [ ] **Step 4：验证所有页面切换**

依次点击所有交互按钮，确认：
- 徽章墙 → 我的徽章（s2）→ 返回 s1 ✓
- 徽章墙 → 设置展示（s3）→ 返回 s1 ✓
- 任意徽章 → 详情（s4）→ 返回来源页 ✓
- 侧边栏点击「徽章获得通知」→ s5 ✓
- 侧边栏点击「角色信息确认」→ s6 ✓
- s5 弹窗 × → s1 ✓
- s5 查看详情 → s6 ✓
- s6 返回 → s5 ✓

- [ ] **Step 5：Commit**

```bash
git add bigPlayer/client/profile/personalization/Badge.html
git commit -m "refactor: migrate screen visibility to Tailwind hidden class; update showScreen()"
```

---

### Task 6：Badge.html — 迁移 s1 徽章墙页面样式

**Files:**
- Modify: `bigPlayer/client/profile/personalization/Badge.html`（仅 s1 HTML 部分）

- [ ] **Step 1：迁移顶部渐变导航区 `.s1-header`**

```html
<!-- 原 <div class="s1-header"> -->
<div class="bg-[linear-gradient(180deg,#3ab4e8_0%,#5ec8f0_40%,#c8e8f8_80%,#eaf4fb_100%)] pb-3 flex-shrink-0">
```

- [ ] **Step 2：迁移 `.top-nav`、`.btn-back`、`.top-nav-tabs`、`.top-nav-tab`**

```html
<!-- .top-nav -->
<div class="flex items-center pt-11 px-4">

<!-- .btn-back -->
<div class="text-white text-[22px] leading-none cursor-pointer w-7 flex-shrink-0">‹</div>

<!-- .top-nav-tabs -->
<div class="flex-1 flex justify-center gap-7">

<!-- .top-nav-tab (inactive) -->
<div class="text-white/75 text-[15px] py-1.5 cursor-pointer relative" data-...>头像框</div>

<!-- .top-nav-tab.active -->
<div class="text-white font-semibold text-[15px] py-1.5 cursor-pointer relative after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-white after:rounded-sm">徽章墙</div>
```

- [ ] **Step 3：迁移 `.user-row`、`.user-avatar`、`.user-name`、`.badge-count-btn`**

```html
<!-- .user-row -->
<div class="flex items-center pt-2.5 px-4 gap-2.5">

<!-- .user-avatar -->
<div class="w-11 h-11 rounded-full border-2 border-white/80 bg-[#ffd580] flex items-center justify-content-center text-[22px] overflow-hidden flex-shrink-0">🧒</div>

<!-- .user-name -->
<div class="text-white text-[15px] font-semibold">玩家139736218</div>

<!-- .badge-count-btn -->
<div class="ml-auto text-white/95 text-xs flex items-center gap-0.5 cursor-pointer whitespace-nowrap" id="goto-my-badges">
```

- [ ] **Step 4：迁移 `.display-card`**

```html
<!-- .display-card -->
<div class="mx-3 mt-2.5 bg-white rounded-xl px-3.5 py-3">

<!-- .display-card-hd -->
<div class="text-[13px] text-[#333] font-medium flex items-center gap-1.5 mb-3">

<!-- .edit-btn -->
<span class="text-[#3ab4e8] cursor-pointer text-[13px]" id="goto-set-display">...</span>

<!-- .hex-row -->
<div class="flex gap-4">

<!-- .hex-slot -->
<div class="flex flex-col items-center gap-1.5 cursor-pointer" data-goto="set">

<!-- .hexagon -->
<div class="w-[62px] h-[62px] bg-[#d6eef8] [clip-path:polygon(50%_0%,93.3%_25%,93.3%_75%,50%_100%,6.7%_75%,6.7%_25%)] flex items-center justify-center text-[#5abfe8] text-[26px] font-light transition-opacity">＋</div>

<!-- .hex-label -->
<div class="text-[11px] text-[#999]">添加徽章</div>
```

- [ ] **Step 5：迁移 `.cat-bar`、`.cat-btn`**

```html
<!-- .cat-bar -->
<div class="bg-white flex items-center px-3 py-[7px] gap-1.5 border-b border-[#f0f0f0]">

<!-- .cat-btn (inactive) -->
<div class="text-[13px] text-[#666] px-3 py-1 rounded-[14px] cursor-pointer transition-all" data-section="sec-active">活跃成就</div>

<!-- .cat-btn.active -->
<div class="text-[13px] text-white bg-[#3ab4e8] font-medium px-3 py-1 rounded-[14px] cursor-pointer transition-all" data-section="sec-active">活跃成就</div>
```

- [ ] **Step 6：迁移 `.badge-body`、`.section-hd`、`.badge-grid`、`.badge-cell`**

```html
<!-- .badge-body -->
<div class="flex-1 overflow-y-auto bg-white px-3.5 pb-4 min-h-0" id="badge-scroll">

<!-- .section-hd -->
<div class="flex items-center gap-2 pt-3.5 pb-2.5 text-sm font-semibold text-[#222]">
  <span class="w-[3px] h-[15px] bg-[#3ab4e8] rounded-sm flex-shrink-0"></span>
  活跃成就 <span class="text-[#3ab4e8] font-bold">1</span>/30
</div>

<!-- .badge-grid -->
<div class="grid grid-cols-3 gap-y-1 pb-2">

<!-- .badge-cell -->
<div class="flex flex-col items-center gap-1.5 p-2.5 cursor-pointer active:opacity-75" data-name="花式点赞" data-earned="0">

<!-- .badge-wrap -->
<div class="relative w-[72px] h-[72px] flex-shrink-0">

<!-- .pent.bg-gray -->
<div class="w-[72px] h-[72px] [clip-path:polygon(50%_0%,97%_34%,79%_97%,21%_97%,3%_34%)] flex items-center justify-center text-[30px] bg-[linear-gradient(145deg,#d4d4d4_0%,#b0b0b0_100%)]">👍</div>

<!-- .pent.bg-earned -->
<div class="w-[72px] h-[72px] [clip-path:polygon(50%_0%,97%_34%,79%_97%,21%_97%,3%_34%)] flex items-center justify-center text-[30px] bg-[linear-gradient(145deg,#c89850_0%,#7a5020_60%,#4a3010_100%)]">🚀</div>

<!-- .circ.bg-gray -->
<div class="w-[72px] h-[72px] rounded-full flex items-center justify-center text-[30px] bg-[linear-gradient(145deg,#d4d4d4_0%,#b0b0b0_100%)]">👍</div>

<!-- .upgrade-tag -->
<div class="absolute top-0 right-0 bg-[#ff9500] text-white text-[10px] px-[5px] py-0.5 rounded-lg whitespace-nowrap font-medium">可升级</div>

<!-- .gift-tag -->
<div class="absolute top-0 left-0 w-5 h-5 bg-[#ff6b35] rounded-br-lg flex items-center justify-center text-[11px] leading-none">🎁</div>

<!-- .badge-label -->
<div class="text-xs text-[#555] text-center">花式点赞</div>
```

- [ ] **Step 7：迁移 `.about-link`**

```html
<div class="text-center py-4 pt-4 text-[13px] text-[#3ab4e8] cursor-pointer">关于徽章</div>
```

- [ ] **Step 8：验证 s1 外观**

在浏览器中对比迁移前后截图，确认：渐变头部、徽章网格、分类 tab、礼包图标均正常显示。

- [ ] **Step 9：Commit**

```bash
git add bigPlayer/client/profile/personalization/Badge.html
git commit -m "refactor: migrate s1 徽章墙 styles to Tailwind"
```

---

### Task 7：Badge.html — 迁移 s2/s3 页面样式

**Files:**
- Modify: `bigPlayer/client/profile/personalization/Badge.html`（s2、s3 HTML 部分）

- [ ] **Step 1：迁移 s2 我的徽章**

```html
<!-- s2 screen div 已在 Task 5 中设置，这里迁移内部元素 -->

<!-- .simple-hd (s2) -->
<div class="bg-[linear-gradient(180deg,#3ab4e8_0%,#7dcff0_60%,#c8e8f8_100%)] pt-11 px-4 pb-3.5 flex items-center flex-shrink-0">

<!-- .simple-hd-title -->
<div class="flex-1 text-center text-white text-[17px] font-semibold mr-7">我的徽章</div>

<!-- .my-count -->
<div class="px-4 pt-4 pb-3 text-[15px] text-[#333]">
  共获得 <b class="text-[#3ab4e8]">1</b> 枚徽章
</div>

<!-- .my-grid -->
<div class="grid grid-cols-3 gap-y-1 px-3.5">
  <!-- badge-cell: 复用 Task 6 中的结构，label 颜色改为 text-[#3ab4e8] -->
```

- [ ] **Step 2：迁移 s3 设置徽章展示**

```html
<!-- .simple-hd (s3) 同 s2 -->

<!-- .set-body -->
<div class="px-3.5 py-4">

<!-- .set-section-hd -->
<div class="text-[15px] text-[#333] font-medium mb-3.5">
  展示的徽章 <b class="text-[#3ab4e8]">0</b>/3
</div>

<!-- .hex-row-lg -->
<div class="flex gap-5 mb-1.5">

<!-- .hex-lg -->
<div class="w-[72px] h-[72px] bg-[#cde9f7] [clip-path:polygon(50%_0%,93.3%_25%,93.3%_75%,50%_100%,6.7%_75%,6.7%_25%)] flex items-center justify-center text-[#5abfe8] text-[28px] font-light">＋</div>

<!-- .divider -->
<div class="h-px bg-[#e8ecf0] my-3.5"></div>

<!-- .select-hint -->
<div class="text-[13px] text-[#888] mb-3">点击下方徽章选择</div>

<!-- .sel-grid -->
<div class="grid grid-cols-3 gap-y-1">
```

- [ ] **Step 3：验证 s2/s3 外观**

切换到 s2 和 s3，确认渐变头部、徽章网格、六边形卡槽正常。

- [ ] **Step 4：Commit**

```bash
git add bigPlayer/client/profile/personalization/Badge.html
git commit -m "refactor: migrate s2/s3 styles to Tailwind"
```

---

### Task 8：Badge.html — 迁移 s4 徽章详情页样式

**Files:**
- Modify: `bigPlayer/client/profile/personalization/Badge.html`（s4 HTML 部分）

- [ ] **Step 1：迁移 s4 详情导航**

```html
<!-- .detail-nav -->
<div class="pt-11 px-4 flex items-center relative z-10">

<!-- detail-back btn-back -->
<div class="text-white/90 text-2xl cursor-pointer" id="detail-back">‹</div>
```

- [ ] **Step 2：迁移 `.detail-stage`**

```html
<!-- .detail-stage -->
<div class="flex-1 flex flex-col items-center justify-center px-6 pb-12 relative z-10 overflow-y-auto min-h-0">
```

- [ ] **Step 3：迁移徽章展示行和详情文字**

```html
<!-- .detail-badges-row -->
<div class="flex items-center justify-center gap-3 mb-7">

<!-- .d-badge-side -->
<div class="opacity-30">
  <div class="w-[60px] h-[60px] [clip-path:polygon(50%_0%,97%_34%,79%_97%,21%_97%,3%_34%)] flex items-center justify-center text-[22px] bg-[linear-gradient(145deg,#d4d4d4_0%,#b0b0b0_100%)]">⭐</div>
</div>

<!-- .d-badge-main -->
<div>
  <div class="w-24 h-24 [clip-path:polygon(50%_0%,97%_34%,79%_97%,21%_97%,3%_34%)] flex items-center justify-center text-[40px] bg-[linear-gradient(145deg,#c89850_0%,#7a5020_60%,#4a3010_100%)]" id="detail-icon">🚀</div>
</div>

<!-- .detail-date -->
<div class="text-[13px] text-white/60 mb-2.5">2026-04-03 17:58:09 获得</div>

<!-- .detail-name-row -->
<div class="flex items-center gap-2 mb-2">

<!-- .detail-badge-name -->
<div class="text-xl font-bold text-white" id="detail-name">准时上线</div>

<!-- .rarity -->
<div class="bg-[#2ec87a] text-white text-[11px] px-[7px] py-0.5 rounded-[9px]">普通</div>

<!-- .detail-desc -->
<div class="text-sm text-white/75 mb-9 text-center leading-relaxed">
  在社区内【<em class="not-italic text-white font-medium">连续登录</em>】3天
</div>
```

- [ ] **Step 4：迁移 `.reward-area`（深色版，s4 用）**

```html
<!-- .reward-area -->
<div class="w-full mb-4 bg-white/[0.08] rounded-xl px-3 py-2.5">

<!-- .reward-area-title -->
<div class="text-[11px] text-white/50 mb-2 text-center">达成可获得</div>

<!-- .reward-list -->
<div class="flex justify-center gap-2 flex-wrap">

<!-- .reward-item -->
<div class="flex flex-col items-center gap-[3px] min-w-[48px]">

<!-- .reward-icon -->
<div class="w-10 h-10 rounded-lg bg-white/[0.12] flex items-center justify-center text-xl border border-white/15">💎</div>

<!-- .reward-name -->
<div class="text-[10px] text-white/60 text-center whitespace-nowrap">灵石</div>

<!-- .reward-qty -->
<div class="text-[10px] text-white/45 text-center">×10</div>
```

- [ ] **Step 5：迁移 `.wear-btn`**

```html
<!-- .wear-btn -->
<button class="bg-[#3ab4e8] text-white border-none rounded-[25px] py-3.5 text-base font-medium w-[260px] cursor-pointer transition-opacity active:opacity-80">佩戴徽章</button>
```

- [ ] **Step 6：验证 s4 外观**

点击任意徽章进入 s4，确认深色渐变背景、光晕伪元素、徽章排列、奖励区、佩戴按钮均正常。

- [ ] **Step 7：Commit**

```bash
git add bigPlayer/client/profile/personalization/Badge.html
git commit -m "refactor: migrate s4 徽章详情 styles to Tailwind"
```

---

### Task 9：Badge.html — 迁移 s5 通知弹窗样式

**Files:**
- Modify: `bigPlayer/client/profile/personalization/Badge.html`（s5 HTML 部分）

- [ ] **Step 1：迁移 s5 背景层**

```html
<!-- s5 screen div 已在 Task 5 设置 -->

<!-- .notify-bg 背景头部 -->
<div class="flex-shrink-0">
  <div class="bg-[linear-gradient(180deg,#3ab4e8_0%,#7dcff0_60%,#c8e8f8_100%)] pt-11 px-4 pb-3.5 flex items-center">
    <div class="text-white text-[22px] leading-none cursor-pointer w-7 flex-shrink-0" data-back="s1">‹</div>
    <div class="flex-1 text-center text-white text-[17px] font-semibold mr-7">获得徽章通知弹窗</div>
  </div>
</div>
```

- [ ] **Step 2：迁移遮罩和弹窗卡片**

```html
<!-- .notify-overlay -->
<div class="absolute top-0 left-0 right-0 bottom-0 bg-black/50 flex items-center justify-center z-10">

<!-- .notify-card -->
<div class="bg-white rounded-2xl w-[300px] px-5 py-7 flex flex-col items-center relative shadow-[0_8px_32px_rgba(0,0,0,0.25)]">

<!-- .notify-close -->
<div class="absolute top-2.5 right-3 w-6 h-6 rounded-full bg-[#f0f0f0] text-[#888] flex items-center justify-center text-sm cursor-pointer font-semibold" id="notify-close">×</div>

<!-- .notify-congrats -->
<div class="text-lg font-bold text-[#ff6b35] mb-3.5">恭喜获得</div>

<!-- .notify-badge-wrap -->
<div class="mb-3.5">
  <div style="width:100px;height:100px;background:linear-gradient(145deg,#f5c842 0%,#e09800 100%);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:42px;box-shadow:0 4px 20px rgba(224,152,0,0.5);">🏅</div>
</div>

<!-- .notify-name-row -->
<div class="flex items-center gap-[7px] mb-1.5">
  <span class="text-base font-bold text-[#1a2233]">签到达人</span>
  <span class="text-[11px] px-[7px] py-0.5 rounded-[9px] font-medium bg-[#fff3e0] text-[#ff9500]">珍贵</span>
</div>

<!-- .notify-cond -->
<div class="text-xs text-[#aaa] mb-3 text-center">在平台签到1次 | 2024/04/11获得</div>
```

- [ ] **Step 3：迁移通知奖励区（亮色版）**

```html
<!-- .notify-reward-area -->
<div class="w-full bg-[#f8f9fa] rounded-xl px-2 py-2.5 mb-4">

<!-- .notify-reward-list -->
<div class="flex justify-center gap-1.5 flex-wrap">

<!-- .notify-reward-item -->
<div class="flex items-center gap-1 bg-[#fff0e6] rounded-[20px] px-2 py-1">
  <div class="text-sm">💎</div>
  <div class="text-[11px] text-[#e06200] font-medium">灵石×10</div>
</div>
```

- [ ] **Step 4：迁移查看详情按钮**

```html
<!-- .notify-detail-btn -->
<button class="w-full border border-[1.5px] border-[#ddd] bg-white rounded-[22px] py-[11px] text-sm text-[#555] cursor-pointer transition-colors hover:border-[#3ab4e8] hover:text-[#3ab4e8]" id="goto-detail-from-notify">查看详情</button>
```

- [ ] **Step 5：验证 s5**

通过侧边栏点击「徽章获得通知」进入 s5，确认遮罩、卡片、奖励 pill、按钮均正常；点击 × 回到 s1；点击「查看详情」进入 s6。

- [ ] **Step 6：Commit**

```bash
git add bigPlayer/client/profile/personalization/Badge.html
git commit -m "refactor: migrate s5 通知弹窗 styles to Tailwind"
```

---

### Task 10：Badge.html — 迁移 s6 角色信息确认页样式

**Files:**
- Modify: `bigPlayer/client/profile/personalization/Badge.html`（s6 HTML 部分）

- [ ] **Step 1：迁移 s6 头部（复用 simple-hd 结构）**

```html
<div class="bg-[linear-gradient(180deg,#3ab4e8_0%,#7dcff0_60%,#c8e8f8_100%)] pt-11 px-4 pb-3.5 flex items-center flex-shrink-0">
  <div class="text-white text-[22px] leading-none cursor-pointer w-7 flex-shrink-0" data-back="s5">‹</div>
  <div class="flex-1 text-center text-white text-[17px] font-semibold mr-7">角色信息确认</div>
</div>
```

- [ ] **Step 2：迁移表单区域**

```html
<!-- .role-body -->
<div class="flex-1 px-4 py-5">

<!-- .role-form -->
<div class="bg-white rounded-xl px-4 py-5">

<!-- .role-field -->
<div class="mb-3.5">

<!-- .role-label -->
<div class="text-[13px] text-[#333] font-medium mb-2 flex items-center gap-1">
  接受角色 <span class="text-[#ff4d4f] text-[13px]">*</span>
</div>

<!-- .role-select -->
<div class="flex items-center justify-between border border-[#e0e6ed] rounded-lg px-3 py-2.5 text-[13px] text-[#333] cursor-pointer bg-[#fafbfc]">
  <span>武帝无敌（斗罗一区）</span>
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 5L7 9L11 5" stroke="#999" stroke-width="1.5" stroke-linecap="round"/></svg>
</div>

<!-- .role-hint -->
<div class="text-xs text-[#aaa] text-center my-3.5">请仔细确认角色信息，确定后自动到账</div>

<!-- .role-confirm-btn -->
<button class="w-full bg-[#3ab4e8] text-white border-none rounded-lg py-3.5 text-[15px] font-semibold cursor-pointer tracking-[4px] transition-opacity active:opacity-85">确 定</button>
```

- [ ] **Step 3：验证 s6**

进入 s6，确认表单卡片、下拉框、确定按钮样式正常；点击返回回到 s5。

- [ ] **Step 4：Commit**

```bash
git add bigPlayer/client/profile/personalization/Badge.html
git commit -m "refactor: migrate s6 角色信息确认 styles to Tailwind"
```

---

### Task 11：Badge.html — 迁移文档面板样式

**Files:**
- Modify: `bigPlayer/client/profile/personalization/Badge.html`（doc-panel HTML 部分）

- [ ] **Step 1：迁移页面标题行**

```html
<!-- .doc-page-title -->
<div class="text-base font-bold text-[#1a2233] mb-1">徽章墙</div>

<!-- .doc-page-sub -->
<div class="text-xs text-[#aaa] mb-4">个性装扮 · 页面 1/6</div>
```

- [ ] **Step 2：迁移版本块结构**

```html
<!-- .doc-version-block (open) -->
<div class="border border-[#e8ecf0] rounded-xl mb-2.5 overflow-hidden is-open" id="vblock-...">

<!-- .doc-version-hd.is-latest -->
<div class="flex items-center gap-2 px-3.5 py-2.5 cursor-pointer bg-[#eaf6fd] select-none transition-colors hover:bg-[#d9f0fb] doc-version-hd">
  <span class="text-[13px] font-bold text-[#1a2233]">v3.0.9</span>
  <span class="text-[11px] text-[#aaa] ml-1">2026-04-07</span>
  <span class="text-[10px] font-semibold text-white bg-[#3ab4e8] rounded-lg px-[7px] py-[1px] ml-1">最新</span>
  <span class="ml-auto text-xs text-[#bbb] transition-transform doc-version-arrow">▼</span>
</div>

<!-- .doc-version-hd (closed) -->
<div class="flex items-center gap-2 px-3.5 py-2.5 cursor-pointer bg-white select-none transition-colors hover:bg-[#f5fbfe] doc-version-hd">
  <span class="text-[13px] font-bold text-[#1a2233]">v1.0.0</span>
  <span class="text-[11px] text-[#aaa] ml-1">2026-04-07</span>
  <span class="ml-auto text-xs text-[#bbb] transition-transform doc-version-arrow">▼</span>
</div>

<!-- .doc-version-body (open block 内显示) -->
<div class="px-3.5 pt-3 pb-4 border-t border-[#e8ecf0] bg-[#fafcfe] doc-version-body">

<!-- .doc-section -->
<div class="mb-4 last:mb-0">

<!-- .doc-section-title -->
<div class="text-xs font-semibold text-[#3ab4e8] mb-1.5 flex items-center gap-[5px]">
  <span class="w-[3px] h-3 bg-[#3ab4e8] rounded-sm flex-shrink-0"></span>
  本次变更
</div>

<!-- p, ul, li -->
<p class="text-xs text-[#555] leading-[1.8]">...</p>
<ul class="pl-[15px]"><li class="text-xs text-[#555] leading-[1.9]">...</li></ul>

<!-- .doc-note -->
<div class="bg-[#f0f2f5] border-l-[3px] border-[#d0d4da] px-2.5 py-[7px] rounded-r-md text-[11px] text-[#888] leading-[1.7] mt-1.5">待填写</div>

<!-- .doc-tag -->
<span class="inline-block bg-[#eaf6fd] text-[#3ab4e8] text-[10px] px-1.5 py-[1px] rounded-lg mx-[2px] my-[2px] font-medium">标签</span>
```

- [ ] **Step 3：更新版本块折叠 JS**

版本块的折叠逻辑依赖 `.open` class 控制 `doc-version-body` 显示。迁移后改为直接操作 `hidden` class：

```js
// 原
document.querySelectorAll('.doc-version-hd').forEach(hd => {
  hd.addEventListener('click', () => {
    hd.closest('.doc-version-block').classList.toggle('open');
  });
});

// 改为
document.querySelectorAll('.doc-version-hd').forEach(hd => {
  hd.addEventListener('click', () => {
    const body = hd.nextElementSibling; // .doc-version-body
    const arrow = hd.querySelector('.doc-version-arrow');
    body.classList.toggle('hidden');
    arrow.style.transform = body.classList.contains('hidden') ? '' : 'rotate(180deg)';
  });
});
```

初始状态：最新版本的 `doc-version-body` 无 `hidden`，旧版本有 `hidden`。

- [ ] **Step 4：验证文档面板**

切换各个 screen，确认对应文档面板正常显示；点击版本头可折叠/展开；最新版本默认展开，箭头朝下旋转正确。

- [ ] **Step 5：响应式隐藏文档区**

在文档区 div 上添加 `max-[768px]:hidden`：

```html
<div id="doc-panel" class="flex-1 min-w-[300px] max-w-[480px] ... max-[768px]:hidden">
```

- [ ] **Step 6：Commit**

```bash
git add bigPlayer/client/profile/personalization/Badge.html
git commit -m "refactor: migrate doc-panel styles to Tailwind; update version block toggle JS"
```

---

### Task 12：最终验收

**Files:**
- Read: `bigPlayer/client/profile/personalization/Badge.html`

- [ ] **Step 1：确认 `<style>` 块中只剩 `#s4::before`**

打开文件，确认 `<style>` 标签内除 `#s4::before` 外无其他规则。

- [ ] **Step 2：全流程功能测试**

| 操作 | 预期 |
|---|---|
| 侧边栏「徽章墙」 | 打开页面显示 s1 |
| 侧边栏「徽章获得通知」 | 直接显示 s5 弹窗 |
| 侧边栏「角色信息确认」 | 直接显示 s6 表单 |
| 「共获得1个徽章」→ | s2 |
| 「设置徽章展示」→ | s3 |
| 任意徽章点击→ | s4 |
| s4 返回 | 回来源页 |
| s5 × | s1 |
| s5「查看详情」| s6 |
| s6 返回 | s5 |
| 分类 Tab 点击 | 滚动定位 |
| 版本块点击 | 折叠/展开 |

- [ ] **Step 3：检查 changelog.html 侧边栏不受影响**

打开 `bigPlayer/changelog.html`，确认侧边栏正常渲染，「徽章获得通知」的 href 包含 `#s5`。

- [ ] **Step 4：Final Commit**

```bash
git add bigPlayer/
git commit -m "refactor: complete Tailwind migration for Badge.html; fix sidebar s5/s6 navigation"
```
