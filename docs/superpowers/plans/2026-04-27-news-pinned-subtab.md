# 官方资讯子 Tab + 置顶帖模块 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 news_post.html 的「官方资讯」内容区顶部，新增子 tab 栏（All/Announcements/Events/Media + 排序）和方案 B 置顶帖推荐模块（灰底 + 白色悬浮卡）。

**Architecture:** 纯 HTML/CSS 改动，无新 JS 逻辑。子 tab 为静态 UI（无切换功能）。排序按钮从原有独立 Filter/Sort 行迁移到子 tab 栏右侧。

**Tech Stack:** HTML, Tailwind CSS (CDN), 原生 CSS

---

## File Map

| 文件 | 操作 |
|------|------|
| `bigPlayer/client/news/news_post.html` | 修改：删除现有 Filter/Sort div（第 152-158 行），在同位置插入子 tab 栏 + 置顶帖模块 |

---

### Task 1: 删除现有 Filter/Sort 行

**Files:**
- Modify: `bigPlayer/client/news/news_post.html:152-158`

- [ ] **Step 1: 定位并删除 Filter/Sort div**

找到 `<section id="tab-official">` 内的如下代码块，整体删除：

```html
<!-- Filter/Sort -->
<div class="flex justify-end items-center mb-3 text-sm text-gray-500">
<button class="flex items-center space-x-1">
<svg class="w-4 h-4" fill="none" stroke="currentColor" viewbox="0 0 24 24"><path d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
<span>最新</span>
</button>
</div>
```

删除后，`<section id="tab-official">` 内直接是 `<!-- Feed List -->` 的内容。

- [ ] **Step 2: 浏览器验证删除无误**

用浏览器打开 `bigPlayer/client/news/news_post.html`，切到「官方资讯」tab，确认排序按钮消失，文章列表正常显示。

---

### Task 2: 插入子 Tab 栏

**Files:**
- Modify: `bigPlayer/client/news/news_post.html`

- [ ] **Step 1: 在 `<section id="tab-official">` 开标签之后，`<!-- Feed List -->` 之前，插入子 tab 栏**

将以下代码插入 `<section id="tab-official" class="tab-panel ...">` 的内部最顶部（原 Filter/Sort div 被删除的位置）：

```html
<!-- Sub Tab Bar -->
<div class="flex items-center bg-white border-b border-gray-100 -mx-4 px-4 mb-3 overflow-x-auto hide-scrollbar flex-shrink-0" style="margin-top:-12px;">
  <button class="subtab-btn text-[12px] text-gray-900 font-semibold py-2 px-2.5 whitespace-nowrap border-b-2 border-gray-900 mr-0.5">All</button>
  <button class="subtab-btn text-[12px] text-gray-400 py-2 px-2.5 whitespace-nowrap border-b-2 border-transparent mr-0.5">Announcements</button>
  <button class="subtab-btn text-[12px] text-gray-400 py-2 px-2.5 whitespace-nowrap border-b-2 border-transparent mr-0.5">Events</button>
  <button class="subtab-btn text-[12px] text-gray-400 py-2 px-2.5 whitespace-nowrap border-b-2 border-transparent">Media</button>
  <div class="ml-auto pl-3 flex items-center gap-1 text-[11px] text-gray-400 whitespace-nowrap flex-shrink-0 py-2">
    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
    <span>最新</span>
  </div>
</div>
```

- [ ] **Step 2: 浏览器验证子 tab 栏**

打开页面，「官方资讯」tab 下应出现：
- `All` 加粗、黑色底线（激活态）
- `Announcements` / `Events` / `Media` 灰色、无底线
- 右侧有 ↑↓ 最新
- 不出现横向滚动条（文字不溢出）

---

### Task 3: 插入置顶帖推荐模块（方案 B）

**Files:**
- Modify: `bigPlayer/client/news/news_post.html`

- [ ] **Step 1: 在子 tab 栏之后、`<!-- Feed List -->` 之前，插入置顶帖模块**

