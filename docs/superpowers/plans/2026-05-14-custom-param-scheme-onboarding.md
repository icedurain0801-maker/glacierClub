# 自定义参数方案流程引导 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在自定义参数方案列表页顶部加引导横幅、在新建方案表单参数为空时加引导卡片，帮助新用户理解「先建参数 → 再建方案」的两步流程，老用户可永久隐藏。

**Architecture:** 纯前端改动，不涉及后端。改动 1 在 `specialScheme.html` 内容区顶部注入一个可折叠横幅，用 localStorage 记录永久隐藏状态。改动 2 在 `configCreate.html` 的自定义参数方案卡片区域检测是否有已选参数，若无则显示引导卡片替代「暂无数据」空状态。

**Tech Stack:** 原生 HTML / CSS / JavaScript，localStorage API，无外部依赖

---

## 文件映射

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `SDK/admin/schemeManagement/specialScheme.html` | 修改 | 加顶部引导横幅 + JS 逻辑 |
| `SDK/admin/config/configCreate.html` | 修改 | 参数为空时显示引导卡片 |

---

## Task 1：specialScheme.html — 引导横幅 HTML 结构

**Files:**
- Modify: `SDK/admin/schemeManagement/specialScheme.html`

在 `.content` 区域最顶部（`<!-- ACTIONS -->` 前）插入横幅 HTML。

- [ ] **Step 1：定位插入点**

打开 `SDK/admin/schemeManagement/specialScheme.html`，找到第 341 行附近：

```html
    <!-- CONTENT -->
    <div class="content">

      <!-- ACTIONS -->
      <div class="actions-bar">
```

- [ ] **Step 2：插入横幅 HTML**

在 `<!-- ACTIONS -->` 注释之前插入：

```html
      <!-- GUIDE BANNER -->
      <div class="guide-banner" id="param-guide-banner">
        <div class="guide-banner-body">
          <span class="guide-step">
            <span class="guide-num">1</span>
            先在 <a class="guide-link" href="../config/configList.html">参数管理</a> 中新建参数
          </span>
          <span class="guide-arrow">→</span>
          <span class="guide-step">
            <span class="guide-num">2</span>
            回此页点「新增方案」，从参数中选值并填写
          </span>
        </div>
        <div class="guide-banner-actions">
          <button class="guide-dismiss-btn" onclick="dismissGuideBanner()">不再显示</button>
          <button class="guide-close-btn" onclick="closeGuideBanner()">×</button>
        </div>
      </div>
```

- [ ] **Step 3：验证 HTML 结构正确**

在浏览器中打开 `specialScheme.html`，确认横幅出现在内容区顶部、在搜索栏和「新增方案」按钮之上。此时无样式，排版乱是正常的。

- [ ] **Step 4：Commit**

```bash
git add SDK/admin/schemeManagement/specialScheme.html
git commit -m "feat: add guide banner HTML structure to specialScheme"
```

---

## Task 2：specialScheme.html — 横幅 CSS 样式

**Files:**
- Modify: `SDK/admin/schemeManagement/specialScheme.html`（`<style>` 块）

- [ ] **Step 1：找到 CSS 插入位置**

在 `<style>` 块末尾（`</style>` 之前）添加以下样式：

```css
/* ── GUIDE BANNER ── */
.guide-banner{
  display:flex;align-items:center;justify-content:space-between;
  background:#eff6ff;border-bottom:1px solid #bfdbfe;
  padding:10px 20px;gap:12px;flex-shrink:0;
}
.guide-banner-body{display:flex;align-items:center;gap:16px;flex-wrap:wrap;}
.guide-step{display:flex;align-items:center;gap:7px;font-size:13px;color:#1e40af;font-weight:500;}
.guide-num{
  width:20px;height:20px;border-radius:50%;
  background:#2563eb;color:#fff;
  display:inline-flex;align-items:center;justify-content:center;
  font-size:11px;font-weight:700;flex-shrink:0;
}
.guide-arrow{color:#93c5fd;font-size:16px;font-weight:400;}
.guide-link{color:#2563eb;text-decoration:underline;cursor:pointer;font-weight:600;}
.guide-link:hover{color:#1d4ed8;}
.guide-banner-actions{display:flex;align-items:center;gap:8px;flex-shrink:0;}
.guide-dismiss-btn{
  font-size:12px;color:#3b82f6;cursor:pointer;
  padding:3px 9px;border:1px solid #93c5fd;border-radius:4px;
  background:transparent;line-height:1.5;
}
.guide-dismiss-btn:hover{background:#dbeafe;}
.guide-close-btn{
  font-size:18px;color:#93c5fd;cursor:pointer;
  background:none;border:none;line-height:1;padding:0 2px;
}
.guide-close-btn:hover{color:#3b82f6;}
```

