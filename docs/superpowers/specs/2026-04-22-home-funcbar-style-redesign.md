# 首页功能栏样式重设计

**日期：** 2026-04-22  
**文件：** `bigPlayer/client-new/home_src.html`  
**范围：** 仅样式变更，不改文字、图标、交互逻辑

---

## 目标

将顶部功能栏（5 个入口按钮）从 Banner 内嵌区块升级为独立白色卡片，参考图示中的渐变图标 + 大按钮风格，提升游戏 App 的视觉层次感。

---

## 变更明细

### 1. 结构调整

- **原位置：** 功能栏 `<section class="grid grid-cols-5 ...">` 嵌套在 Banner 的 `.absolute.inset-0` 容器内（`div.absolute.inset-0.flex.flex-col.justify-center`）
- **新位置：** 从 Banner 内移出，在 Banner `<section>` 之后、Tab 导航之前，作为独立 `<section>` 插入

### 2. 外层卡片容器

```html
<section class="px-4 -mt-6 relative z-10">
  <div class="bg-white rounded-2xl px-4 py-4 shadow-md grid grid-cols-5 gap-2">
    <!-- 5 个按钮 -->
  </div>
</section>
```

- `-mt-6` 使卡片与 Banner 底部略微重叠，形成浮层效果
- `z-10` 保证卡片在 Banner 渐变之上

### 3. 图标按钮尺寸

- `w-11 h-11`（44px）→ `w-14 h-14`（56px）

### 4. 图标背景：渐变色替换单色

| 入口 | 原背景色 | 新渐变背景 |
|------|---------|-----------|
| 新游预约 | `bg-primary-container` | `bg-gradient-to-br from-red-400 to-orange-400` |
| 排行榜 | `bg-secondary-container` | `bg-gradient-to-br from-purple-500 to-violet-400` |
| 攻略站 | `bg-tertiary-container` | `bg-gradient-to-br from-yellow-400 to-orange-400` |
| 特惠商城 | `bg-orange-100` | `bg-gradient-to-br from-pink-400 to-rose-400` |
| 更多 | `bg-white` | `bg-gradient-to-br from-orange-400 to-amber-400` |

### 5. 图标文字颜色

- 所有图标：改为 `text-white`（在渐变背景上清晰可见）

### 6. 标签文字

- 字号：`text-[10px]` → `text-xs`
- 颜色：各处 `text-on-background` → `text-on-surface`（统一，颜色无实质差异，保持一致性）

### 7. 移除 Banner 内原有功能栏

删除 Banner `div.absolute.inset-0` 内的 `<section class="grid grid-cols-5 ...">` 及其 `mt-6` 间距。Banner 内仅保留标题、经验值展示区。

---

## 不变的内容

- 5 个入口的文字标签
- 图标种类（Material Symbols）
- `active:scale-90` 点击反馈动画
- `shadow-lg border border-white/20` 按钮阴影/边框

---

## 文件影响

- `bigPlayer/client-new/home_src.html`：唯一修改文件
