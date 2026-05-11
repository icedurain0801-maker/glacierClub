# 海外版社区 UI 全面变更 · 前端开发需求说明

> 版本：v1.0 · 日期：2026-05-11 · 负责产品：BigPlayer 海外版（Overseas）

---

## 一、本次变更概览

本次对海外版社区进行全面 UI 重设计，涵盖所有用户可见页面。设计稿均已完成原型，开发需 **以下列页面原型为唯一 UI 标准** 进行还原，不得沿用旧版样式。

**唯一例外**：已出品的美术 ICON（话题达人标识、官方认证标识等业务图标）保持现有资源不变，其余全部按本次原型执行。

---

## 二、变更页面清单

共 **15 个页面**，按模块分组如下。每个页面均有亮色（Light）和深色（Dark）两套模式，需同时实现。

### 2.1 首页模块（Home）

| # | 页面名称 | 对应原型文件（Light） | 对应原型文件（Dark） | 备注 |
|---|----------|----------------------|---------------------|------|
| 1 | 首页（社区主页） | `home/light/home-en.html` | `home/dark/home-en-dark.html` | 包含左侧抽屉菜单、Story 栏、推荐卡、帖子列表、底部导航 |
| 2 | 帖子详情 | `home/light/post-detail-en.html` | `home/dark/post-detail-en-dark.html` | 包含评论区 |
| 3 | 心情详情 | `home/light/mood-detail-en.html` | `home/dark/mood-detail-en-dark.html` | Mood 类型帖子详情页 |
| 4 | 搜索页 | `home/light/search-en.html` | `home/dark/search-en-dark.html` | 空态搜索框、热门搜索 |
| 5 | 搜索结果页 | `home/light/search-results-en.html` | `home/dark/search-results-en-dark.html` | 含分类 Tab、结果列表 |

### 2.2 Feed 模块

| # | 页面名称 | 对应原型文件（Light） | 对应原型文件（Dark） | 备注 |
|---|----------|----------------------|---------------------|------|
| 6 | Feed 流 | `feed/light/feed-en.html` | `feed/dark/feed-en-dark.html` | 关注动态流 |

### 2.3 资讯模块（News）

| # | 页面名称 | 对应原型文件（Light） | 对应原型文件（Dark） | 备注 |
|---|----------|----------------------|---------------------|------|
| 7 | 资讯列表 | `news/light/news-en.html` | `news/dark/news-en-dark.html` | 新闻卡片列表 |

### 2.4 个人中心模块（Profile）

| # | 页面名称 | 对应原型文件（Light） | 对应原型文件（Dark） | 备注 |
|---|----------|----------------------|---------------------|------|
| 8 | 我的主页 | `profile/light/profile-en.html` | `profile/dark/profile-en-dark.html` | 自己的主页，含数据统计、内容 Tab |
| 9 | 他人主页 | `profile/light/profile-other-en.html` | `profile/dark/profile-other-en-dark.html` | 他人主页，含关注按钮 |
| 10 | 设置页 | `profile/light/settings-en.html` | `profile/dark/settings-en-dark.html` | 账号设置 |
| 11 | 通知页 | `profile/light/notifications-en.html` | `profile/dark/notifications-en-dark.html` | 系统通知、互动通知 |
| 12 | 聊天页 | `profile/light/chat-en.html` | `profile/dark/chat-en-dark.html` | 私信对话界面 |
| 13 | 草稿箱 | `profile/light/drafts-en.html` | `profile/dark/drafts-en-dark.html` | 草稿列表 |

### 2.5 发布模块（Publish）

| # | 页面名称 | 对应原型文件（Light） | 对应原型文件（Dark） | 备注 |
|---|----------|----------------------|---------------------|------|
| 14 | 发帖页 | `publish/light/post_publish-en.html` | `publish/dark/post_publish-en-dark.html` | 图文帖子编辑器 |
| 15 | 发心情页 | `publish/light/mood_publish-en.html` | `publish/dark/mood_publish-en-dark.html` | Mood 短动态编辑器 |

> **深色模式说明**：系统跟随设备 dark mode 设置自动切换，同一页面亮色/深色为同一功能页，不计为两个页面，但两套皮肤必须完整实现。

---

## 三、美术资源说明

| 资源类型 | 处理方式 |
|---------|---------|
| 话题达人 ICON | ✅ 保留现有美术资源，不替换 |
| 官方认证 ICON | ✅ 保留现有美术资源，不替换 |
| 其他所有业务图标 | ❌ 废弃旧版，统一替换为 **Material Symbols Outlined** 图标库（见下方规范） |
| 用户头像/封面图 | 图片资源来源不变，样式（圆角、边框）按本次规范执行 |

