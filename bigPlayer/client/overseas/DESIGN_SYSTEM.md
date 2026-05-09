# BigPlayer Overseas Design System

> 海外版设计规范，以 `home-en.html` 为基准制定。  
> 所有 `overseas/` 目录下的页面必须遵循本规范。

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

---

## 6. CSS Framework

**使用 Tailwind CSS（CDN）+ 自定义 CSS 类。**

```html
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
```

Tailwind 配置的颜色 Token 均已在 Section 1 中列出，直接在 `tailwind.config` 中 extend。

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
