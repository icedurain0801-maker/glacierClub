# client-new 去除 UniApp，改为纯 HTML 原型

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除 `bigPlayer/client-new` 的所有 UniApp/Vue/Vite 文件，改为单入口纯 HTML 原型，首页和徽章墙内容完整迁移，页面间通过 CSS 显隐切换。

**Architecture:** 单个 `index.html` 包含所有页面 HTML，`showPage()` 控制顶层页面切换，`showScreen()` 控制 Badge 子屏切换；样式用 Tailwind CDN；侧边栏复用 `bigPlayer/shared/`。

**Tech Stack:** 纯 HTML + Tailwind CSS CDN + 原生 JS（无构建工具、无框架）

---

## 文件变更清单

**删除：**
- `bigPlayer/client-new/package.json`
- `bigPlayer/client-new/package-lock.json`
- `bigPlayer/client-new/vite.config.js`
- `bigPlayer/client-new/shims-uni.d.ts`
- `bigPlayer/client-new/node_modules/`（整个目录）
- `bigPlayer/client-new/src/`（整个目录）

**新建：**
- `bigPlayer/client-new/index.html`
- `bigPlayer/client-new/assets/gift-box.svg`（从 src/assets/ 移出）

---

## Task 1: 清理 UniApp 文件

**Files:**
- Delete: `bigPlayer/client-new/package.json`
- Delete: `bigPlayer/client-new/package-lock.json`
- Delete: `bigPlayer/client-new/vite.config.js`
- Delete: `bigPlayer/client-new/shims-uni.d.ts`
- Delete: `bigPlayer/client-new/node_modules/`
- Delete: `bigPlayer/client-new/src/` （先把 assets/gift-box.svg 拷出来）

- [ ] **Step 1: 拷贝 gift-box.svg 到 assets 目录**

```bash
mkdir -p "bigPlayer/client-new/assets"
cp "bigPlayer/client-new/src/assets/gift-box.svg" "bigPlayer/client-new/assets/gift-box.svg"
```

- [ ] **Step 2: 删除 UniApp 相关文件和目录**

```bash
rm "bigPlayer/client-new/package.json"
rm "bigPlayer/client-new/package-lock.json"
rm "bigPlayer/client-new/vite.config.js"
rm "bigPlayer/client-new/shims-uni.d.ts"
rm -rf "bigPlayer/client-new/node_modules"
rm -rf "bigPlayer/client-new/src"
```

- [ ] **Step 3: 验证目录只剩预期内容**

```bash
ls "bigPlayer/client-new/"
```

预期输出（只有这两项）：
```
assets/
index.html   ← 还不存在，下一任务创建
```

实际此时只有 `assets/`，`index.html` 还未创建，正常。

- [ ] **Step 4: Commit**

```bash
git add -A bigPlayer/client-new/
git commit -m "chore(client-new): remove UniApp scaffold, keep assets"
```

---

## Task 2: 创建 index.html 外壳（三列布局 + head）

**Files:**
- Create: `bigPlayer/client-new/index.html`

- [ ] **Step 1: 创建 index.html，写入 head + 三列布局外壳**

内容来自 `Badge.html` 的 head（含完整 Tailwind config），加上 home.html 的额外自定义 CSS。

