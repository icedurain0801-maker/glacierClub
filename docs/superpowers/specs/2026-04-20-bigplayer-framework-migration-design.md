# bigPlayer 框架迁移设计规格

> 日期：2026-04-20
> 状态：待实施

## 概述

将 bigPlayer 目录下的现有静态 HTML 原型页面迁移到对应的前端框架：
- `bigPlayer/client/` → **UniApp**（Vue 3 + Vite）
- `bigPlayer/admin/` → **React**（Vite + React）

迁移后仍为原型展示用途，保留现有的三列布局外壳（侧边栏 + 手机/PC 内容 + 文档面板）。

## 迁移范围

| 页面 | 源文件 | 目标框架 | 备注 |
|------|--------|---------|------|
| 首页 | `client/home/home.html` | UniApp (.vue) | 单屏页面 |
| 徽章墙 | `client/profile/personalization/Badge.html` | UniApp (.vue) | 6 屏切换 |
| 徽章管理 | `admin/community/BadgeManage.html` | React (.jsx) | 含弹窗、说明浮窗 |
| 官网落地页 | `admin/official-website/index.html` | **不迁移** | 独立页面，无侧边栏 |

---

## Part 1：Client 端 — UniApp 项目

### 工程结构

```
bigPlayer/client/
├── package.json
├── pages.json              # uni-app 路由配置
├── manifest.json           # 应用配置
├── uni.scss                # 全局 SCSS 变量（色彩规范）
├── App.vue                 # 根组件
├── main.js                 # 入口
├── static/                 # 静态资源（gift-box.svg 等）
├── pages/
│   ├── home/
│   │   └── home.vue        # 首页（从 home.html 迁移）
│   └── profile/
│       └── personalization/
│           └── Badge.vue   # 徽章墙（从 Badge.html 迁移，6 屏）
├── components/             # 公共组件
│   ├── NavBar.vue          # 顶部导航栏（渐变蓝背景 + 返回按钮）
│   ├── BadgeIcon.vue       # 徽章图标（五边形/圆形/六边形 + 级别渐变）
│   └── RewardPanel.vue     # 奖励展示区（s4/s5 共用）
└── prototype-shell/        # 原型展示外壳（不属于 uni-app 工程）
    └── index.html          # 三列布局壳：侧边栏 + iframe(uni-app H5) + 文档面板
```

### 关键决策

1. **多屏切换**：Badge.vue 内部使用 `v-if` + `currentScreen` 响应式状态控制 6 个 screen 的显示/隐藏，保持和原型一致的行为。不使用 uni-app 页面路由切换 screen，因为这些 screen 有共享状态（`fromScreen` 等）。

2. **样式方案**：使用 `@uni-helper/vite-plugin-uni-tailwind` 支持 Tailwind CSS，保留现有 Tailwind class 写法，减少迁移工作量。不支持的样式（clip-path 等）使用 `<style scoped>` 补充。

3. **色彩规范**：提取到 `uni.scss` 的 SCSS 变量：
   - 主色：`$primary: #3ab4e8`
   - 页面背景：`$bg: #f0f6fb`
   - 主文字：`$text-primary: #1a2233`
   - 等（完整列表见 client/constraint.md）

4. **静态资源**：`gift-box.svg` 移入 `static/` 目录；外部 CDN 图片（twemoji、lh3.googleusercontent.com）保持外部引用不变。

### 页面迁移映射

#### home.vue（首页）

原始结构 → Vue 组件拆分：
- 顶部导航 → `<NavBar>` 组件
- Banner 区 → `<template>` 内直接渲染
- 功能入口网格 → `v-for` 循环渲染
- Tab 导航 → 组件内状态控制 `activeTab`
- 热门快讯列表 → `v-for` 循环 mock 数据
- 推荐帖子信息流 → `v-for` 循环 mock 数据

#### Badge.vue（徽章墙，6 屏）

| Screen | 内容 | 迁移方式 |
|--------|------|---------|
| s1 | 徽章墙主页 | 主模板，`v-if="currentScreen === 's1'"` |
| s2 | 我的徽章 | `v-if="currentScreen === 's2'"` |
| s3 | 设置徽章展示 | `v-if="currentScreen === 's3'"` |
| s4 | 徽章详情 | `v-if="currentScreen === 's4'"`，使用 `<BadgeIcon>` + `<RewardPanel>` |
| s5 | 徽章获得通知弹窗 | `v-if="currentScreen === 's5'"`，使用 `<RewardPanel>` |
| s6 | 角色信息确认 | `v-if="currentScreen === 's6'"` |

公共逻辑提取：
- `showScreen(id)` → Vue method，更新 `currentScreen` + `postMessage` 通知外壳
- `claimReward(panelId)` → Vue method，控制 RewardPanel 的显示/隐藏动画
- `getBadgeIcon(name)` → 工具函数，放在 `utils/badge.js`

---

## Part 2：Admin 端 — React 项目

### 工程结构

