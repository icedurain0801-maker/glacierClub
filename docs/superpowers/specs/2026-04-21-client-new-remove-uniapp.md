# Spec: client-new 去除 UniApp，改为纯 HTML 原型

**日期：** 2026-04-21  
**状态：** 待实施

---

## 背景

`bigPlayer/client-new` 当前是一个 UniApp (Vue 3 + Vite) 项目，因样式框架缺失（无 Tailwind/UnoCSS）导致页面无法正常渲染。决定彻底去掉 UniApp 架构，改为与 `bigPlayer/client/home/home.html`、`bigPlayer/client/profile/personalization/Badge.html` 相同风格的纯 HTML 原型。

---

## 目标

将 `client-new` 变为单入口纯 HTML 原型项目：
- 删除所有 UniApp/Vue/Vite 相关文件
- 以 `index.html` 作为唯一入口，包含所有页面内容
- 页面切换通过 CSS `display` 显隐实现（不依赖任何构建工具或框架）
- 复用 `bigPlayer/shared/` 的侧边栏
- 可直接用浏览器打开，或通过 HTTP 服务器访问

---

## 最终目录结构

```
bigPlayer/client-new/
  index.html          ← 唯一入口
  assets/
    gift-box.svg      ← 保留（徽章礼包图标）
```

删除内容：
- `package.json`、`package-lock.json`
- `vite.config.js`
- `shims-uni.d.ts`
- `node_modules/`
- `src/`（所有 Vue/UniApp 源码）

---

## index.html 结构

### 整体布局

与现有 HTML 原型保持一致的三列布局：

```
┌──────────┬──────────────┬────────────────┐
│ sidebar  │ phone shell  │   doc panel    │
│ 侧边导航  │  375×667px   │   右侧说明文档  │
└──────────┴──────────────┴────────────────┘
```

- **侧边导航**：`<nav id="sidebar" class="sidebar">` + `shared/sidebar.js` 初始化
- **手机外壳**：固定宽 375px，高 667px，`overflow-hidden`，`sticky top-0`
- **文档面板**：`max-w-[480px]`，`h-screen sticky top-0`，768px 以下隐藏

### 页面列表（顶层）

| page id    | 内容来源              |
|------------|----------------------|
| `page-home`  | `home.html` 手机壳内容 |
| `page-badge` | `Badge.html` 手机壳内容（含 s1~s6 子屏） |

顶层页面通过 `showPage(pageId)` 切换，默认显示 `page-home`。

### 子屏（仅 page-badge 内部）

Badge 页面内部维持原有 s1/s2/s3/s4/s6 五个子屏的 CSS 显隐逻辑，与 `Badge.html` 完全一致。

### 文档面板

| doc id      | 对应页面/子屏 |
|-------------|-------------|
| `doc-home`  | 首页        |
| `doc-s1`    | 徽章墙      |
| `doc-s2`    | 我的徽章    |
| `doc-s3`    | 设置徽章展示 |
| `doc-s4`    | 徽章详情    |
| `doc-s6`    | 角色信息确认 |

切换顶层页面时同步切换文档面板。切换 Badge 子屏时同步切换 doc-sX。

---

## 样式

- **Tailwind**：CDN 引入（`https://cdn.tailwindcss.com?plugins=forms,container-queries`）
- **Tailwind config**：完整沿用 `home.html` 的自定义 colors（primary、surface-* 系列等）、borderRadius、fontFamily
- **字体**：Google Fonts — Inter + Manrope + Material Symbols Outlined
- **自定义 CSS**：
  - `.glass-card`（半透明磨砂玻璃效果）
  - `.no-scrollbar`（隐藏滚动条）
  - `.material-symbols-outlined` 字重设置
  - `#s4::before` 光晕伪元素（clip-path 渐变，Tailwind 无法生成）

---

## JavaScript

全部内嵌 `<script>`，无外部依赖（除 shared/ 侧边栏脚本）：

### `showPage(pageId)`
```
- 隐藏所有 .page-root 元素
- 显示指定 pageId 元素
- 同步切换文档面板（doc-home / doc-s1 等）
- 若切换到 badge 页，默认显示 s1 子屏
```

### `showScreen(screenId)`
完整复用 `Badge.html` 的子屏切换逻辑：
- 切换 s1~s6 的 hidden class
- 切换 doc-s1~doc-s6 的 hidden class
- 重置 s4 奖励面板

### 其他交互逻辑
完整复用自 `Badge.html`：
- 徽章点击进入详情（getBadgeIcon 映射）
- 分类 Tab 点击滚动定位
- 奖励领取（claimReward + showToast）
- 版本块折叠展开（`.doc-version-hd` click）

### Sidebar 初始化
```js
initSidebar({ root: '..', currentHref: 'client-new/index.html' });
```

---

## 内容迁移说明

### 首页（page-home）
直接复制 `home.html` 手机壳 `<div class="relative flex-shrink-0 ...">` 内部所有 HTML，原样保留。

### 徽章页（page-badge）
直接复制 `Badge.html` 手机壳内部所有 HTML（s1~s6 + toast），原样保留。

### 文档面板内容
- `doc-home`：复制自 `home.html` 右侧文档面板内容
- `doc-s1` ~ `doc-s6`：复制自 `Badge.html` 右侧文档面板内容

---

## 不在本次范围内

- 新增任何页面内容或功能
- 修改现有页面的视觉设计
- 修改 `shared/sidebar-data.js`（sidebar 数据不变）