创建文件 `bigPlayer/client-new/index.html`，内容如下：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>大玩家 C端原型</title>
<link rel="stylesheet" href="../shared/sidebar.css">
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Manrope:wght@700;800&family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
<script id="tailwind-config">
tailwind.config = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "on-surface-variant": "#566166",
        "on-error": "#fff7f6",
        "secondary-container": "#cbe6ff",
        "secondary-dim": "#0e5881",
        "on-primary-fixed-variant": "#005e9f",
        "primary-fixed": "#d1e4ff",
        "error": "#9f403d",
        "primary": "#0061a4",
        "primary-dim": "#005590",
        "surface-container-low": "#f0f4f7",
        "surface-variant": "#d9e4ea",
        "outline": "#717c82",
        "on-primary-container": "#00548f",
        "tertiary-dim": "#47555e",
        "inverse-primary": "#2498f5",
        "surface-container": "#e8eff3",
        "inverse-on-surface": "#9a9d9f",
        "on-secondary-fixed": "#004366",
        "on-secondary": "#f6f9ff",
        "surface": "#f7f9fb",
        "on-tertiary-container": "#4c5a63",
        "on-error-container": "#752121",
        "on-background": "#2a3439",
        "tertiary-container": "#e1f0fb",
        "on-tertiary-fixed": "#3a4851",
        "error-dim": "#4e0309",
        "inverse-surface": "#0b0f10",
        "tertiary-fixed": "#e1f0fb",
        "error-container": "#fe8983",
        "surface-container-lowest": "#ffffff",
        "surface-container-highest": "#d9e4ea",
        "on-secondary-container": "#0a5780",
        "on-primary-fixed": "#004171",
        "outline-variant": "#a9b4b9",
        "surface-container-high": "#e1e9ee",
        "tertiary": "#53616a",
        "primary-container": "#d1e4ff",
        "primary-fixed-dim": "#b8d7ff",
        "surface-dim": "#cfdce3",
        "secondary": "#22648e",
        "on-tertiary-fixed-variant": "#56656e",
        "on-surface": "#2a3439",
        "background": "#f7f9fb",
        "on-primary": "#f5f8ff",
        "on-secondary-fixed-variant": "#1d608a",
        "surface-bright": "#f7f9fb",
        "tertiary-fixed-dim": "#d3e2ed",
        "secondary-fixed-dim": "#aed9ff",
        "on-tertiary": "#f4faff",
        "secondary-fixed": "#cbe6ff",
        "surface-tint": "#0061a4"
      },
      borderRadius: {
        "DEFAULT": "1rem",
        "lg": "2rem",
        "xl": "3rem",
        "full": "9999px"
      },
      fontFamily: {
        "headline": ["Manrope"],
        "body": ["Inter"],
        "label": ["Inter"]
      }
    }
  }
}
</script>
<style>
.material-symbols-outlined {
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}
.glass-card {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
}
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
/* s4 光晕伪元素 */
#s4::before {
  content: '';
  position: absolute; top: 0; left: 50%; transform: translateX(-50%);
  width: 200px; height: 300px;
  background: linear-gradient(180deg, rgba(80,180,255,0.15) 0%, transparent 100%);
  clip-path: polygon(40% 0%, 60% 0%, 100% 100%, 0% 100%);
  pointer-events: none;
}
</style>
</head>
<body class="bg-[#f0f4f8] min-h-screen flex justify-center" style="font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Helvetica Neue',sans-serif;">
<div class="flex w-fit min-h-screen">

  <!-- 侧边导航栏 -->
  <nav id="sidebar" class="sidebar"></nav>

  <!-- 手机外壳 -->
  <div class="relative flex-shrink-0 w-[375px] h-[667px] overflow-hidden sticky top-0 self-start bg-white shadow-[2px_0_16px_rgba(0,0,0,0.10)] my-5 ml-6 rounded-lg">

    <!-- PAGE: 首页 -->
    <div id="page-home" class="page-root w-full h-full overflow-y-auto">
      <!-- 首页内容（Task 3 填入） -->
    </div>

    <!-- PAGE: 徽章墙 -->
    <div id="page-badge" class="page-root hidden w-full h-full">
      <!-- 徽章墙内容（Task 4 填入） -->
    </div>

  </div><!-- /phone-shell -->

  <!-- 右侧文档面板 -->
  <div id="doc-panel" class="flex-1 min-w-[300px] max-w-[480px] bg-white border-l border-[#e8ecf0] px-6 py-7 overflow-y-auto h-screen sticky top-0 ml-6 max-[768px]:hidden">

    <!-- 首页文档（Task 3 填入） -->
    <div id="doc-home" class="doc-root">
    </div>

    <!-- 徽章页文档（Task 4 填入） -->
    <div id="doc-s1" class="doc-root hidden"></div>
    <div id="doc-s2" class="doc-root hidden"></div>
    <div id="doc-s3" class="doc-root hidden"></div>
    <div id="doc-s4" class="doc-root hidden"></div>
    <div id="doc-s6" class="doc-root hidden"></div>

  </div><!-- /doc-panel -->

</div><!-- /page-wrapper -->

<!-- JS（Task 5 填入） -->

<script src="../shared/sidebar-data.js"></script>
<script src="../shared/sidebar.js"></script>
<script>
  initSidebar({ root: '..', currentHref: 'client-new/index.html' });
</script>
</body>
</html>
```

- [ ] **Step 2: 用浏览器打开文件确认三列布局正常，sidebar 加载无报错**

直接双击 `bigPlayer/client-new/index.html` 打开，或 `python -m http.server 8080` 后访问 `http://localhost:8080/bigPlayer/client-new/`。

预期：侧边栏可见，手机外壳灰色区域可见，右侧文档面板可见，控制台无报错。

- [ ] **Step 3: Commit**

```bash
git add bigPlayer/client-new/index.html
git commit -m "feat(client-new): add HTML prototype shell with three-column layout"
```

---

## Task 3: 迁移首页内容

**Files:**
- Modify: `bigPlayer/client-new/index.html`（填充 `#page-home` 和 `#doc-home`）

- [ ] **Step 1: 把首页手机内容填入 `#page-home`**

