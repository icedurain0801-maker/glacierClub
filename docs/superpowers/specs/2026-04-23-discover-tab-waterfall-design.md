# 「发现」Tab 瀑布流设计规格

## 背景

首页 `bigPlayer/client/home/home.html` 现有四个 Tab：关注 / 发现 / 推荐 / 攻略站。当前「发现」tab 无独立样式，点击无内容切换效果。本次需求：点击「发现」时，Tab 下方内容区切换为两列瀑布流布局。

**严格约束**：Banner 区域（大图+经验值+功能图标栏）及 Tab 导航栏本身，在任何 tab 切换时完全不变。

---

## 交互规则

- 默认激活 tab：**推荐**（现状保持）
- 点击「发现」→ 下方内容区替换为瀑布流
- 点击「推荐」→ 恢复原有「热门快讯 + 为您推荐」内容
- 点击「关注」「攻略站」→ 可显示占位内容（本期不做实现）
- 切换时无动画，直接 display 切换

**实现方式**：给 `.phone-inner`（或 `<main>`）添加 `data-tab` 属性，JS 监听 tab 点击更新该属性，CSS 通过属性选择器控制各内容区域的显示/隐藏。

```html
<!-- Tab 按钮加 onclick -->
<div ... onclick="switchTab('discover')">发现</div>

<!-- 两块内容区 -->
<div data-tab-panel="recommend"> ... </div>  <!-- 默认显示 -->
<div data-tab-panel="discover" style="display:none"> ... </div>
```

```js
function switchTab(tab) {
  document.querySelector('.phone-inner').dataset.tab = tab;
  // 更新 tab 激活样式
}
```

```css
[data-tab="discover"] [data-tab-panel="recommend"] { display: none; }
[data-tab="discover"] [data-tab-panel="discover"]  { display: block; }
```

---

## 瀑布流布局

- **列数**：两列，`display: grid; grid-template-columns: 1fr 1fr; gap: 6px`
- **右列初始偏移**：`margin-top: 14px`，产生自然错位的瀑布流视觉节奏
- **外间距**：`padding: 6px 6px 80px`（底部留出 bottom nav 空间）

---

## 卡片规格

### 有封面图的帖子

```
┌──────────────────────┐
│   封面图（全宽）        │  ← object-fit: cover，高度随图片比例自然撑开
│  [▶ 播放角标] [时长]   │  ← 仅视频帖显示
├──────────────────────┤
│ 标题（最多2行截断）     │
│ [头像] 昵称   [♡ 696] │  ← 同一行，昵称 flex:1 ellipsis，点赞靠右
└──────────────────────┘
```

- **圆角**：`border-radius: 10px`
- **阴影**：`box-shadow: 0 1px 6px rgba(0,0,0,0.08)`
- **内边距（info 区）**：`padding: 7px 8px 8px`
- **标题**：`font-size: 11px; font-weight: 500; line-height: 1.4; -webkit-line-clamp: 2`
- **头像**：`18×18px, border-radius: 50%`
- **昵称**：`font-size: 10px; font-weight: 600; flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis`

### 无封面图的帖子

封面区替换为**文字大图化占位**：

```
┌──────────────────────┐
│  渐变色背景            │  ← 4种渐变按 post.id % 4 轮换
│  正文首句（大字）       │  ← font-size:13px; font-weight:700; color:#1e3a5f
├──────────────────────┤
│ 标题（最多2行）        │
│ [头像] 昵称   [♡ 452] │
└──────────────────────┘
```

**4种占位渐变**（按帖子 id 轮换）：
1. `linear-gradient(135deg, #dbeafe 0%, #ede9fe 100%)` — 蓝紫
2. `linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)` — 黄
3. `linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)` — 绿
4. `linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%)` — 粉

### 视频角标（仅视频帖）

- **播放按钮**：`32×32px` 半透明黑圆，居中叠在封面上，内含白色三角
- **时长 badge**：右下角，`background: rgba(0,0,0,0.62); color: white; font-size: 9px; padding: 2px 5px; border-radius: 4px`

---

## 点赞按钮规格

### 未点击状态
- `background: #fdf4ef`（极浅米橙）
- `color: #f0a070`（浅橙文字）
- `border: none`
- `box-shadow: none`
- 心形图标：`♡`（空心）

### 已点击状态
- `background: linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)`
- `color: #ffffff`
- `box-shadow: 0 2px 8px rgba(255,107,53,0.45)`
- 心形图标：`♥`（实心）
- 整体 `transform: scale(1.08)`，心形 `scale(1.2)`

### 动画
- `transition: all 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)`（弹跳感）

### 尺寸
- `padding: 4px 9px 4px 7px; border-radius: 999px; font-size: 11px; font-weight: 700`

---

## 不变区域（严格保护）

以下内容在任何 tab 切换时**完全不改动**：

1. **Banner 大图区** — `-mt-16` 全宽图，含顶部渐变遮罩
2. **顶部导航** — `sticky top-0` 的菜单图标 + 「探索中心」标题 + 搜索图标
3. **经验值/等级区** — 「总帖子 55万」「经验值 92 LV2」「福利任务」badge
4. **功能图标栏** — 新游预约 / 排行榜 / 攻略站 / 特惠商城 / 更多，5个图标
5. **Tab 导航栏** — 关注 / 发现👍 / 推荐🔥 / 攻略站，含下划线激活态

---

## 文件影响范围

- **修改**：`bigPlayer/client/home/home.html`（唯一改动文件）
  - Tab 按钮加 `onclick` 事件
  - `<main>` 内新增 `data-tab-panel="discover"` 区块（瀑布流 HTML）
  - 原有内容区加 `data-tab-panel="recommend"` 标记
  - `<script>` 内加 `switchTab()` 函数
  - `<style>` 内加 tab 切换的 CSS 规则
- **不新增文件**

---

## Mock 数据字段（瀑布流帖子）

```js
{
  id: Number,
  hasImage: Boolean,
  isVideo: Boolean,       // 仅 hasImage:true 时有效
  duration: String,       // 如 '00:34'，仅 isVideo:true 时有效
  img: String,            // 封面图 URL
  avatar: String,         // 作者头像 URL
  user: String,           // 作者昵称
  title: String,          // 帖子标题
  firstLine: String,      // 无封面时的占位大字（正文首句）
  likes: Number,          // 点赞数
}
```
