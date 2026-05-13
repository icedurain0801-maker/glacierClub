# BigPlayer Overseas Design System

> 海外版设计规范，以 `home-en.html` 为基准制定。
> **适用范围：`bigPlayer/client/overseas/` 下所有页面（home / feed / news / profile / publish 等全部 -en.html 页面）。**
> 任何新增的统一规范都只更新本文件，不再维护其它位置的设计规范片段。

---

## 1. Color Palette（配色）

### Primary Colors

| Token | Hex | Usage |
|---|---|---|
| `primary` | `#0061a4` | CTA 按钮、选中态、主要强调色 |
| `primary-dim` | `#005590` | Primary 按压态 |
| `inverse-primary` | `#2498f5` | 深色背景上的 Primary 强调、Rating 数值 |

### Surface Colors

| Token | Hex | Usage |
|---|---|---|
| `background` / `surface` | `#f7f9fb` | 页面背景 |
| `surface-container-lowest` | `#ffffff` | 卡片背景 |
| `surface-container-low` | `#f0f4f7` | 次级容器、禁用态背景 |
| `surface-container` | `#e8eff3` | 分隔线填充 |
| `surface-container-high` | `#e1e9ee` | 导航栏边框 |
| `surface-container-highest` | `#d9e4ea` | Surface Variant |
| `surface-variant` | `#d9e4ea` | Story 未看环、分隔 |

### Text Colors

| Token | Hex | Usage |
|---|---|---|
| `on-surface` | `#2a3439` | 主正文、标题 |
| `on-surface-variant` | `#566166` | 次级文字、标签 |
| `outline` | `#717c82` | 辅助文字 |
| `outline-variant` | `#a9b4b9` | 占位符、禁用文字 |

### Semantic / Accent

| Token | Hex | Usage |
|---|---|---|
| `secondary-container` | `#cbe6ff` | 浅蓝背景强调块 |
| `on-secondary-container` | `#0a5780` | 蓝色强调块内文字 |
| Announcement BG | `#eff6ff` | 公告条背景 |
| Topic Badge BG | `#fef3c7` | 话题标签背景 |
| Topic Badge Border | `#fbbf24` | 话题标签边框 |
| Topic Badge Text | `#b45309` | 话题标签文字 |
| Dark Card BG | `#0f1c27` | 推荐卡片深色主体 |

### Semantic State

| Token | Hex | Usage |
|---|---|---|
| `--error` | `#e53935` | 错误文字、退出登录、删除提示 |
| `--state-success` | `#2e7d32` | 成功态绿底（群标签、已发送） |
| `--state-online` | `#4caf50` | 在线状态点 |
| `--state-badge-red` | `#f44336` | 未读数红点底色 |
| `--like-color` | `#ff4757` | 点赞激活态（icon、计数文字、+1 弹字） |
| `--ps-published` | `#0a8a5a` | Post 已发布 |
| `--ps-failed` | `#e53935` | Post 失败（同 `--error`） |
| `--ps-deleted` | `#ff6b35` | Post 已删 |
| `--rank-1-fg` | `#dc2626` | 热搜榜 #1 |
| `--rank-2-fg` | `#ea580c` | 热搜榜 #2 |
| `--rank-3-fg` | `#ca8a04` | 热搜榜 #3 |
| `--rank-hot-bg` | `#fee2e2` | 高热度徽章底 |
| `--rank-warm-bg` | `#ffedd5` | 中热度徽章底 |
| `--tag-important` | `#e53935` | 通知「重要」标签 |
| `--tag-event` | `#388e3c` | 通知「活动」标签 |
| `--tag-policy` | `#7b1fa2` | 通知「政策」标签 |
| `--tag-amber-fg` | `#b88000` | 琥珀色 tag 文字 |

### Overlay / Effect

| Token | Value | Usage |
|---|---|---|
| `--island-bg` | `#000`（暗色固定） | feed/news 顶部黑色胶囊状态条 |
| `--overlay-cover-strong` | `rgba(10,15,20,0.88)` | 封面顶部强遮罩 |
| `--overlay-cover-weak` | `rgba(10,15,20,0.30)` | 封面底部弱遮罩 |
| `--divider-soft` | `#e8edf0` | 卡片细分隔线、评论卡边框 |
| `--device-bezel-dark` | `#1a1a1a` | 手机壳外圈（chat 等） |