- [ ] **Step 2：验证样式**

刷新浏览器，确认：
- 横幅背景为浅蓝色，底部有蓝色细线分隔
- 两个步骤文字 + 蓝色圆形序号清晰可见
- 右侧「不再显示」按钮有边框，「×」为图标风格

- [ ] **Step 3：Commit**

```bash
git add SDK/admin/schemeManagement/specialScheme.html
git commit -m "feat: add guide banner CSS styles to specialScheme"
```

---

## Task 3：specialScheme.html — 横幅 JS 交互逻辑

**Files:**
- Modify: `SDK/admin/schemeManagement/specialScheme.html`（`<script>` 块或页面底部）

- [ ] **Step 1：找到 script 插入位置**

在 `</body>` 之前（或已有 `<script>` 块内）添加以下代码：

```js
// Guide banner
(function() {
  var banner = document.getElementById('param-guide-banner');
  if (!banner) return;
  if (localStorage.getItem('hideParamSchemeGuide') === '1') {
    banner.style.display = 'none';
  }
})();

function closeGuideBanner() {
  var banner = document.getElementById('param-guide-banner');
  if (banner) banner.style.display = 'none';
}

function dismissGuideBanner() {
  localStorage.setItem('hideParamSchemeGuide', '1');
  closeGuideBanner();
}
```

- [ ] **Step 2：手动验证「×」行为**

刷新页面，点击「×」，横幅消失。再次刷新，横幅重新出现（localStorage 未写入）。

- [ ] **Step 3：手动验证「不再显示」行为**

点击「不再显示」，横幅消失。刷新页面，横幅不再出现。打开浏览器 DevTools → Application → localStorage，确认存在键 `hideParamSchemeGuide` 值为 `'1'`。清除该键后刷新，横幅重新出现。

- [ ] **Step 4：Commit**

```bash
git add SDK/admin/schemeManagement/specialScheme.html
git commit -m "feat: add guide banner JS show/hide logic to specialScheme"
```

---

## Task 4：configCreate.html — 参数为空时的引导卡片

**Files:**
- Modify: `SDK/admin/config/configCreate.html`

当前「自定义参数方案」卡片（第 530 行附近）中有一个下拉选择框 `<select>`，没有空状态引导。需在卡片内加入引导卡片，并在 select 值为「无」时显示它。

- [ ] **Step 1：定位插入位置**

找到第 530 行附近的自定义参数方案卡片：

```html
        <!-- 自定义参数方案 -->
        <div class="card">
          <div style="font-size: 14px; font-weight: 700; color: var(--ink); margin-bottom: 12px;">自定义参数方案</div>
          <div class="form-group">
            <label class="form-label">参数方案</label>
            <select class="form-select">
              <option>无</option>
            </select>
            <div style="font-size: 13px; color: var(--ink-4); margin-top: 6px;">需在方案配置中设置参数代码值</div>
          </div>
          <button class="add-btn">+ 添加</button>
        </div>
```

- [ ] **Step 2：替换卡片内容，加入引导卡片**

将上述代码替换为：

