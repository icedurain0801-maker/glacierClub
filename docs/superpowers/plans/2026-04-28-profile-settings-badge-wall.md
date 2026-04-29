# 个人中心：设置按钮 + 徽章胶囊 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在个人中心 hero 区右上角加设置按钮，用户名下方加徽章胶囊入口（有徽章/零徽章两种状态）。

**Architecture:** 纯 HTML/CSS 改动，无框架，直接修改 `profile.html`。徽章数据从页面内 `<script>` 里的 mock 数组读取，JS 函数根据数组长度决定渲染哪种胶囊。

**Tech Stack:** HTML, Tailwind CSS (CDN), Material Symbols Outlined (已引入), 原生 JS

---

## 文件结构

| 文件 | 操作 | 说明 |
|------|------|------|
| `bigPlayer/client/profile/profile.html` | 修改 | 唯一改动文件：hero 区加设置按钮 + 徽章胶囊，`<style>` 加相应 CSS，`<script>` 加 `renderBadgeCapsule()` 函数 |

---

### Task 1：加设置按钮

**Files:**
- Modify: `bigPlayer/client/profile/profile.html`（hero `<div>` 内，状态栏之后）

- [ ] **Step 1：在 hero 渐变区内，状态栏 `<div>` 之后，紧接插入设置按钮**

找到文件第 98 行的状态栏 `<div>`：
```html
<!-- Status Bar -->
<div class="flex justify-between items-center px-6 pt-2 text-xs font-semibold text-white relative z-10">
```
在状态栏 `</div>` 之后（约第 111 行）插入：
```html
<!-- Settings button -->
<button
  onclick="alert('设置页（待实现）')"
  class="absolute z-10 flex items-center justify-center rounded-full border border-white/30"
  style="top:21px;right:10px;width:28px;height:28px;background:rgba(255,255,255,0.22);backdrop-filter:blur(8px)"
  aria-label="设置">
  <span class="material-symbols-outlined text-white" style="font-size:16px;font-variation-settings:'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 20">settings</span>
</button>
```

- [ ] **Step 2：在浏览器打开文件，检查右上角是否出现白色半透明圆形设置按钮**

打开：`bigPlayer/client/profile/profile.html`（或通过本地服务器）  
移动端模式 375px，预期：hero 右上角出现圆形 ⚙ 按钮，点击弹出 alert。

- [ ] **Step 3：Commit**

```bash
git add bigPlayer/client/profile/profile.html
git commit -m "feat(profile): add settings button to hero top-right"
```

---

### Task 2：在 hero-center 加徽章胶囊占位 HTML 结构

**Files:**
- Modify: `bigPlayer/client/profile/profile.html`（头像+用户名所在的 `hero-center` div）

当前 hero-center 结构（约第 114 行）：
```html
<div class="absolute bottom-7 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
  <!-- Avatar -->
  <div class="relative"> ... </div>
  <!-- Username -->
  <div class="text-white font-bold text-base flex items-center gap-1.5">
    dbpei0008
    <span ...>edit</span>
  </div>
</div>
```

- [ ] **Step 1：在用户名 `</div>` 之后、外层 `</div>` 之前插入徽章胶囊占位 div**

```html
<!-- Badge capsule (rendered by JS) -->
<div id="badge-capsule"></div>
```

完整修改后的 hero-center：
```html
<div class="absolute bottom-7 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
  <!-- Avatar -->
  <div class="relative">
    <div class="w-[72px] h-[72px] rounded-full border-[3px] border-white/90 overflow-hidden" style="box-shadow:0 4px 16px rgba(0,0,0,0.15)">
      <div class="w-full h-full avatar-silhouette"></div>
    </div>
    <!-- Paw badge -->
    <div class="absolute -bottom-0.5 -right-0.5 w-[22px] h-[22px] bg-[#4ec9f0] rounded-full border-2 border-white flex items-center justify-center text-[11px] leading-none">🐾</div>
  </div>
  <!-- Username -->
  <div class="text-white font-bold text-base flex items-center gap-1.5">
    dbpei0008
    <span class="material-symbols-outlined text-base opacity-80" style="font-variation-settings:'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 20">edit</span>
  </div>
  <!-- Badge capsule (rendered by JS) -->
  <div id="badge-capsule"></div>
</div>
```

- [ ] **Step 2：刷新浏览器，确认页面结构无变化（占位 div 为空，不影响布局）**

---

### Task 3：加 `renderBadgeCapsule()` JS 函数 + mock 数据

**Files:**
- Modify: `bigPlayer/client/profile/profile.html`（`<script>` 块，Tab switching 函数之前）