打开 `bigPlayer/client/home/home.html`，找到手机外壳 div（`class="relative flex-shrink-0 w-[375px]..."`）的**内部所有 HTML**（从 `<!-- Top Navigation -->` 到 `</main>` 结束），复制后替换 `index.html` 中 `#page-home` 内的注释占位符。

注意：`home.html` 的手机外壳带有 `overflow-y-auto`，`#page-home` 本身已设置该属性，无需重复。

- [ ] **Step 2: 把首页文档内容填入 `#doc-home`**

打开 `bigPlayer/client/home/home.html`，找到 `<div id="doc-s1">` 内的全部 HTML（版本块内容），复制到 `index.html` 的 `#doc-home` 内。

- [ ] **Step 3: 在 `#doc-home` 前加版本折叠展开 JS（内嵌 script）**

在 `</body>` 前、sidebar script 之前，追加：

```html
<script>
  // 版本块折叠展开
  document.querySelectorAll('.doc-version-hd').forEach(hd => {
    hd.addEventListener('click', () => {
      const body = hd.nextElementSibling;
      const arrow = hd.querySelector('.doc-version-arrow');
      body.classList.toggle('hidden');
      arrow.style.transform = body.classList.contains('hidden') ? '' : 'rotate(180deg)';
    });
  });
</script>
```

- [ ] **Step 4: 验证首页渲染正常**

用浏览器打开 `index.html`，检查：
- Banner 图片可见，渐变背景正常
- 功能入口网格（新游预约等5个）显示正常
- Tab 导航（关注/发现/推荐/攻略站）显示正常
- 热门快讯列表显示正常
- 为您推荐帖子显示正常

- [ ] **Step 5: Commit**

```bash
git add bigPlayer/client-new/index.html
git commit -m "feat(client-new): migrate home page content"
```

---

## Task 4: 迁移徽章墙内容

**Files:**
- Modify: `bigPlayer/client-new/index.html`（填充 `#page-badge`、doc-s1~doc-s6、badge JS）

- [ ] **Step 1: 把徽章墙子屏 HTML 填入 `#page-badge`**

打开 `bigPlayer/client/profile/personalization/Badge.html`，找到手机外壳 div（`class="relative flex-shrink-0 w-[375px]..."`）的**内部所有 HTML**（从 `<!-- SCREEN 1: 徽章墙 -->` 到 `<!-- Toast 提示 -->` 的 div 结束），复制后替换 `index.html` 中 `#page-badge` 内的注释占位符。

注意：`gift-box.svg` 的引用路径在原文件中是 `../../assets/gift-box.svg`，需改为 `assets/gift-box.svg`。

- [ ] **Step 2: 把文档内容填入 doc-s1~doc-s6**

打开 `bigPlayer/client/profile/personalization/Badge.html`，右侧文档面板中有如下 div：
- `id="doc-s1"` 的内部 HTML → 复制到 `index.html` 的 `#doc-s1` 内
- `id="doc-s2"` 的内部 HTML → 复制到 `index.html` 的 `#doc-s2` 内
- `id="doc-s3"` 的内部 HTML → 复制到 `index.html` 的 `#doc-s3` 内
- `id="doc-s4"` 的内部 HTML → 复制到 `index.html` 的 `#doc-s4` 内
- `id="doc-s6"` 的内部 HTML → 复制到 `index.html` 的 `#doc-s6` 内

注意：这些 doc div 原本已有 `hidden` class（除 doc-s1），在 `index.html` 中 div 本身已有 `hidden`，内部 HTML 不需要重复加。

- [ ] **Step 3: 迁移 Badge 交互 JS**

将 `Badge.html` 的 `<script>` 块（从 `let fromScreen = 's1';` 到 `window.addEventListener('hashchange', _applyHash);`）复制到 `index.html` 的版本折叠 script 块**之后**，sidebar script **之前**。

同时，将其中的 `showScreen` 函数内的 screens 数组中的文档切换逻辑从直接操作 doc-sX 改为适配 `#page-badge` 激活状态：`showScreen` 已有 `doc.classList.remove('hidden')` 逻辑，无需修改，但确认 `doc-home` 不在其 screens 列表中。

- [ ] **Step 4: 添加 `showPage` 函数**

在版本折叠 script 块之前，新增以下 script：

```html
<script>
  function showPage(pageId) {
    document.querySelectorAll('.page-root').forEach(el => el.classList.add('hidden'));
    document.getElementById(pageId).classList.remove('hidden');

    document.querySelectorAll('.doc-root').forEach(el => el.classList.add('hidden'));
    if (pageId === 'page-home') {
      document.getElementById('doc-home').classList.remove('hidden');
    } else if (pageId === 'page-badge') {
      // badge 默认显示 s1 对应文档
      document.getElementById('doc-s1').classList.remove('hidden');
      // 同时确保 badge 内部子屏回到 s1
      showScreen('s1');
    }
    document.getElementById('doc-panel').scrollTop = 0;
  }
</script>
```