```html
        <!-- 自定义参数方案 -->
        <div class="card">
          <div style="font-size: 14px; font-weight: 700; color: var(--ink); margin-bottom: 12px;">自定义参数方案</div>
          <div class="form-group">
            <label class="form-label">参数方案</label>
            <select class="form-select" id="param-scheme-select" onchange="toggleParamSchemeGuide(this)">
              <option value="">无</option>
            </select>
            <div style="font-size: 13px; color: var(--ink-4); margin-top: 6px;">需在方案配置中设置参数代码值</div>
          </div>
          <!-- 引导卡片：参数方案为空时显示 -->
          <div class="param-guide-card" id="param-scheme-guide">
            <div class="param-guide-icon">📋</div>
            <div class="param-guide-title">还没有可用的参数方案</div>
            <div class="param-guide-desc">
              创建方案前，需要先在「参数管理」中建立参数。<br>
              建完后回来，在此处选择对应的参数方案。
            </div>
            <a class="param-guide-btn" href="configList.html">前往参数管理 →</a>
          </div>
          <button class="add-btn">+ 添加</button>
        </div>
```

- [ ] **Step 3：在 `<style>` 块末尾添加引导卡片 CSS**

```css
/* ── PARAM SCHEME GUIDE CARD ── */
.param-guide-card{
  border:1.5px dashed #93c5fd;border-radius:8px;
  background:#eff6ff;padding:22px 16px;
  text-align:center;margin:12px 0;
}
.param-guide-icon{font-size:24px;margin-bottom:8px;}
.param-guide-title{font-weight:600;color:#1e40af;font-size:14px;margin-bottom:6px;}
.param-guide-desc{color:#3b82f6;font-size:13px;line-height:1.6;margin-bottom:14px;}
.param-guide-btn{
  display:inline-block;background:#2563eb;color:#fff;
  padding:7px 18px;border-radius:6px;font-size:13px;
  text-decoration:none;cursor:pointer;
}
.param-guide-btn:hover{background:#1d4ed8;}
```

- [ ] **Step 4：在 `</body>` 前添加显示控制 JS**

```js
// Param scheme guide card
function toggleParamSchemeGuide(sel) {
  var guide = document.getElementById('param-scheme-guide');
  if (!guide) return;
  guide.style.display = (sel.value === '' || sel.value === '无') ? 'block' : 'none';
}

(function initParamSchemeGuide() {
  var sel = document.getElementById('param-scheme-select');
  var guide = document.getElementById('param-scheme-guide');
  if (!sel || !guide) return;
  // 默认：select 只有「无」选项时，显示引导卡片
  guide.style.display = (sel.options.length <= 1) ? 'block' : 'none';
})();
```

- [ ] **Step 5：验证引导卡片行为**

打开 `configCreate.html`，确认：
1. 自定义参数方案卡片内出现蓝色虚线引导卡片
2. 卡片文字「还没有可用的参数方案」+ 说明文字 + 「前往参数管理 →」按钮可见
3. 点击「前往参数管理 →」链接跳转到 `configList.html`

- [ ] **Step 6：Commit**

```bash
git add SDK/admin/config/configCreate.html
git commit -m "feat: add empty-state guide card to param scheme section in configCreate"
```

---

## Task 5：验收自检

**Files:** 无新改动，仅验证

- [ ] **Step 1：验收清单 — specialScheme.html**

逐项确认：
1. 首次打开页面，顶部显示蓝色引导横幅
2. 点「×」横幅消失，刷新页面横幅重新出现
3. 点「不再显示」横幅消失，刷新页面横幅不再出现
4. DevTools → localStorage 中存在 `hideParamSchemeGuide: "1"`
5. 手动删除该 localStorage 键后刷新，横幅重新出现
6. 点击「参数管理」链接，跳转到 `../config/configList.html`

- [ ] **Step 2：验收清单 — configCreate.html**

逐项确认：
1. 打开页面，自定义参数方案区域显示引导卡片
2. 「前往参数管理 →」按钮点击后跳转 `configList.html`
3. （可选）如果 select 中有非空选项被选中，引导卡片隐藏

- [ ] **Step 3：最终 Commit（如有遗漏改动）**

```bash
git add SDK/admin/schemeManagement/specialScheme.html SDK/admin/config/configCreate.html
git commit -m "chore: finalize param scheme onboarding guide"
```
