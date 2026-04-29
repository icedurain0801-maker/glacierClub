# 「发现」Tab 瀑布流 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 点击首页「发现」Tab 时，下方内容区切换为两列瀑布流布局，Banner 及功能栏严格不变。

**Architecture:** 纯静态 HTML 单文件改造。给 `.phone-inner` 加 `data-tab` 属性，JS `switchTab()` 函数更新该属性并同步 Tab 激活样式，CSS 属性选择器控制两个内容面板的显隐。新增瀑布流面板插入 `<main>` 尾部，原推荐内容区包裹在 `data-tab-panel="recommend"` 容器中。

**Tech Stack:** 原生 HTML / CSS / JS，无框架，无构建工具。

---

## 文件改动范围

| 文件 | 操作 |
|---|---|
| `bigPlayer/client/home/home.html` | 唯一改动文件 |

改动位置清单：
1. `<style>` 块末尾 — 追加 tab 切换 CSS + 瀑布流/卡片样式
2. Tab 导航栏（`<section class="px-4">` 中的 4 个 div）— 加 `onclick`，推荐加 `id="tab-bar"`
3. `<main>` 下各内容 section — 整体包裹进 `<div data-tab-panel="recommend">`
4. `<main>` 末尾 — 插入 `<div data-tab-panel="discover">` 瀑布流面板
5. `</body>` 前的 `<script>` 块 — 追加 `switchTab()` 和点赞交互函数

---

## Task 1：加 CSS tab 切换规则 + 瀑布流/卡片基础样式

**Files:**
- Modify: `bigPlayer/client/home/home.html`（`<style>` 块末尾追加）

- [ ] **Step 1：在第一个 `</style>` 标签前追加以下 CSS**

找到文件中第一个 `</style>`（约第 98 行），在其前插入：

```css
/* ── Tab 切换 ── */
[data-tab-panel="discover"] { display: none; }
.phone-inner[data-tab="discover"] [data-tab-panel="recommend"] { display: none; }
.phone-inner[data-tab="discover"] [data-tab-panel="discover"]  { display: block; }

/* ── Tab 激活态（JS 驱动） ── */
.tab-active {
  font-weight: 700 !important;
  color: #1f2937 !important;
  border-bottom: 2px solid #0061a4 !important;
}
.tab-inactive {
  font-weight: 500;
  color: #566166;
  border-bottom: 2px solid transparent !important;
}

/* ── 瀑布流容器 ── */
.waterfall-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 6px 6px 80px;
}
.waterfall-col { display: flex; flex-direction: column; gap: 6px; }
.waterfall-col--right { margin-top: 14px; }

/* ── 通用卡片 ── */
.wf-card {
  border-radius: 10px;
  overflow: hidden;
  background: #ffffff;
  box-shadow: 0 1px 6px rgba(0,0,0,0.08);
}
.wf-card__thumb { position: relative; }
.wf-card__thumb img { width: 100%; display: block; object-fit: cover; }

/* 视频角标 */
.wf-card__play {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 32px; height: 32px;
  background: rgba(0,0,0,0.52);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  pointer-events: none;
}
.wf-card__play::after {
  content: '';
  width: 0; height: 0;
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  border-left: 10px solid white;
  margin-left: 2px;
}
.wf-card__duration {
  position: absolute; bottom: 5px; right: 6px;
  background: rgba(0,0,0,0.62);
  color: white; font-size: 9px; font-weight: 600;
  padding: 2px 5px; border-radius: 4px;
  letter-spacing: 0.02em;
}

/* 文字占位封面 */
.wf-card__textthumb {
  padding: 14px 10px 10px;
  min-height: 68px;
  display: flex; flex-direction: column; justify-content: flex-end;
}
.wf-card__textthumb span {
  font-size: 13px; font-weight: 700; color: #1e3a5f;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 卡片信息区 */
.wf-card__info { padding: 7px 8px 8px; }
.wf-card__title {
  font-size: 11px; font-weight: 500;
  color: #1f2937; line-height: 1.4;
  margin-bottom: 7px;
  display: -webkit-box;
  -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.wf-card__meta {
  display: flex; align-items: center; gap: 5px;
  min-width: 0;
}
.wf-card__avatar {
  width: 18px; height: 18px;
  border-radius: 50%; flex-shrink: 0;
  object-fit: cover;
}
.wf-card__username {
  font-size: 10px; font-weight: 600; color: #374151;
  flex: 1; overflow: hidden;
  white-space: nowrap; text-overflow: ellipsis;
  min-width: 0;
}

/* ── 点赞按钮 ── */
.like-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 9px 4px 7px;
  border-radius: 999px; border: none;
  background: #fdf4ef;
  color: #f0a070;
  font-size: 11px; font-weight: 700;
  cursor: pointer; flex-shrink: 0;
  white-space: nowrap; line-height: 1;
  box-shadow: none;
  transition: all 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.like-btn .like-heart {
  font-size: 13px; line-height: 1; display: inline-block;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.like-btn.liked {
  background: linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%);
  color: #ffffff;
  box-shadow: 0 2px 8px rgba(255,107,53,0.45);
  transform: scale(1.08);
}
.like-btn.liked .like-heart { transform: scale(1.2); }
```