---

## 2. Typography（字体）

### Font Families

| Role | Family | Import |
|---|---|---|
| Headline | **Manrope** (700, 800) | Google Fonts |
| Body | **Inter** (400, 500, 600) | Google Fonts |
| Label | **Inter** (400, 500) | Google Fonts |

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Manrope:wght@700;800&display=swap" rel="stylesheet"/>
```

### Font Scale

| Level | Size | Weight | Family | Usage |
|---|---|---|---|---|
| Display | 26px | 900 | Manrope | Rating 大数字 |
| Headline L | 17px | 800 | Manrope | 卡片主标题（深色卡片） |
| Headline M | 14px | 700 | Inter | 帖子标题、卡片标题 |
| Label L | 15px | 700 | Manrope | CTA 按钮文字 |
| Body M | 12px | 400 | Inter | 正文描述 |
| Label M | 11px | 500–700 | Inter | 标签、元信息、类目 |
| Caption | 10px | 500–700 | Inter | 底导标签、等级 Badge、图标标签 |

---

## 3. Icons（图标）

**图标库：Material Symbols Outlined（可变字体）**

```html
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
```

**默认变体设置：**

```css
.material-symbols-outlined {
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}
```

**激活态（底导选中）：**

```css
font-variation-settings: 'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24;
```

| 用途 | 图标名 | 尺寸 |
|---|---|---|
| 底导 | home / explore / add / article / person | 24px |
| 发布按钮 | add | 22px |
| 搜索 | search | 20px |
| 通知 | notifications | 20px |
| 公告 | campaign | 16px |

---

## 4. Spacing & Layout（间距与布局）

### 屏幕基准

- 手机壳宽度：**375px**，高度：**812px**（iPhone X 标准）
- 内容水平 margin：**12px**
- 内容间距（卡片间）：**10–14px**

### 圆角规范

| Token | Value | Usage |
|---|---|---|
| `DEFAULT` | `1rem (16px)` | 基础卡片、容器 |
| `lg` | `2rem (32px)` | 大容器 |
| `xl` | `3rem (48px)` | 手机壳外框 |
| `full` | `9999px` | 胶囊按钮、头像、圆形按钮 |
| Card | `12–16px` | 内容卡片 |
| Tag/Badge | `4–6px` | 标签、chip |
| Quick Icon | `10px` | 快捷入口图标背景 |

---

## 5. Components（组件规范）

### Bottom Navigation Bar

- 高度：`82px`，`padding-top: 8px`
- 背景：`rgba(255,255,255,0.96)` + `backdrop-filter: blur(14px)`
- 边框：`border-top: 1px solid #e1e9ee`
- 默认图标色：`#a9b4b9`；选中色：`#0061a4`
- 发布按钮：`46×46px` 圆形，`background: #0061a4`，`box-shadow: 0 4px 14px rgba(0,97,164,0.38)`，`margin-top: -10px`（上浮）

### Story Ring

- 尺寸：`58×58px`，`padding: 2.5px`
- 已看渐变：`linear-gradient(135deg, #0061a4, #2498f5)`
- 未看：`#d9e4ea`
- 内部头像白边：`border: 2.5px solid #fff`
- 加号：`18×18px`，`background: #0061a4`，`border: 2px solid #fff`

### Featured Card（横滑卡片）

- 宽：`252px`，`flex-shrink: 0`
- 圆角：`14px`
- 封面高：`138px`，`object-fit: cover`
- 阴影：`0 2px 12px rgba(42,52,57,0.08)`
- 按压：`scale(0.975)`

### Top Recommendation Card（深色推荐卡）

- 外边距：`0 12px 14px`，圆角：`16px`
- 封面高：`196px`
- 主体背景：`#0f1c27`，内边距：`14px 14px 16px`
- CTA 按钮：胶囊形，`background: #0061a4`，`font: Manrope 700 15px`