注意：`showPage` 调用了 `showScreen`，因此 `showPage` 的 script 标签需放在 Badge JS script 标签**之后**。调整顺序为：
1. 版本折叠 script
2. Badge 交互 JS script
3. showPage script
4. sidebar scripts

- [ ] **Step 5: 验证徽章墙交互**

用浏览器打开，通过侧边栏导航到徽章墙页（目前侧边栏点击会尝试打开旧路径，可暂时手动在控制台执行 `showPage('page-badge')` 测试）：
- s1 徽章墙正常显示
- 点击「共获得 N 个徽章」→ 切换到 s2
- 点击返回 → 回到 s1
- 点击「设置我的徽章展示」→ 切换到 s3
- 点击任意徽章 → 切换到 s4 详情页
- 点击「领取」→ 奖励区收起，toast 显示
- 分类 Tab（活跃成就/社交影响/互动传播）→ 滚动定位
- doc-panel 随子屏切换

- [ ] **Step 6: Commit**

```bash
git add bigPlayer/client-new/index.html
git commit -m "feat(client-new): migrate badge wall content and interactions"
```

---

## Task 5: 更新 sidebar-data.js 指向新路径

**Files:**
- Modify: `bigPlayer/shared/sidebar-data.js`

- [ ] **Step 1: 查看 sidebar-data.js 中与 client 相关的条目**

```bash
grep -n "client" bigPlayer/shared/sidebar-data.js
```

预期看到类似：
```
37:  href: 'client/home/home.html'
63:  href: 'client/profile/personalization/Badge.html'
69:  href: 'client/profile/personalization/Badge.html'
```

- [ ] **Step 2: 修改首页条目，指向 client-new/index.html**

打开 `bigPlayer/shared/sidebar-data.js`，将：
```js
href: 'client/home/home.html'
```
改为：
```js
href: 'client-new/index.html'
```

- [ ] **Step 3: 修改徽章墙条目，指向 client-new/index.html 并附带 hash**

将所有 `href: 'client/profile/personalization/Badge.html'` 改为：
```js
href: 'client-new/index.html#page-badge'
```

并确认 `screenId` 字段（若有）仍保留，`showScreen` 会通过 hash 自动处理。

- [ ] **Step 4: 更新 index.html 中的 hash 处理逻辑**

在 `index.html` 的 `showPage` script 之后、sidebar scripts 之前，追加：

```html
<script>
  function _applyPageHash() {
    const h = location.hash.slice(1);
    if (h === 'page-badge') {
      showPage('page-badge');
    } else if (h && document.getElementById(h)) {
      // badge 子屏 hash（如 #s2）
      showPage('page-badge');
      showScreen(h);
    } else {
      showPage('page-home');
    }
  }
  _applyPageHash();
  window.addEventListener('hashchange', _applyPageHash);
</script>
```

- [ ] **Step 5: 验证侧边栏导航**

用浏览器打开 `index.html`：
- 点击侧边栏「首页」→ 显示首页，doc-home 可见
- 点击侧边栏「徽章墙」→ 显示徽章墙 s1，doc-s1 可见

- [ ] **Step 6: Commit**

```bash
git add bigPlayer/shared/sidebar-data.js bigPlayer/client-new/index.html
git commit -m "feat(client-new): wire sidebar navigation to new index.html"
```

---

## 自审结果

**Spec 覆盖检查：**
- ✅ 删除所有 UniApp/Vue/Vite 文件 → Task 1
- ✅ 保留 gift-box.svg → Task 1 Step 1
- ✅ 单入口 index.html，三列布局 → Task 2
- ✅ 首页内容迁移 → Task 3
- ✅ 徽章墙 s1~s6 内容迁移 → Task 4
- ✅ showPage / showScreen 逻辑 → Task 4 Step 4
- ✅ 文档面板随页面/子屏切换 → Task 4 Step 4
- ✅ sidebar 初始化（root: '..'）→ Task 2 Step 1
- ✅ sidebar-data.js 更新 → Task 5
- ✅ hash 导航 → Task 5 Step 4

**占位符扫描：** 无 TBD/TODO。

**类型一致性：**
- `showPage` 调用 `showScreen`，后者在 Task 4 Step 3 定义，顺序正确
- `#page-home` / `#page-badge` / `.page-root` / `.doc-root` 命名在 Task 2~5 中一致
- `gift-box.svg` 路径在 Task 4 Step 1 已明确修正为 `assets/gift-box.svg`
