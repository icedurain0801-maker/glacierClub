# 官方资讯 · 子 Tab 栏 + 置顶帖推荐模块设计稿

## 需求背景

在 `bigPlayer/client/news/news_post.html` 的「官方资讯」tab 内容区顶部，新增两个模块：
1. **子 tab 栏**：All / Announcements / Events / Media + 排序按钮
2. **置顶帖推荐模块**（方案 B · 灰底卡片）

## 涉及文件

- `bigPlayer/client/news/news_post.html` — 唯一修改目标

## 1. 子 Tab 栏

### 位置

插入在 `<section id="tab-official">` 内的最顶部，位于 Filter/Sort 行之前。

### 结构

```
[All] [Announcements] [Events] [Media]         ↑↓ 最新
```

- 横向排列，左对齐，右侧「↑↓ 最新」保持现有排序按钮逻辑
- 整行背景 `bg-white`，底部有 `border-b border-gray-100`
- 水平可滚动（`overflow-x: auto`），隐藏滚动条

### Tab 项样式

| 状态 | 样式 |
|------|------|
| 激活 | 字色 `#1a1a1a`，`font-weight: 600`，底部 `border-b-2 border-gray-900`（2px 实线） |
| 默认 | 字色 `#999`，无底线 |
| 字号 | `12px` |
| 内边距 | `padding: 8px 10px` |

### 排序按钮

- 保留现有「↑↓ 最新」按钮，从内容区迁移到子 tab 栏右侧
- 字号 `11px`，颜色 `#999`，`margin-left: auto` 推到最右

## 2. 置顶帖推荐模块（方案 B）

### 位置

紧跟子 tab 栏之后，位于文章列表 `.space-y-4` 之前。

### 整体容器

```css
background: #f5f5f5;   /* bg-gray-50 */
padding: 10px 12px;
gap: 8px;
display: flex;
flex-direction: column;
```

### 单条置顶帖卡片

```
┌──────────────────────────────────────────┐
│ [PIN]  标题文字 one line              >  │
└──────────────────────────────────────────┘
```

- 背景 `white`，圆角 `12px`
- 阴影 `box-shadow: 0 1px 3px rgba(0,0,0,0.06)`
- 内边距 `padding: 10px 12px`
- 水平 flex，`align-items: center`，`gap: 10px`

**PIN 标签**

| 属性 | 值 |
|------|----|
| 文字 | `PIN` |
| 字号 | `10px`，`font-weight: 700`，`letter-spacing: 0.05em` |
| 背景 | `#fff7ed`（amber-50） |
| 字色 | `#d97706`（amber-600） |
| 边框 | `1px solid #fde68a`（amber-200） |
| 圆角 | `3px` |
| 内边距 | `1px 5px` |
| flex-shrink | `0` |

**标题文字**

- 字号 `13px`，颜色 `#1a1a1a`
- `flex: 1`，`min-width: 0`，`line-clamp: 1`（单行截断）

**右侧箭头**

- SVG chevron-right，`14×14px`，颜色 `#d1d5db`（gray-300）
- `flex-shrink: 0`

### 数据（mock）

共 3 条置顶帖，与现有文章列表数据保持一致：
1. 安塔茶话会 | 超能道具大作战第6期
2. 超能情报站 | 五一活动即将开启
3. 狩魂者—蛮古 | 技能详情公开

## 3. 现有 Filter/Sort 行处理

子 tab 栏已包含排序按钮，移除 `<section id="tab-official">` 内原有的独立 Filter/Sort `<div>`（避免重复）。

## 4. 不涉及的范围

- 攻略大全、趣味栏目 tab 内容不变
- 轮播、主 tab 导航栏、底部导航不变
- 不新增 JS 逻辑（子 tab 点击可暂为静态 UI，排序按钮保持原状）