```
bigPlayer/admin/
├── package.json
├── vite.config.js          # Vite + React 配置
├── index.html              # Vite 入口 HTML
├── src/
│   ├── main.jsx            # React 入口（ReactDOM.createRoot）
│   ├── App.jsx             # 根组件 + 路由
│   ├── App.css             # 全局样式（admin 色彩规范、表格/弹窗/分页等公共样式）
│   ├── pages/
│   │   └── community/
│   │       └── BadgeManage.jsx   # 徽章管理页
│   ├── components/
│   │   ├── PageCard.jsx          # 页面卡片容器
│   │   ├── FilterBar.jsx         # 筛选栏
│   │   ├── Pagination.jsx        # 分页组件
│   │   ├── BadgeModal.jsx        # 新增/编辑徽章弹窗
│   │   ├── HelpFab.jsx           # 需求说明悬浮按钮 + 面板
│   │   └── Toggle.jsx            # 开关组件
│   └── data/
│       └── mockBadges.js         # Mock 数据
├── prototype-shell/        # 原型展示外壳
│   └── index.html          # 侧边栏 + iframe(React app)
├── community/              # 保留原 HTML（归档）
│   └── BadgeManage.html
└── official-website/       # 不迁移，保持原样
    └── index.html
```

### 关键决策

1. **路由**：使用 `react-router-dom`。当前只有 `BadgeManage` 一个页面，但预留扩展。Tab 切换（徽章列表 / 审核列表）不走路由，组件内 `useState` 控制。

2. **样式方案**：沿用原生 CSS，不引入 CSS-in-JS 或 UI 框架（constraint.md 禁止）。BadgeManage.html 的 `<style>` 块提取到 `App.css`，各组件通过 className 引用。

3. **弹窗组件**：`BadgeModal` 接收 `visible` + `onClose` + `editData` props：
   - `visible: boolean` — 控制显示
   - `onClose: () => void` — 关闭回调
   - `editData: object | null` — 非 null 时为编辑模式
   - 内部管理表单状态 `useState` 和奖品列表 `useState`

4. **说明浮窗**：`HelpFab` 组件：
   - 拖拽逻辑用 `useRef` + `useEffect` 监听 mousedown/mousemove/mouseup
   - 面板展开/收起用 `useState(false)`
   - 版本块折叠用内部状态

5. **原 HTML 归档**：迁移完成后 `community/BadgeManage.html` 保留在原位不删除。

### 组件迁移映射

| 原 HTML 结构 | React 组件 | 状态管理 |
|-------------|-----------|---------|
| `.tab-bar` | `BadgeManage.jsx` 内部 | `activeTab` state |
| `.filter-bar` | `<FilterBar>` | props: `filters`, `onChange` |
| `.action-bar` + `table` | `BadgeManage.jsx` 内部 | `MOCK_BADGES` 数据 |
| `.pagination` | `<Pagination>` | `currentPage` state |
| `#badge-modal` | `<BadgeModal>` | `modalVisible`, `editData` state |
| `.help-fab` + `.help-panel` | `<HelpFab>` | `panelOpen` state |
| `.toggle-switch` | `<Toggle>` | `checked` prop + `onChange` |

---

## Part 3：共享层与原型外壳

### 外壳架构

```
┌──────────────────────────────────────────────────────┐
│  prototype-shell/index.html                          │
│  ┌──────────┬───────────────┬──────────────────────┐ │
│  │ sidebar  │  <iframe>     │  doc-panel           │ │
│  │ (shared/ │  └─ uni-app   │  (版本文档面板,      │ │
│  │  sidebar │     H5 输出   │   仍为原生 HTML)     │ │
│  │  .js)    │  或 React     │                      │ │
│  │          │     dev server│                      │ │
│  └──────────┴───────────────┴──────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### iframe 通信协议

从 iframe 内部 → 外壳：
```javascript
// uni-app / React 应用内部
window.parent.postMessage({
  type: 'screenChange',
  screen: 's2'        // 当前显示的 screen ID
}, '*');
```

外壳监听并切换文档面板：
```javascript
window.addEventListener('message', (e) => {
  if (e.data?.type === 'screenChange') {
    showDocPanel(e.data.screen);
  }
});
```

外壳 → iframe（hash 路由同步）：
```javascript
window.addEventListener('hashchange', () => {
  const h = location.hash.slice(1);
  iframe.contentWindow.postMessage({
    type: 'hashChange',
    hash: h
  }, '*');
});
```

### shared/ 目录

```
bigPlayer/shared/           # 保持不变
├── sidebar.css
├── sidebar.js
└── sidebar-data.js
```

仅由外壳引用，iframe 内的 uni-app/React 应用不引用 sidebar。

### 开发预览

| 端 | 启动命令 | 预览地址 |
|----|---------|---------|
| Client | `cd bigPlayer/client && npm run dev:h5` | localhost:5173 |
| Admin | `cd bigPlayer/admin && npm run dev` | localhost:5174 |
| 外壳预览 | 浏览器打开 `prototype-shell/index.html` | iframe src 指向 dev server |

### constraint.md 更新

两份 constraint.md 需要同步更新，增加对应框架的工程规范：

**client/constraint.md 新增：**
- 技术栈：UniApp + Vue 3 + Vite + Tailwind CSS
- 组件命名：PascalCase，`.vue` 单文件组件
- 页面路由：通过 `pages.json` 配置
- 多屏页面：组件内 `v-if` + `currentScreen` 状态切换
- 外壳通信：`postMessage` 同步 screen 切换

**admin/constraint.md 新增：**
- 技术栈：React 18 + Vite + react-router-dom
- 组件命名：PascalCase，`.jsx` 文件
- 样式：原生 CSS，className 引用，禁止 CSS-in-JS 和 UI 框架
- 弹窗：受控组件模式（`visible` + `onClose` props）
- 外壳通信：`postMessage` 同步页面状态

---

## 不在范围内

- `admin/official-website/index.html` 不迁移
- 不引入后端 API 或真实数据层
- 不改变现有的视觉设计和交互行为
- 不删除原始 HTML 文件（归档保留）