### Community Post Card

- 外边距：`0 12px 10px`，内边距：`14px`
- 背景：`#fff`，圆角：`12px`
- 阴影：`0 1px 6px rgba(42,52,57,0.07)`
- 封面高：`148px`，圆角：`10px`
- 按压：`scale(0.99)`

### Announcement Strip

- 背景：`#eff6ff`，圆角：`10px`
- 左边框：`3px solid #0061a4`
- 内边距：`10px 13px`

### Badges

**Official Badge**

```css
background: linear-gradient(135deg, #0061a4, #2498f5);
color: #fff; font-size: 10px; font-weight: 700;
border-radius: 4px; padding: 1px 5px;
```

**Topic Badge**

```css
background: #fef3c7; color: #b45309;
border: 1px solid #fbbf24;
font-size: 10px; font-weight: 700;
border-radius: 4px; padding: 1px 5px;
```

### Follow Buttons

**Filled（次要）：**

```css
background: #f0f4f7; color: #566166;
border-radius: 6px; padding: 4px 10px;
font-size: 11px; font-weight: 700;
```

**Outline（主要关注）：**

```css
border: 1.5px solid #0061a4; color: #0061a4;
border-radius: 999px; padding: 5px 14px;
font-size: 12px; font-weight: 700;
```

### Tab Bar（内容分类）

- 激活：`font-weight: 700; color: #1f2937; border-bottom: 2.5px solid #0061a4`
- 默认：`font-weight: 500; color: #566166; border-bottom: 2.5px solid transparent`
- 水平 padding `16px`，tab 之间 gap `24px`

---

## 5b. Page-specific Components（页面专属组件）

> 以下组件仅在部分页面出现，但样式约定全平台一致；新增同类组件时参照这里的命名与尺寸。

### 详情页（home/post-detail、home/mood-detail）

**Image Carousel**：单帧宽 `calc(100% - 42px)`，圆角 `14px`；overlay 顶 `--overlay-cover-strong`、底 `--overlay-cover-weak`。
**Carousel Dot**：默认 `5×5px`、激活 `14×5px`，圆角 `3px`。
**Image Swiper Counter**：右上角胶囊 `1/9`，背景 `rgba(0,0,0,0.45)`、文字白 11px；滑动阈值 `40px`。
**Like Button**：胶囊形，默认边框 `--like-border (#ffb89a)`、按下渐变 `--like-grad-from #fff5f0` → `--like-grad-to #ffe4d6`；触发 confetti 粒子动画（粒子色板由组件内部维护，不在全局 token）。

### 搜索页（home/search、home/search-results）

**Hot Trending List**：rank 1/2/3 文字色对应 `--rank-1-fg/2-fg/3-fg`；高/中热度徽章底用 `--rank-hot-bg/--rank-warm-bg`。
**History Chip**：胶囊 + 关闭 icon，按压 `scale(0.96)`。
**Search Input (focus state)**：背景 `rgba(255,255,255,0.16)` + backdrop blur。

### Feed / News

**Top Island**：顶部黑色胶囊状态条；背景 `--island-bg`、文字 `--on-primary`。
**Hero Carousel**：复用详情页 carousel 体系。
**Pinned Card**：横向布局，缩略图 `90×72px`、主体右侧文字、整卡圆角 `12px`。

### Profile

**Quick Pill (`.qpill`)**：高 `36px`，水平 padding `14px`，圆角 `18px`；内置 16px 圆形 badge。
**Avatar Level Badge**：字号 `9px`，圆角 `8px`，padding `1px 6px`。
**Post Status Badge (`.ps-*`)**：`ps-pub`=`--ps-published`，`ps-fail`=`--ps-failed`，`ps-del`=`--ps-deleted`；底色用对应色 12% 透明度。
**Comment Card with Thumb**：缩略图 `68×56`，圆角 `8`，边框 `1px var(--divider-soft)`。
**Activity Timeline**：左侧 `1px` 竖线连接器，节点 `7px` 圆点 + `1.5px` 白边。
**Navigation Drawer (`.pnav-*`)**：宽度 `280px`；浅色背景 `var(--surface-container-lowest)`、暗色需提供 `[data-theme="dark"]` 覆盖。