- [ ] **Step 2：在浏览器打开文件，确认样式无报错**

用浏览器直接打开 `bigPlayer/client/home/home.html`，打开 DevTools → Console，确认无 CSS 报错，页面视觉与改前一致（CSS 尚未生效，因为 data-tab 未加）。

---

## Task 2：给推荐内容区加 `data-tab-panel` 包裹

**Files:**
- Modify: `bigPlayer/client/home/home.html`（`<main>` 内部）

- [ ] **Step 1：找到 `<main>` 开始标签**

定位到约第 129 行：
```html
<main class="w-full space-y-3 pb-28">
```

- [ ] **Step 2：在 Banner section 结束后、Carousel section 开始前，插入包裹开标签**

找到 Banner `</section>`（约第 179 行，`</section>` 后紧接 `<!-- Icon Grid Navigation`注释），在 Carousel section 的 `<!-- Carousel Section -->` 注释前插入：

```html
<div data-tab-panel="recommend">
```

- [ ] **Step 3：在 `</main>` 前插入包裹闭标签**

找到 `</main>`（约第 367 行），在其前插入：

```html
</div><!-- /data-tab-panel="recommend" -->
```

- [ ] **Step 4：浏览器刷新，确认页面无变化**

页面应与改前完全相同，推荐内容正常显示。

---

## Task 3：给 Tab 按钮加 onclick 和 id

**Files:**
- Modify: `bigPlayer/client/home/home.html`（Tab 导航栏 section）

- [ ] **Step 1：找到 Tab 导航栏 section**

定位到约第 182 行：
```html
<section class="px-4">
  <div class="flex items-center gap-8 border-b ...">
```

- [ ] **Step 2：给父容器加 id，替换四个 Tab 的 HTML**

将整个 Tab 栏 `<div class="flex items-center gap-8 ...">...</div>` 替换为：

```html
<div id="tab-bar" class="flex items-center gap-8 border-b border-surface-container-high overflow-x-auto no-scrollbar">
  <div id="tab-follow"
       class="pb-3 text-sm font-medium text-on-surface-variant flex-shrink-0 tab-inactive"
       style="cursor:pointer; border-bottom:2px solid transparent;"
       onclick="switchTab('follow')">关注</div>
  <div id="tab-discover"
       class="pb-3 text-sm font-medium text-on-surface-variant flex items-center gap-1 flex-shrink-0 tab-inactive"
       style="cursor:pointer; border-bottom:2px solid transparent;"
       onclick="switchTab('discover')">
    <span>发现</span>
    <span class="material-symbols-outlined text-base text-green-500" style="font-variation-settings: 'FILL' 1;">thumb_up</span>
  </div>
  <div id="tab-recommend"
       class="pb-3 text-sm font-bold text-on-surface border-b-2 border-primary relative flex items-center gap-1 flex-shrink-0 tab-active"
       style="cursor:pointer;"
       onclick="switchTab('recommend')">
    <span>推荐</span>
    <span class="material-symbols-outlined text-base text-orange-500" style="font-variation-settings: 'FILL' 1;">local_fire_department</span>
  </div>
  <div id="tab-guide"
       class="pb-3 text-sm font-medium text-on-surface-variant flex-shrink-0 tab-inactive"
       style="cursor:pointer; border-bottom:2px solid transparent;"
       onclick="switchTab('guide')">攻略站</div>
</div>
```