---

## 四、前端设计规范

### 4.1 字体

#### 引入方式

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Manrope:wght@700;800&display=swap" rel="stylesheet"/>
```

#### 字体用途

| 字体族 | 权重 | 用途 |
|--------|------|------|
| **Manrope** | 700 / 800 / 900 | 所有标题、CTA 按钮文字、大数字展示 |
| **Inter** | 400 / 500 / 600 / 700 | 正文、标签、元信息、表单 |

#### 字号规范

| 级别 | 字号 | 字重 | 字体 | 使用场景 |
|------|------|------|------|---------|
| Display | 26px | 900 | Manrope | 评分大数字、数据展示 |
| Headline L | 17px | 800 | Manrope | 深色推荐卡标题、页面主标题 |
| Headline M | 14px | 700 | Inter | 帖子标题、卡片标题、列表项主文字 |
| Label L | 15px | 700 | Manrope | CTA 按钮文字、顶栏标题 |
| Body M | 12–13px | 400 | Inter | 正文描述、评论内容 |
| Label M | 11px | 500–700 | Inter | 标签文字、元信息（时间、阅读量）、分类 |
| Caption | 10px | 500–700 | Inter | 底部导航标签、等级 Badge、图标说明 |

---

### 4.2 颜色色号

#### 亮色模式（Light Mode）

##### 主色

| 用途 | 变量名 | 色号 |
|------|--------|------|
| 主色 / CTA / 选中态 | `primary` | `#0061a4` |
| 主色按压态 | `primary-dim` | `#005590` |
| 深色背景上的强调色 | `inverse-primary` | `#2498f5` |

##### 背景 & 容器

| 用途 | 色号 |
|------|------|
| 页面背景 | `#f7f9fb` |
| 卡片 / 顶栏 / 底栏背景 | `#ffffff` |
| 次级容器、禁用背景 | `#f0f4f7` |
| 分隔填充 | `#e8eff3` |
| 导航栏边框 | `#e1e9ee` |
| Surface Variant / Story 未看环 | `#d9e4ea` |

##### 文字

| 用途 | 色号 |
|------|------|
| 主文字 / 标题 | `#2a3439` |
| 次级文字 / 标签 | `#566166` |
| 辅助文字 | `#717c82` |
| 占位符 / 禁用文字 | `#a9b4b9` |
| 禁用状态浅色 | `#c8d0d5` |

##### 语义色 / 强调

| 用途 | 色号 |
|------|------|
| 蓝色强调块背景 | `#cbe6ff` |
| 蓝色强调块内文字 | `#0a5780` |
| 公告条背景 | `#eff6ff` |
| 话题标签背景 | `#fef3c7` |
| 话题标签边框 | `#fbbf24` |
| 话题标签文字 | `#b45309` |
| 深色推荐卡主体背景 | `#0f1c27` |
| 未读 Badge | `#e53935`（红色角标） |

---

#### 深色模式（Dark Mode）

##### 主色

| 用途 | 色号 |
|------|------|
| 主色 / CTA / 选中态 | `#4493f8` |
| 主色按压态 | `#3882ef` |
| 高亮强调色（评分、评级） | `#79c0ff` |

##### 背景 & 容器

| 用途 | 色号 |
|------|------|
| 页面背景 | `#0d1117` |
| 卡片 / 顶栏 / 底栏背景 | `#161b22` |
| 次级容器 | `#1c2128` |
| 分隔线 / 边框 | `#21262d` |
| Story 未看环 | `#30363d` |
| 深色推荐卡主体背景 | `#0a1520` |
| 蓝色强调块背景 | `#1f3a56` |

##### 文字

| 用途 | 色号 |
|------|------|
| 主文字 / 标题 | `#e6edf3` |
| 次级文字 | `#8b949e` |
| 辅助文字 / 禁用 | `#6e7681` |
| 白色文字（深色卡内） | `rgba(255,255,255,0.85)` |
| 弱辅助文字 | `rgba(255,255,255,0.55)` |
| 最弱辅助文字 | `rgba(255,255,255,0.45)` |

##### 语义色 / 强调（Dark）

| 用途 | 色号 |
|------|------|
| 话题标签背景 | `#2d1f06` |
| 话题标签边框 | `#d97706` |
| 话题标签文字 | `#f59e0b` |
| 未读 Badge | `#e53935` |