### 设置（profile/settings）

**Menu Row**：高 `54px`，左右 padding `16px`，右侧 chevron。
**Toggle Switch**：track 关 `--outline-variant`、开 `--primary`；knob 白色；尺寸 `44×24`。
**Account Info Pill (`.acct-pill`)**：背景 `--surface-container-low`，padding `6px 12px`。

### 聊天（profile/chat）

**Chat Bubble**：圆角 `14px`；对方背景 `--surface-container-lowest`；自己背景 `--primary`、文字 `--on-primary`；尖角通过非对称 border-radius。
**Glass Morphism Panel**：浅色 `rgba(255,255,255,0.6)` + `backdrop-filter: blur(20px)`；暗色 `rgba(13,17,23,0.6)`。
**Inspire Card Grid 2×2**：圆角 `10px`，gap `8px`，内容 emoji + 标题 + 描述。

### 通知（profile/notifications）

**Notification Badge**：最小宽 `18px`，圆角 999，背景 `--state-badge-red`，文字白 10px。
**Quick Entry Circle**：`60×60px` 圆形 icon + 下方 caption 11px。
**Friend / DM Row**：高 `64px`，左头像 `44px`；未读底色 `--row-unread-bg`（页面私有，需基于 `--secondary-container` 派生）。

### 发布（publish/post_publish、publish/mood_publish）

**Title Counter Badge**：输入框右上角 `12/30`，圆角 `10`，padding `2×8`。
**Tag Chip Toggle**：`.tag-chip.on` 主色填充、`.off` 边框态。
**Section Selector Button**：高 `32px`，胶囊。
**Formatting Toolbar**：icon 按钮网格，最小触控 `44×44`。
**Upload Zone (dashed)**：高 `160px`，虚线边 `--outline-variant`，hover 主色。
**Media Preview Grid**：每格圆角 `8`，删除按钮 `22×22`。
**Add-More Slot**：`100×100` 虚线占位。

---

## 6. CSS Framework

**用 Tailwind 的页面统一使用 Tailwind CSS（CDN）+ 自定义 CSS 类。**

```html
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
```

Tailwind 配置的颜色 Token 均已在 Section 1 中列出，直接在 `tailwind.config` 中 extend。

**纯自写 CSS 的页面（如 settings、publish 表单页）可不引入 Tailwind**，但仍须遵循本规范所有 token、字体、组件命名约定。

**页面私有 CSS 变量约束**：
- 复杂页面（chat、notifications 等）可自定义页面专属变量（`--bubble-*`、`--glass-*`、`--row-unread-bg` 等）
- **所有页面私有变量必须基于基础 token 派生**（如 `var(--primary)`、`color-mix(in srgb, var(--primary) 10%, transparent)`），不得引入新的原色 hex
- 暗色模式覆盖必须同步定义

---

## 7. Interaction Patterns（交互规范）

- 卡片按压反馈：`transition: transform 0.15s` + `:active { transform: scale(0.99 / 0.975) }`
- 按钮颜色过渡：`transition: background 0.15s`
- 滚动容器隐藏滚动条：`.no-scrollbar` + `scrollbar-width: none`
- 触控最小目标：`44px`（底导图标区域）

---

## 8. Image Resources

- 所有外部图片统一使用公共 CDN，示例：`https://images.unsplash.com/`（或项目指定 CDN）
- 封面图：`object-fit: cover`，宽度跟随容器，高度固定
- 头像：圆形 `border-radius: 50%`，`object-fit: cover`

---

## 9. Accessibility（可访问性）

- 文字与背景对比需满足 WCAG AA（4.5:1）
- 所有可交互元素最小尺寸：**44×44px**
- 图标配合文字标签使用，不单独依赖图标传达信息
- 使用语义化 HTML 标签（`<nav>`, `<button>`, `<section>`）

---

> **规范更新**：本文件随 `home-en.html` 设计迭代同步维护，每次设计变更需同步修改本文档。
