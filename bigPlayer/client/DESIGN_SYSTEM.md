# BigPlayer Client — Design System

适用页面：`home/home.html`、`news/news_post.html`、`news/news_feed.html`  
技术栈：**Tailwind CSS**（cdn）+ **Material Symbols Outlined**（Google Fonts）+ **Manrope / Inter**（Google Fonts）

---

## 1. 颜色

### 主色

| Token | 值 | 用途 |
|---|---|---|
| `primary` | `#0061a4` | 主操作按钮、active 图标、LV 徽章背景、Follow 点 |
| `primary/10` | `rgba(0,97,164,0.10)` | LV 徽章文字底色 |
| `primary-dim` | `#005590` | hover/press 状态 |
| `inverse-primary` | `#2498f5` | 深色背景反显 |

### 表面 / 背景

| Token | 值 | 用途 |
|---|---|---|
| `background` / `surface` | `#f7f9fb` | 页面底色 |
| `surface-container-lowest` | `#ffffff` | 卡片背景 |
| `surface-container-low` | `#f0f4f7` | 分割线底色 |
| `surface-container` | `#e8eff3` | 次要容器 |
| `surface-variant` | `#d9e4ea` | 描边替代 |

### 文字

| Token | 值 | 用途 |
|---|---|---|
| `on-surface` / `on-background` | `#2a3439` | 主文本 |
| `on-surface-variant` | `#566166` | 副文本、icon 默认色 |
| `outline` | `#717c82` | 描边、分割线 |
| `outline-variant` | `#a9b4b9` | 弱分割线 |

### 语义色

| 场景 | 颜色 |
|---|---|
| 官方认证角标 | `bg-green-50 text-green-600 border-green-100` |
| 话题达人角标 | `bg-orange-50 text-orange-600 border-orange-100` |
| 置顶 PIN 徽章 | `bg-amber-50 text-amber-600 border-amber-200` |
| 置顶区域 label | `text-purple-600`，icon `push_pin` |
| 未读消息红点 | `#ef4444`（red-500） |

### 渐变

- Hero 图片遮罩：`from-black/80 via-black/20 to-transparent`（从底部向上）
- stories 头像环：`linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)`
- 文字占位封面：`linear-gradient(135deg, #dbeafe 0%, #ede9fe 100%)`

---

## 2. 字体

```
headline: Manrope 700/800   — 大标题
body:     Inter 400/500/600 — 正文 / 副文本
label:    Inter 400/500/600 — tag / 标签 / 角标
icon:     Material Symbols Outlined
```

### 常用文字尺寸

| 层级 | size | weight | 用途 |
|---|---|---|---|
| 大标题 | `text-lg` (18px) | bold 700 | 卡片主标题 |
| 正文 | `text-sm` (14px) | medium 500 | 帖子摘要 |
| 副文本 | `text-xs` (12px) | semibold 600 | 数据数字、时间 |
| 小标签 | `text-[13px]` | medium 500 | 二级 tag、PIN 标题 |
| 角标 | `text-[10px]` | bold 700 | LV 徽章、认证角标 |
| 瀑布流标题 | `text-[11px]` | medium 500 | waterfall 卡片信息 |

---

## 3. 间距与圆角

| 元素 | 圆角 |
|---|---|
| 帖子卡片 / 全局卡片默认 | `rounded-[10px]` |
| Hero 轮播图 | `rounded-2xl` (16px) |
| 置顶区域容器 | `rounded-xl` (12px) |
| 置顶内部卡片 | `rounded-lg` (8px) |
| 关注 / 标签 pill | `rounded-full` |
| LV / 认证角标 | `rounded-full` / `rounded` (4px) |
| PIN 徽章 | `rounded-[3px]` |

卡片内边距统一 `p-4`（16px）。

---

## 4. 阴影

```css
/* 主卡片 */
box-shadow: 0 4px 16px rgba(42, 52, 57, 0.07);

/* 置顶内卡片 */
box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);

/* 瀑布流卡片 */
box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);

/* FAB Post 按钮 */
/* Tailwind: shadow-lg shadow-primary/30 */
```

---

## 5. 图标

图标库：**Material Symbols Outlined**（Google Fonts）

默认 variation settings：

```css
font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
```

Active 状态：`FILL 1, wght 500`。

### 图标用途表

| Icon name | 场景 |
|---|---|
| `home` | 底部导航：首页 |
| `explore` | 底部导航：资讯 |
| `add` | 底部导航：FAB 发帖 |
| `mood` | 底部导航：动态 |
| `person` | 底部导航：Profile |
| `thumb_up` | 帖子点赞 |
| `chat_bubble` | 帖子评论数 |
| `share` | 帖子分享 |
| `verified` | 官方认证角标 |
| `push_pin` | 置顶区域标识 |
| `search`（inline SVG） | 顶部搜索按钮 |

---

## 6. 按钮

### 关注按钮

```html
<button class="px-4 py-1.5 rounded-full bg-secondary-container text-on-secondary-container text-xs font-bold">
  关注
</button>
```

`secondary-container: #dee3ed`，`on-secondary-container: #0a5780`

### FAB（发帖）

```html
<span class="flex items-center justify-center w-12 h-12 rounded-full bg-primary shadow-lg shadow-primary/30">
  <span class="material-symbols-outlined text-white text-2xl">add</span>
</span>
```

### 标签 pill（二级 tag）