---

### 4.3 圆角规范

| 用途 | 圆角值 |
|------|--------|
| 手机壳外框 | `44px` |
| 大容器 / 抽屉 | `32px（2rem）` |
| 基础卡片 / 通用容器 | `16px（1rem）` |
| 内容卡片（帖子卡、新闻卡） | `12–16px` |
| 横滑 Featured Card | `14px` |
| 搜索框 / 输入框 | `8–10px` |
| 标签 / Tag / Chip | `4–6px`（方形标签）/ `999px`（胶囊标签）|
| 快捷入口图标背景 | `10–12px` |
| 头像 | `50%`（完整圆形）|
| 按钮（主要 CTA） | `999px`（胶囊形）|
| 等级 Badge | `8px` |

---

### 4.4 背景底色 & 边框规范汇总

#### 亮色模式

| 区域 | 背景色 | 边框色 |
|------|--------|--------|
| 页面整体 | `#f7f9fb` | — |
| 顶部导航栏 | `#ffffff` | `border-bottom: 1px solid #e1e9ee` |
| 底部导航栏 | `rgba(255,255,255,0.96)` + `backdrop-filter: blur(14px)` | `border-top: 1px solid #e1e9ee` |
| 内容卡片 | `#ffffff` | 无边框，仅阴影 `0 1px 6px rgba(42,52,57,0.07)` |
| 页面分隔块 | `#f0f4f7` | — |
| 输入框 | `#f0f4f7` | 无边框（激活态：`1.5px solid #0061a4`）|
| 公告条 | `#eff6ff` | `border-left: 3px solid #0061a4` |

#### 深色模式

| 区域 | 背景色 | 边框色 |
|------|--------|--------|
| 页面整体 | `#0d1117` | — |
| 顶部导航栏 | `#0d1117` | `border-bottom: 1px solid #21262d` |
| 底部导航栏 | `rgba(13,17,23,0.96)` + `backdrop-filter: blur(14px)` | `border-top: 1px solid #21262d` |
| 内容卡片 | `#161b22` | `1px solid #21262d`（部分卡片）|
| 页面分隔块 | `#161b22` | — |
| 输入框 | `#1c2128` | 无边框（激活态：`1.5px solid #4493f8`）|
| 公告条 | `#1a3a5c` | `border-left: 3px solid #4493f8` |

---

### 4.5 图标规范

#### 引入方式

```html
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
```

#### 默认样式

```css
.material-symbols-outlined {
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}
```

#### 激活态（底导选中）

```css
font-variation-settings: 'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24;
```

#### 底部导航图标对照

| 导航项 | 图标名 |
|--------|--------|
| 首页 | `home` |
| 探索/Feed | `explore` |
| 发布（中央按钮） | `add` |
| 资讯 | `article` |
| 我的 | `person` |

#### 通用图标尺寸

| 场景 | 尺寸 |
|------|------|
| 底导图标 | 24px |
| 发布中央按钮图标 | 22px |
| 搜索图标 | 20px |
| 通知图标 | 20px |
| 公告图标 | 16px |
| 顶栏操作图标 | 17–20px |

---

### 4.6 关键组件规范

#### 底部导航栏

- 高度：`82px`，`padding-top: 8px`
- 默认图标色：亮色 `#a9b4b9` / 深色 `#6e7681`
- 选中图标色：亮色 `#0061a4` / 深色 `#4493f8`
- 发布按钮：`46×46px` 圆形，亮色 `background: #0061a4` / 深色 `background: #4493f8`，`box-shadow: 0 4px 14px rgba(0,97,164,0.38)`，向上偏移 `margin-top: -10px`

#### Story 圆环

- 尺寸：`58×58px`，内边距 `2.5px`
- 已看渐变（亮色）：`linear-gradient(135deg, #0061a4, #2498f5)`
- 已看渐变（深色）：`linear-gradient(135deg, #4493f8, #79c0ff)`
- 未看（亮色）：`#d9e4ea`
- 未看（深色）：`#30363d`
- 头像内白边：`border: 2.5px solid #fff`（亮色）/ `border: 2.5px solid #0d1117`（深色）

#### 横滑推荐卡（Featured Card）

- 宽：`252px`，`flex-shrink: 0`
- 圆角：`14px`，封面高：`138px`
- 阴影：`0 2px 12px rgba(42,52,57,0.08)`
- 按压动效：`transform: scale(0.975)`

#### 深色推荐卡（Top Recommendation Card）