- [ ] **Step 3：浏览器刷新，确认 Tab 视觉正常**

「推荐」应仍为粗体激活态，其他三个为灰色，页面内容不变。

---

## Task 4：插入瀑布流面板 HTML

**Files:**
- Modify: `bigPlayer/client/home/home.html`（`</div><!-- /data-tab-panel="recommend" -->` 之后，`</main>` 之前）

- [ ] **Step 1：在 `</div><!-- /data-tab-panel="recommend" -->` 后插入瀑布流面板**

```html
<!-- ── 发现 Tab：瀑布流面板 ── -->
<div data-tab-panel="discover">
  <div class="waterfall-grid">

    <!-- 左列 -->
    <div class="waterfall-col">

      <!-- 卡片1：有封面·视频 -->
      <div class="wf-card">
        <div class="wf-card__thumb">
          <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuA-4taa7yNILD_pDldo0bJdy0lsdv-i1fVOXPvzOVNj-euNEZ9T0V9NOusYI5zZb8KOOdEgXsFzG3WiN_Kbc-_zJ_B2QiaB3SWwGbvm0WPq3PruXCe0ZxhqqMM5Q9Gpo1L4X0YoRctabfBCYGoXbqH_sUxNhAr68PYH7qO8TyszakD0NZX3cujuoO0zZ_NxrSyFAXwOxjzKNCi2s3bs5eohJKBGDQLyTuAc3jdbG3sKFgDTuIuDXXbbI577Ts7l-32pJ-lm67VWXFw" alt="游戏视频封面" />
          <div class="wf-card__play"></div>
          <span class="wf-card__duration">00:34</span>
        </div>
        <div class="wf-card__info">
          <div class="wf-card__title">《狩魂者-蛮古》技能详情公开！满血复活！</div>
          <div class="wf-card__meta">
            <img class="wf-card__avatar" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCPXztMYF9Z6yqq4_s52sJcMtbDWWhm23ZU1e6Oeb3U1O14w7ZStlm3TYaAZDF6QM3gKe5B2YDV5PHJNsJB9ISfAi-H6_JILB7RD6hAAItI7EafTcJRPRWE9KRRHfhk63yWyH1L2-8h3YlP-U0HUViXP38ic-KN_ZdBacNa-DgFgJGOTlDLDEqOckvI92NyjWBamJgUGMvKvT6UmHcX6_AqS5tV49aqcK_Cmom2apDPSM0rf0BOy4vrFbOoXZyROfuLyNJoBu6pZ14" alt="超能情报站" />
            <span class="wf-card__username">超能情报站</span>
            <button class="like-btn" onclick="toggleLike(this)">
              <span class="like-heart">♡</span><span class="like-count">696</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 卡片3：无封面·文字占位 -->
      <div class="wf-card">
        <div class="wf-card__textthumb" style="background: linear-gradient(135deg,#dbeafe 0%,#ede9fe 100%);">
          <span>终于在最高难度下通关了！</span>
        </div>
        <div class="wf-card__info">
          <div class="wf-card__title">终于在最高难度下通关了《永恒之境》！打击感绝了，配合光影渲染简直视觉盛宴</div>
          <div class="wf-card__meta">
            <img class="wf-card__avatar" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCPXztMYF9Z6yqq4_s52sJcMtbDWWhm23ZU1e6Oeb3U1O14w7ZStlm3TYaAZDF6QM3gKe5B2YDV5PHJNsJB9ISfAi-H6_JILB7RD6hAAItI7EafTcJRPRWE9KRRHfhk63yWyH1L2-8h3YlP-U0HUViXP38ic-KN_ZdBacNa-DgFgJGOTlDLDEqOckvI92NyjWBamJgUGMvKvT6UmHcX6_AqS5tV49aqcK_Cmom2apDPSM0rf0BOy4vrFbOoXZyROfuLyNJoBu6pZ14" alt="星空旅人_Aria" />
            <span class="wf-card__username">星空旅人_Aria</span>
            <button class="like-btn" onclick="toggleLike(this)">
              <span class="like-heart">♡</span><span class="like-count">452</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 卡片5：有封面·图片 -->
      <div class="wf-card">
        <div class="wf-card__thumb">
          <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuBg4rWbAStZdaKm-UAy8l7V7KG5HEBj2xBPCuUbCCQS4T2DCgJu4J9WZkLiJb9kU5L4thpZal1fUYF_jCjG66UBiKI1qWnyZsbNja1RxnbXCBHxedirn5ExXCDMYLKz7ej3DigoobFQ8tQtZE-FBIFAjCgkX6v3q69OAFECEmCZkVuzoSbB87765rqYqKW-kfsrDersSJi--Fn9Hw0f0_85OLz0YS80ua-JUldwArqCm3LSegKRU6qej1ns0FA8D1GI9QWD1Je8sfc" alt="游戏封面" />
        </div>
        <div class="wf-card__info">
          <div class="wf-card__title">新版本上线了，测了一下手感真的爽</div>
          <div class="wf-card__meta">
            <img class="wf-card__avatar" src="https://lh3.googleusercontent.com/aida-public/AB6AXuD86vB_lqXjCG9yF3L3OReif6f3DVDunAXNZfAQIOiaQUvaMrPUh6hGo-fRPUEkMMybp3P6I2lOhpZb5ahdDbxFt_4LJ8YgbjX1LekcrrhpbjJTLIikeVMQEQp5prVTopjO8U3C_TPBvKLabYprMNJG0p_Hr6SW8xrNF5f0q5O3mL4ITfa0_4welABx9LUYghbAqeW4Gg3TU3Y6LTg_NuIb9Vnv0fgmacjm7-ZaVtkXB0exEqxiu5uLLWzvYFw67MEf-cAcYhNTQlU" alt="晴天_Sky" />
            <span class="wf-card__username">晴天_Sky</span>
            <button class="like-btn" onclick="toggleLike(this)">
              <span class="like-heart">♡</span><span class="like-count">233</span>
            </button>
          </div>
        </div>
      </div>

    </div><!-- /waterfall-col left -->

    <!-- 右列（初始偏移 14px 产生瀑布流错位） -->
    <div class="waterfall-col waterfall-col--right">

      <!-- 卡片2：有封面·图片 -->
      <div class="wf-card">
        <div class="wf-card__thumb">
          <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuB346jz_0p0UQu-Z3k4i7NZLDvqFfjHTdBKNnLMV_qG4RB1QXyqnShYavGs8RFHMoeLC7sRDAD5CckkL7hp-I4RxMJvFP6cIl7jyOJQzPSc6FfUUrDhPerm611P3r2ua2rcgsj535roWgrkJafWCdGJbclI8mdo5bAYtyI4mrkN_ofWuKXaZwLSfc8MWbcEdZ_uZjwUxqV_7AaqkIP8T_YZVxOXT6x16xEecIrexAgdjTR8BNQQ2Pne03_7dWQY0-s0hT9mDsESp8Q" alt="攻略截图" />
        </div>
        <div class="wf-card__info">
          <div class="wf-card__title">26.04.20 狗头总结 周报整理</div>
          <div class="wf-card__meta">
            <img class="wf-card__avatar" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCPXztMYF9Z6yqq4_s52sJcMtbDWWhm23ZU1e6Oeb3U1O14w7ZStlm3TYaAZDF6QM3gKe5B2YDV5PHJNsJB9ISfAi-H6_JILB7RD6hAAItI7EafTcJRPRWE9KRRHfhk63yWyH1L2-8h3YlP-U0HUViXP38ic-KN_ZdBacNa-DgFgJGOTlDLDEqOckvI92NyjWBamJgUGMvKvT6UmHcX6_AqS5tV49aqcK_Cmom2apDPSM0rf0BOy4vrFbOoXZyROfuLyNJoBu6pZ14" alt="亚历山大叔" />
            <span class="wf-card__username">亚历山大叔</span>
            <button class="like-btn" onclick="toggleLike(this)">
              <span class="like-heart">♡</span><span class="like-count">29</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 卡片4：无封面·文字占位 -->
      <div class="wf-card">
        <div class="wf-card__textthumb" style="background: linear-gradient(135deg,#fce7f3 0%,#fbcfe8 100%);">
          <span>战域赛季末，分享几波操作</span>
        </div>
        <div class="wf-card__info">
          <div class="wf-card__title">战域，到目前为止还没丢分，赛季末了分享一波操作集锦</div>
          <div class="wf-card__meta">
            <img class="wf-card__avatar" src="https://lh3.googleusercontent.com/aida-public/AB6AXuD86vB_lqXjCG9yF3L3OReif6f3DVDunAXNZfAQIOiaQUvaMrPUh6hGo-fRPUEkMMybp3P6I2lOhpZb5ahdDbxFt_4LJ8YgbjX1LekcrrhpbjJTLIikeVMQEQp5prVTopjO8U3C_TPBvKLabYprMNJG0p_Hr6SW8xrNF5f0q5O3mL4ITfa0_4welABx9LUYghbAqeW4Gg3TU3Y6LTg_NuIb9Vnv0fgmacjm7-ZaVtkXB0exEqxiu5uLLWzvYFw67MEf-cAcYhNTQlU" alt="†御梦子†" />
            <span class="wf-card__username">†御梦子†</span>
            <button class="like-btn" onclick="toggleLike(this)">
              <span class="like-heart">♡</span><span class="like-count">115</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 卡片6：有封面·视频 -->
      <div class="wf-card">
        <div class="wf-card__thumb">
          <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuDiQ9ZhJEp4_zBDiM9E0-1EjwVY5fzUCYgVQ2omhAQZI55dnzjqBkXrwwcsv_XtXOfLLLH3X5KxaOmJ0EFFp2beOtuPGhobPXz6reivEE0EB5e2gYCoujwQsPl2JIB0Jgbd6msmZ5Ly9j5Gz7MvMu4GOq7LEJiL7aRCHYJKX3NSMG7X_nJQcEXMdax1GQkylpF8RdGEJAk8fTiMm8XVB9pco1FxyTkYMur5t046kUpMY40CbhqjDrsBvE8mRPuBctEzgTts5J_fhHU" alt="游戏场景" />
          <div class="wf-card__play"></div>
          <span class="wf-card__duration">01:22</span>
        </div>
        <div class="wf-card__info">
          <div class="wf-card__title">赛季末操作集锦，这波真的不亏来看</div>
          <div class="wf-card__meta">
            <img class="wf-card__avatar" src="https://lh3.googleusercontent.com/aida-public/AB6AXuD86vB_lqXjCG9yF3L3OReif6f3DVDunAXNZfAQIOiaQUvaMrPUh6hGo-fRPUEkMMybp3P6I2lOhpZb5ahdDbxFt_4LJ8YgbjX1LekcrrhpbjJTLIikeVMQEQp5prVTopjO8U3C_TPBvKLabYprMNJG0p_Hr6SW8xrNF5f0q5O3mL4ITfa0_4welABx9LUYghbAqeW4Gg3TU3Y6LTg_NuIb9Vnv0fgmacjm7-ZaVtkXB0exEqxiu5uLLWzvYFw67MEf-cAcYhNTQlU" alt="月光_Vera" />
            <span class="wf-card__username">月光_Vera</span>
            <button class="like-btn" onclick="toggleLike(this)">
              <span class="like-heart">♡</span><span class="like-count">88</span>
            </button>
          </div>
        </div>
      </div>

    </div><!-- /waterfall-col right -->

  </div><!-- /waterfall-grid -->
</div><!-- /data-tab-panel="discover" -->
```

