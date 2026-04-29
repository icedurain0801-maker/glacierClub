# 资讯页设计文档

**日期：** 2026-04-22  
**文件：** `bigPlayer/client-new/news_src.html`  
**参考：** 截图（资讯 Tab 页，深色大图卡片风格）

---

## 目标

按照截图 1:1 复刻"资讯"页，新建静态 HTML 原型文件 `news_src.html`，风格与 `home_src.html` 完全一致（共享同一套 Tailwind 色彩 token、字体、图标库）。

---

## 技术栈

- 与 `home_src.html` 完全一致：Tailwind CDN + Material Symbols Outlined + Google Fonts (Inter / Manrope)
- 纯静态 HTML，无 JS 交互
- 图片使用现有 CDN 图（`lh3.googleusercontent.com/aida-public/...`）

---

## 页面结构

### 1. 顶部固定区域

- **状态栏**：透明，静态文字「9:41 AM」居中，左侧信号/wifi 图标，右侧「100%」电池图标
- **Tab 栏**：固定顶部，白色背景，三个 Tab：
  - `官方资讯`（激活态，带图标，底部蓝色下划线）
  - `攻略大全`（带图标，非激活态）
  - `趣味栏目`（带图标，非激活态）
  - 右侧搜索图标（`search`）

### 2. 排序行

- 内容区顶部，右对齐：`↕ 最新`（文字 + 排序图标）

### 3. 卡片列表（3 张）

每张卡片布局：
- 全宽圆角大图（`rounded-xl`，`aspect-[16/9]`），游戏场景图
- 游戏名称叠加在图片上（白色加粗，带黑色文字阴影，居中偏下）
- 第 3 张卡片额外叠加：播放按钮圆圈 + 时长文字（`▶ 00:34`）
- 卡片下方文字区：
  - 文章标题（2 行截断）
  - 第二行：日期 / 作者名，右侧点赞数（❤ 图标）+ 评论数（💬 图标）

三张卡片内容：
| # | 游戏名 | 文章标题 | 日期 | 作者 | 点赞 | 评论 |
|---|--------|----------|------|------|------|------|
| 1 | 安塔茶话会 | 互动有礼 \| 超能道具大作战第6期 | 04/17 | 安塔 | 865 | 1881 |
| 2 | 超能情报站 | 超能情报站 \| 五一活动即将开启，假日好礼等你解锁 | 04/15 | 策划阿哲 | 702 | 177 |
| 3 | 狩魂者（视频）| 超能情报站 \| 『狩魂者-蛮古』技能详情公开！ | 04/14 | 策划阿哲 | 725 | 191 |

### 4. 底部固定导航栏

5 个 Tab，白色背景，顶部细线分隔：
- 首页（`home` 图标，非激活）
- 资讯（`article` 图标，激活，蓝色）
- +（加号，大，圆形，主色按钮）
- 玩家圈（`group` 图标，非激活）
- 我的（`person` 图标，非激活，右上角红色 badge 数字"2"）

---

## 视觉规范

- 卡片背景：`bg-surface-container-lowest`，圆角 `rounded-xl`，轻阴影
- 游戏名叠加文字：`text-white font-bold text-xl`，`drop-shadow-lg`，渐变蒙层（`bg-gradient-to-t from-black/50 to-transparent`）
- 激活 Tab：`text-primary font-bold`，底部 `border-b-2 border-primary`
- 排序文字：`text-on-surface-variant text-sm`
- 点赞/评论图标：`text-on-surface-variant text-sm`
- badge：`bg-red-500 text-white text-[10px] rounded-full w-4 h-4`

---

## 文件交付

- 新建：`bigPlayer/client-new/news_src.html`
- 不修改任何已有文件
- F5 launch.json 已支持 `${file}` 变量，直接打开该文件按 F5 即可预览