- 默认：`border border-gray-200 text-gray-500 font-medium`
- Active：`bg-gray-900 text-white border-gray-900 font-semibold`

### Sub-tab 下划线

```css
/* active */
border-bottom: 2px solid #0061a4;
font-weight: 700;
color: #1f2937;

/* inactive */
border-bottom: 2px solid transparent;
font-weight: 500;
color: #566166;
```

---

## 7. 底部导航（Bottom Nav）

共享组件：`shared/bottom-nav.js`，用法：

```html
<bottom-nav active="news" base="../"></bottom-nav>
```

```
高度: 56px (h-14)
背景: white，顶部 border-t border-slate-100
图标: 24px Material Symbols Outlined
文字: 10px font-medium
Active 色: #0061a4 (primary)，FILL 1 wght 500
Inactive 色: slate-400
```

Tab 顺序：首页 / 资讯 / Post(FAB) / 动态 / Profile

---

## 8. 卡片结构

### 普通帖子卡片（news_feed.html）

```
[头像 40×40，右下角 primary 点]  [用户名 bold + LV 角标]  [认证角标]  [日期]    [关注按钮]
[标题 text-lg bold]
[正文 text-sm medium]
[图片 3列 grid，rounded-lg overflow-hidden]
────────────────────────────────────────────────
[👍 数字]   [💬 数字]   [↗ 数字]
```

### 活动/官方卡片（news_post.html — 官方资讯 feed）

```
aspect-[10/3] rounded-2xl overflow-hidden
图片全铺 + gradient 遮罩（底部 from-black/80）
[标题 text-lg bold 白色，line-clamp-1~2]
[日期 | 作者]   [❤ 数字]   [💬 数字]
```

### 瀑布流卡片（home.html — 推荐 / 发现）

```
rounded-[10px] bg-white shadow-[0_1px_6px_rgba(0,0,0,0.08)]
[封面图 / 视频缩略图（播放圆标 + 时长角标）/ 文字占位封面]
[标题 text-[11px] font-medium line-clamp-2]
[头像 18×18]  [用户名 text-[10px]]   [❤ 数字]
```

---

## 9. Header / 顶部区域

### news_post.html（Hero 风格）

- 背景图全铺 + 高斯模糊：`filter: blur(20px) brightness(0.7)`
- 渐变叠层：`bg-gradient-to-b from-black/55 to-black/45`
- Glass Nav：`background: rgba(255,255,255,0.15); backdrop-filter: blur(10px)`
- Tab 下划线：`w-1/4 h-[3px] bg-white rounded-full`，inactive 时 `opacity-0`

### news_feed.html（纯白 Header）

- `bg-white/95 backdrop-blur-md`，`border-b border-gray-100`
- L1 Tab 下划线：`w-8 h-[3px] bg-[#1d9bf0] rounded-full`
- L2 Tag：pill 样式（见§6）

---

## 10. 置顶区域

**方案 A（news_feed.html）** — purple 主题内联列表：

```html
<div class="bg-surface-light rounded-2xl p-3 shadow-sm border border-gray-100">
  <span class="material-icons text-[13px] text-purple-600">push_pin</span>
  <span class="text-xs font-medium text-purple-600">置顶</span>
  <!-- 条目 hover:bg-purple-50 active:bg-purple-100 -->
  <span class="w-1 h-1 rounded-full bg-purple-400"></span>
  <p class="text-sm text-gray-800 truncate">标题</p>
</div>
```

**方案 B（news_post.html）** — 灰底容器 + 白色卡片：

```html
<div class="bg-gray-50 rounded-xl -mx-4 px-3 py-1 mb-2 space-y-1">
  <div class="bg-white rounded-lg px-3 py-1 flex items-center gap-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
    <span class="text-[10px] font-bold px-1.5 py-[1px] rounded-[3px] bg-amber-50 text-amber-600 border border-amber-200">PIN</span>
    <span class="text-[13px] text-gray-800 flex-1 truncate">标题</span>
    <!-- chevron-right svg -->
  </div>
</div>
```

---

## 11. 交互规范

- 触控最小目标：44px
- 按钮 press 态：`active:scale-95 transition-all`
- Tab 切换：`transition-opacity duration-200` + `pointer-events-none`
- 轮播图：infinite loop，间隔 3 s，transition 500 ms ease-in-out
- 无限滚动列表：隐藏滚动条 `no-scrollbar`（`::-webkit-scrollbar { display: none }`）
- 安全区：`padding-bottom: env(safe-area-inset-bottom)`
- 图片全部来自外部 CDN（`opsoss.q1.com` 或 picsum），离线不可用

---

## 12. 开发工作流约定

### 变体 / Demo 文件存放规则

**未经确认，禁止直接写入 `client/` 目录下的正式页面。**

| 阶段 | 存放位置 |
|---|---|
| 变体探索 / 参考 Demo | `bigPlayer/client-new/` 或 `.temp/` |
| 经用户确认后的正式改动 | `bigPlayer/client/` |

- 所有新设计稿、交互变体、风格探索，先输出到 `client-new/` 或 `.temp/` 作为 Demo
- 用户明确确认"写进去"或"采用这个方案"后，才将内容合并进 `client/` 对应页面
- `client/` 内现有页面的改动（包括跳转链接、样式调整、内容更新）同样遵循此规则，除非改动明确且无歧义（如修复断链、错别字）