- 封面高：`196px`，圆角：`16px`
- 主体背景：亮色 `#0f1c27` / 深色 `#0a1520`
- 内边距：`14px 14px 16px`
- CTA 按钮：胶囊形，亮色 `background: #0061a4` / 深色 `background: #4493f8`

#### 帖子卡片（Post Card）

- 外边距：`0 12px 10px`，内边距：`14px`
- 圆角：`12px`，封面高：`148px`（封面圆角 `10px`）
- 阴影：`0 1px 6px rgba(42,52,57,0.07)`（亮色）/ `box-shadow: 0 2px 8px rgba(0,0,0,0.25)`（深色）
- 按压动效：`transform: scale(0.99)`

#### 标签 / Badge

**官方认证（保留现有美术资源，样式参考）**

```css
/* 亮色 */
background: linear-gradient(135deg, #0061a4, #2498f5);
color: #fff; font-size: 10px; font-weight: 700;
border-radius: 4px; padding: 1px 5px;

/* 深色 */
background: linear-gradient(135deg, #4493f8, #79c0ff);
```

**话题标签**

```css
/* 亮色 */
background: #fef3c7; color: #b45309;
border: 1px solid #fbbf24;
font-size: 10px; font-weight: 700;
border-radius: 4px; padding: 1px 5px;

/* 深色 */
background: #2d1f06; color: #f59e0b;
border: 1px solid #d97706;
```

#### 关注按钮

```css
/* 实心（已关注 / 次要操作）亮色 */
background: #f0f4f7; color: #566166;
border-radius: 6px; padding: 4px 10px;
font-size: 11px; font-weight: 700;

/* 线框（主要关注）亮色 */
border: 1.5px solid #0061a4; color: #0061a4;
border-radius: 999px; padding: 5px 14px;
font-size: 12px; font-weight: 700;

/* 深色对应替换：#0061a4 → #4493f8，#f0f4f7 → #161b22，#566166 → #8b949e */
```

#### Tab 栏

```css
/* 亮色激活 */
font-weight: 700; color: #1f2937;
border-bottom: 2.5px solid #0061a4;

/* 亮色默认 */
font-weight: 500; color: #566166;
border-bottom: 2.5px solid transparent;

/* 深色激活 */
color: #4493f8; font-weight: 700;
border-bottom: 2.5px solid #4493f8;

/* 深色默认 */
color: #6e7681; font-weight: 500;
```

---

### 4.7 间距 & 布局

- 页面宽度基准：**375px**（iPhone X / 14 标准宽度）
- 页面高度基准：**812px**
- 内容区水平边距：**12–16px**
- 卡片间距：**10–14px**
- 触控最小目标：**44×44px**

---

### 4.8 动效规范

| 动效类型 | CSS |
|---------|-----|
| 卡片按压 | `transition: transform 0.15s; :active { transform: scale(0.99) }` |
| 大卡按压 | `transition: transform 0.15s; :active { transform: scale(0.975) }` |
| 按钮颜色过渡 | `transition: background 0.15s` |
| 隐藏滚动条 | `scrollbar-width: none; ::-webkit-scrollbar { display: none }` |

---

### 4.9 CSS 框架

本次原型使用 **Tailwind CSS CDN + 自定义 CSS 类**，开发侧可选择 UniApp 原生样式实现，不强制使用 Tailwind，但颜色、字号、圆角等 Token 值必须与上方规范严格一致。

---

## 五、开发注意事项

1. **所有页面均需同时实现亮色和深色模式**，通过系统 `prefers-color-scheme` 自动切换，或 App 内提供手动切换入口。
2. **图标统一使用 Material Symbols Outlined**，除已明确保留的美术 ICON 外，不使用其他图标库。
3. **封面图、头像使用 `object-fit: cover`**，不得拉伸变形。
4. **底部导航栏固定在屏幕底部**，不随页面内容滚动，使用 `position: fixed` 或 UniApp 的 `tabBar` 方案。
5. **首页抽屉菜单**从左侧滑出（`transform: translateX(-280px)` → `translateX(0)`），背景蒙层 `rgba(0,0,0,0.45)`。
6. **Story 圆环渐变**为横滑可交互元素，点击跳转对应内容，样式参考 4.6 节。
7. **发布页顶栏发布按钮**初始为禁用态（灰色），输入标题/内容后激活为主色。

---

*本文档由产品设计团队出品，如有疑问请对照原型 HTML 文件，以 HTML 原型为最终视觉标准。*
