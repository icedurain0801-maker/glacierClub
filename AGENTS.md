# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## 运行项目

```bash
# 推荐方式：启动本地 HTTP 服务器
cd glacierClub/prototype
python -m http.server 8080
# 访问 http://localhost:8080
```

也可以直接用浏览器打开 `glacierClub/index.html`（设置页展示）或 `glacierClub/prototype/index.html`（主原型）。

移动端预览：浏览器开发者工具 → `Ctrl+Shift+M` → 选择 375px 宽度设备（如 iPhone 6/7/8）。

## 项目结构

本仓库包含两个独立入口：

- **`glacierClub/index.html`** — 独立的设置页面展示，带手机壳外观，无 JS 依赖
- **`glacierClub/prototype/`** — 完整的五页面社区 App 原型（主要开发目标）

原型目录结构：
```
prototype/
  index.html        # 三列布局外壳（左侧导航 280px | 中心内容 375px | 右侧文档 320px）
  css/style.css     # 全部样式，移动优先，基准宽度 375px
  js/app.js         # CommunityApp 类，管理页面渲染和交互
  data/mockData.js  # 全局 mockData 对象 + requirements 数组（需求文档数据）
```

## 架构说明

### 核心模式

`app.js` 中的 `CommunityApp` 类是单页应用的核心：
- 通过 `renderPage(pageId)` 切换页面（home / news / posts / publish / profile），每次调用都会重写 `.content-body` 的 `innerHTML`
- 没有路由库，没有框架，全部原生 JS 字符串拼接 HTML
- 详情页（`viewNewsDetail`、`viewPostDetail`）也是直接替换 `.content-body`，返回按钮调用 `renderPage` 回到列表

### 数据层

`mockData.js` 在全局作用域暴露 `mockData` 对象，包含：
- `currentUser` — 用户信息
- `homepage.stats` / `homepage.hotTopics` — 首页数据
- `news[]` / `posts[]` / `comments[]` — 列表数据

`requirements` 数组是需求文档内容，由 `index.html` 中的右侧文档面板读取并渲染。

### 样式约定

- 主内容宽度固定 375px，不随视口变化
- 字体基准：主标题 18px、副标题 16px、正文 12px、辅助文本 11px
- 主色调：`#ff6b6b`（红）、左侧导航/主文本：`#2c3e50`
- 触控目标最小 44px（移动标准）
- 992px 以下媒体查询会隐藏右侧文档面板，切换单列布局

## 团队协作规范

### 文档目录约定

| 文档类型 | 存放路径 |
|----------|----------|
| 变更文档 / 发版文档 | `.Codex/docs/yyyy-MM/yyyy-MM-dd/` |
| 临时文件 | `.temp/`（已加入 .gitignore） |
| 测试脚本 | `.tests/yyyy-MM/yyyy-MM-dd/` |

### 每次需求开发完成后

在对应日期目录下创建变更文档：

```
.Codex/docs/2026-03/2026-03-31/v001_changelog.md
```

### 发版流程

1. 更新项目版本号配置文件
2. 根据 changelog 和上次合并后的变更内容，撰写 PR 合并文档：`vXXX_PR_DESCRIPTION.md`
3. 撰写对外发布的站内信：`vXXX_sitemessage.md`
4. 三个文件均保存至当次发版日期目录下

### 临时文件

不得在根目录创建临时文件，统一放入 `.temp/` 目录，`.gitignore` 中已忽略该目录。

**禁止在任何业务项目目录（如 `bigPlayer/`、`SDK/`、`glacierClub/` 等）下创建 `.temp/` 或临时文件**。所有临时文件、探索性 Demo、一次性脚本一律放到仓库根目录的 `.temp/` 下，按需再分子目录。业务目录只保留正式产出物。

---

## 需要注意

- 图片资源全部来自外部 CDN（`opsoss.q1.com`），离线状态下图片不可用
- 评论提交、发帖提交目前只有 `alert()` 占位，没有实际后端
- `mockData.js` 必须在 `app.js` 之前加载（`index.html` 中已保证顺序）