- [ ] **Step 2：浏览器刷新，确认瀑布流面板不可见**

页面应与改前一致（discover 面板隐藏）。DevTools → Elements 可以确认 `[data-tab-panel="discover"]` 节点存在且 `display:none`。

---

## Task 5：加 JS switchTab() 和 toggleLike()

**Files:**
- Modify: `bigPlayer/client/home/home.html`（末尾 `<script>` 块中追加）

- [ ] **Step 1：找到文件末尾的 `<script>` 块**

定位到约第 370 行：
```html
<script src="../../shared/sidebar-data.js"></script>
<script src="../../shared/sidebar.js"></script>
<script>
  initSidebar({ ... });
</script>
```

- [ ] **Step 2：在 `initSidebar(...)` 调用之后追加以下代码**

```js
/* ── Tab 切换 ── */
function switchTab(tab) {
  // 更新 data-tab 属性
  document.querySelector('.phone-inner').dataset.tab = tab;

  // 更新 Tab 激活样式
  const tabIds = ['follow', 'discover', 'recommend', 'guide'];
  tabIds.forEach(function(t) {
    var el = document.getElementById('tab-' + t);
    if (!el) return;
    if (t === tab) {
      el.classList.remove('tab-inactive');
      el.classList.add('tab-active');
    } else {
      el.classList.remove('tab-active');
      el.classList.add('tab-inactive');
    }
  });
}

/* ── 点赞切换 ── */
function toggleLike(btn) {
  var isLiked = btn.classList.contains('liked');
  var heart = btn.querySelector('.like-heart');
  var countEl = btn.querySelector('.like-count');
  var count = parseInt(countEl.textContent, 10);

  if (isLiked) {
    btn.classList.remove('liked');
    heart.textContent = '♡';
    countEl.textContent = count - 1;
  } else {
    btn.classList.add('liked');
    heart.textContent = '♥';
    countEl.textContent = count + 1;
  }
}
```

