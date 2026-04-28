# 搜索结果页设计文档

**日期：** 2026-04-28  
**文件：** `bigPlayer/client/home/search-results.html`（新建）  
**入口：** 从 `search.html` 搜索后跳转，或通过热榜词点击进入

---

## 一、背景与目标

现有 `search.html` 只有搜索前状态（历史记录 + 热榜）。需要新增搜索结果页，展示搜索后的内容结果，支持 Tab 切换和无结果状态。

---

## 二、视觉风格

- **配色主题：** Style 6 Glacier Ice（冰川蓝）——延续现有蓝色主色 `#0061a4`
- **卡片样式：** V1 标准投影卡——白卡 + 轻投影（`box-shadow: 0 2px 8px rgba(0,97,164,0.07)`），与 `home.html` 卡片一致
- **顶部：** 与 `search.html` 相同的蓝色渐变顶栏 + 玻璃态搜索框（已填入关键词）
- **底色：** `#f7f9fb`

---

## 三、页面结构

```
┌─────────────────────┐
│  蓝色渐变顶栏         │  ← 返回按钮 + 已填关键词搜索框
│  玻璃态搜索框 [关键词] │
├─────────────────────┤
│  综合 │ 创作 │ 用户   │  ← Tab 栏（白底，圆角浮起）
├─────────────────────┤
│                     │
│  内容区（可滚动）     │
│                     │
└─────────────────────┘
```

---

## 四、6 个模板（Tab 状态）

### T1 — 综合 Tab · 纯文字帖
- 关键词匹配到无图帖时的默认状态
- 卡片：头像 + 用户名 + lv + 时间 + 正文文字 + 点赞/评论数

### T2 — 综合 Tab · 含图帖（主要模板）
- 与参考图最接近，图文混排
- 有图帖：头像行 + 正文 + 图片（`height: auto`，圆角 8px）+ 统计行
- 官方帖显示蓝色 `官方` 标签

### T3 — 创作 Tab
- Tab 切换后显示"全部创作"标题 + 右侧灰色条目数（如"共 326 条"）
- 卡片样式同 T2

### T4 — 用户 Tab
- 纯列表，每行：头像（32px）+ 用户名 + 关注者数 + `+关注` 胶囊按钮
- 底部分隔线，无卡片阴影
- 头像尺寸比创作卡片头像大（32px vs 22px）

### T5 — 综合 Tab · 官方置顶 + 社区分区
- 官方内容优先：独立 section 标题"官方相关"+ 官方卡片
- 其次："社区讨论"section + 普通用户帖
- 适用于有官方命中内容时

### T6 — 无结果状态
- 空状态：居中图标 🔍 + 提示文字"没有找到相关内容，换个关键词试试？"
- 下方展示"大家都在搜"热词胶囊（从热榜数据读取，最多 8 个）

---

## 五、卡片规格

```
卡片容器：
  background: #fff
  border-radius: 10px
  padding: 10px 12px
  margin-bottom: 8px
  box-shadow: 0 2px 8px rgba(0,97,164,0.07)

用户行：
  头像：22px × 22px，圆形
  用户名：11px / font-weight 600 / #1f2937
  lv + 时间：9px / #bbb
  关注按钮：9px，蓝色描边胶囊，右对齐

正文：
  11px / color #374151 / line-height 1.45
  最多显示 3 行（-webkit-line-clamp: 3）

图片（有图时）：
  width: 100%，border-radius: 8px
  height: auto（保持原比例）

统计行：
  字号 10px / color #bbb
  间距 gap: 10px
```

---

## 六、Tab 切换逻辑

- 默认激活"综合"Tab
- 点击 Tab 切换对应内容区（`data-tab` 属性驱动，与 home.html 一致）
- Tab 激活态：`font-weight 700 / color #1f2937 / border-bottom: 2px solid #0061a4`
- Tab 非激活态：`color #566166 / border-bottom: transparent`

---

## 七、用户 Tab 规格

```
用户行：
  padding: 10px 0
  border-bottom: 1px solid #f0f4f7

头像：32px × 32px，圆形
用户名：11px / font-weight 600 / #1f2937
关注者数：9px / #bbb（如"203 关注者"）
关注按钮：9px，蓝色描边胶囊，margin-left: auto
```

---

## 八、技术约束

- 复用 `search.html` 的顶部蓝色渐变样式（`.search-top` / `.input-glass`）
- 复用 `home.html` 的 Tab 切换机制（`data-tab` / `.tab-active` / `.tab-inactive`）
- 字体、Tailwind config、Material Symbols 引用与现有页面保持一致
- 图片来自外部 CDN（`opsoss.q1.com`），demo 用渐变色块占位
- 无路由依赖，原生 JS 实现 Tab 切换

---

## 九、文件交付

| 文件 | 说明 |
|------|------|
| `bigPlayer/client/home/search-results.html` | 主文件，包含全部 6 个模板状态 |

`search.html` 搜索提交后跳转到 `search-results.html?q=关键词`（URL 参数读取，JS 填入搜索框）。