- [ ] **Step 1：在现有 `<script>` 块顶部，Tab switching 代码之前，插入 mock 数据和渲染函数**

```html
<script>
// ── Badge mock data ──────────────────────────────────────────
// 每枚徽章：{ emoji, bg, name }
// 空数组 = 零徽章状态；有数据 = 有徽章状态
const userBadges = [
  { emoji: '🏆', bg: '#ffe5b4', name: '创作者' },
  { emoji: '🎖', bg: '#e0f7fa', name: '活跃' },
  { emoji: '🌟', bg: '#fce4ec', name: '明星' },
  { emoji: '🎗', bg: '#e8f5e9', name: '荣誉' },
  { emoji: '🎯', bg: '#ede7f6', name: '精准' },
];

function renderBadgeCapsule() {
  const el = document.getElementById('badge-capsule');
  if (!el) return;

  if (userBadges.length === 0) {
    // ── 零徽章：空状态胶囊 ──
    el.innerHTML = `
      <div onclick="alert('徽章解锁引导页（待实现）')"
           style="display:flex;align-items:center;gap:4px;
                  background:rgba(255,255,255,0.16);backdrop-filter:blur(10px);
                  border:1px solid rgba(255,255,255,0.25);border-radius:20px;
                  padding:4px 10px 4px 8px;cursor:pointer;color:rgba(255,255,255,0.85);
                  font-size:11px;white-space:nowrap">
        <span style="font-size:12px">🔒</span>
        <span>还没有徽章，去解锁</span>
        <span style="opacity:0.7;margin-left:1px">›</span>
      </div>`;
  } else {
    // ── 有徽章：胶囊展示最多4枚 ──
    const visible = userBadges.slice(0, 4);
    const extra = userBadges.length - visible.length;
    const icons = visible.map(b =>
      `<div style="width:18px;height:18px;border-radius:50%;
                   background:${b.bg};border:1.5px solid rgba(255,255,255,0.8);
                   display:flex;align-items:center;justify-content:center;
                   font-size:10px">${b.emoji}</div>`
    ).join('');
    const moreTag = extra > 0
      ? `<span style="font-size:10px;color:rgba(255,255,255,0.9);font-weight:700;margin-left:3px">+${extra} ›</span>`
      : `<span style="font-size:10px;color:rgba(255,255,255,0.9);font-weight:700;margin-left:3px">›</span>`;

    el.innerHTML = `
      <div onclick="alert('徽章墙弹层（待实现）')"
           style="display:flex;align-items:center;gap:2px;
                  background:rgba(255,255,255,0.20);backdrop-filter:blur(10px);
                  border:1px solid rgba(255,255,255,0.3);border-radius:20px;
                  padding:4px 8px 4px 5px;cursor:pointer">
        <div style="display:flex;gap:1px">${icons}</div>
        ${moreTag}
      </div>`;
  }
}

renderBadgeCapsule();
// ── End Badge ────────────────────────────────────────────────
</script>
```

- [ ] **Step 2：刷新浏览器，验证有徽章状态**

预期：用户名下方出现白色半透明胶囊，显示4枚彩色圆形徽章图标 + `+1 ›`，点击弹 alert。

- [ ] **Step 3：将 `userBadges` 改为空数组，刷新验证零徽章状态**

```js
const userBadges = [];
```
预期：胶囊变为「🔒 还没有徽章，去解锁 ›」，透明度略低。

- [ ] **Step 4：改回有数据状态**

```js
const userBadges = [
  { emoji: '🏆', bg: '#ffe5b4', name: '创作者' },
  { emoji: '🎖', bg: '#e0f7fa', name: '活跃' },
  { emoji: '🌟', bg: '#fce4ec', name: '明星' },
  { emoji: '🎗', bg: '#e8f5e9', name: '荣誉' },
  { emoji: '🎯', bg: '#ede7f6', name: '精准' },
];
```

- [ ] **Step 5：Commit**

```bash
git add bigPlayer/client/profile/profile.html
git commit -m "feat(profile): add badge capsule with empty/filled states"
```

---

### Task 4：写变更文档

**Files:**
- Create: `.claude/docs/2026-04/2026-04-28/v001_changelog.md`

- [ ] **Step 1：创建变更文档**

```bash
mkdir -p ".claude/docs/2026-04/2026-04-28"
```

内容：
```markdown
feat(profile): 个人中心新增设置按钮和徽章胶囊入口
```

- [ ] **Step 2：Commit**

```bash
git add ".claude/docs/2026-04/2026-04-28/v001_changelog.md"
git commit -m "docs: add changelog for profile settings+badge capsule"
```