- [ ] **Step 3：浏览器刷新，点击「发现」Tab，确认内容切换**

- 点击「发现」→ 推荐内容消失，瀑布流出现，「发现」Tab 变粗体下划线
- 点击「推荐」→ 推荐内容恢复，瀑布流消失，「推荐」Tab 变粗体下划线
- Banner / 功能栏 / Tab 栏本身在切换过程中完全不变

- [ ] **Step 4：测试点赞按钮**

- 点击卡片上的点赞按钮 → 变为橙红渐变，数字 +1，心形弹跳
- 再次点击 → 恢复浅橙色，数字 -1

---

## Task 6：提交变更

- [ ] **Step 1：确认只有 `home.html` 被修改**

```bash
git diff --name-only
```

Expected output:
```
bigPlayer/client/home/home.html
```

- [ ] **Step 2：提交**

```bash
git add bigPlayer/client/home/home.html
git commit -m "feat(client): add discover tab waterfall feed with like button"
```

- [ ] **Step 3：写 changelog**

在 `.claude/docs/2026-04/2026-04-23/` 目录下创建：

```
v001_changelog.md
```

内容：
```markdown
feat(home): 发现Tab瀑布流 — 点击「发现」切换两列瀑布流，含有图/无图/视频卡片及点赞交互
```

---

## 自检结果

| Spec 要求 | 对应 Task |
|---|---|
| 点击「发现」切换内容区 | Task 1 CSS + Task 5 JS |
| 推荐 tab 默认激活 | Task 3（tab-recommend 默认带 tab-active 类） |
| Banner/功能栏不变 | Task 2（只包裹 Banner 后的内容）|
| 两列瀑布流，右列偏移 14px | Task 1 CSS + Task 4 HTML |
| 有图卡片：封面+标题+meta行 | Task 4 |
| 无图卡片：文字大图化占位 | Task 4（卡片3、卡片4）|
| 视频角标+时长 | Task 4（卡片1、卡片6）|
| 点赞按钮：浅橙未选/橙红已选/弹跳动画 | Task 1 CSS + Task 5 JS |
| 单文件改动 | 全部 Task 均只改 home.html |