```html
<!-- Pinned Posts (方案B: 灰底 + 白色悬浮卡) -->
<div class="bg-gray-50 rounded-xl -mx-4 px-3 py-2.5 mb-4 space-y-2">
  <!-- Pinned Card 1 -->
  <div class="bg-white rounded-xl px-3 py-2.5 flex items-center gap-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
    <span class="text-[10px] font-bold tracking-[0.05em] px-1.5 py-[1px] rounded-[3px] bg-amber-50 text-amber-600 border border-amber-200 flex-shrink-0">PIN</span>
    <span class="text-[13px] text-gray-800 flex-1 min-w-0 truncate">安塔茶话会 | 超能道具大作战第6期</span>
    <svg class="w-3.5 h-3.5 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </div>
  <!-- Pinned Card 2 -->
  <div class="bg-white rounded-xl px-3 py-2.5 flex items-center gap-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
    <span class="text-[10px] font-bold tracking-[0.05em] px-1.5 py-[1px] rounded-[3px] bg-amber-50 text-amber-600 border border-amber-200 flex-shrink-0">PIN</span>
    <span class="text-[13px] text-gray-800 flex-1 min-w-0 truncate">超能情报站 | 五一活动即将开启</span>
    <svg class="w-3.5 h-3.5 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </div>
  <!-- Pinned Card 3 -->
  <div class="bg-white rounded-xl px-3 py-2.5 flex items-center gap-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
    <span class="text-[10px] font-bold tracking-[0.05em] px-1.5 py-[1px] rounded-[3px] bg-amber-50 text-amber-600 border border-amber-200 flex-shrink-0">PIN</span>
    <span class="text-[13px] text-gray-800 flex-1 min-w-0 truncate">狩魂者—蛮古 | 技能详情公开</span>
    <svg class="w-3.5 h-3.5 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </div>
</div>
```

- [ ] **Step 2: 浏览器验证置顶帖模块**

「官方资讯」tab 下应出现：
- 灰色背景区块（`bg-gray-50`）
- 3 张白色卡片，各带 amber 色 PIN 标签 + 标题 + 右箭头
- 卡片有轻微阴影感
- 置顶模块下方紧接现有文章列表

- [ ] **Step 3: 确认整体布局正常（无内容遮挡、无滚动异常）**

滚动官方资讯内容区，确认：
- 子 tab 栏不随内容滚动（它在 section 内部，正常流）
- 置顶模块 + 文章列表正常垂直排列
- 切换到「攻略大全」「趣味栏目」tab 不受影响

---

### Task 4: 写变更文档 + 提交

**Files:**
- Create: `.claude/docs/2026-04/2026-04-27/v001_changelog.md`

- [ ] **Step 1: 创建变更文档**

```markdown
feat(news): 官方资讯新增子 tab 栏（All/Announcements/Events/Media）和方案B置顶帖推荐模块
```

- [ ] **Step 2: Git 提交**

```bash
git add bigPlayer/client/news/news_post.html .claude/docs/2026-04/2026-04-27/v001_changelog.md
git commit -m "feat(news): add subtab bar and pinned posts module (Plan B) to 官方资讯"
```

---

## Self-Review

**Spec coverage 检查：**
- ✅ 子 tab 栏（All/Announcements/Events/Media）→ Task 2
- ✅ 排序按钮迁移到子 tab 栏右侧 → Task 2
- ✅ 删除原 Filter/Sort div → Task 1
- ✅ 置顶帖方案 B（灰底 + 白卡 + PIN + 标题 + 箭头）→ Task 3
- ✅ 3 条 mock 数据 → Task 3
- ✅ 其他 tab 不受影响 → Task 3 Step 3

**Placeholder 扫描：** 无 TBD/TODO，所有步骤含完整代码。

**一致性检查：** 类名 `hide-scrollbar` 在原文件 `<style>` 已定义，可直接复用。`shadow-[0_1px_3px_rgba(0,0,0,0.06)]` 为 Tailwind JIT 任意值，CDN 版支持。
