# Client 页面模板标准化

**日期：** 2026-04-16
**范围：** `bigPlayer/client/`

## 背景

`bigPlayer/client/` 下的页面（Badge.html、home.html）都采用相同的三列布局：左侧侧边导航 | 中间 375x667 手机原型 | 右侧文档说明面板。目前没有一个标准模板文件，新建页面需要从已有页面手动复制裁剪。

## 目标

创建一个标准 HTML 模板文件 `bigPlayer/client/_template.html`，作为 client 目录下所有新页面的起始骨架。同时更新 `constraint.md` 指向该模板。

## 模板结构

### 文件：`bigPlayer/client/_template.html`

```
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  - charset UTF-8
  - viewport meta
  - title 占位（需修改）
  - sidebar.css 引入（相对路径需根据深度调整）
  - Tailwind CDN
  - <style> 块占位（页面特有样式）
</head>
<body>
  <div class="flex w-fit min-h-screen">

    <!-- 左侧：侧边导航 -->
    <nav id="sidebar" class="sidebar"></nav>

    <!-- 中间：手机原型容器 375x667 -->
    <div class="relative flex-shrink-0 w-[375px] h-[667px] ...">
      <!-- SCREEN 1（默认显示） -->
      <div id="s1"> ... 占位内容 ... </div>
      <!-- SCREEN 2（hidden，可选） -->
    </div>

    <!-- 右侧：文档说明面板 -->
    <div id="doc-panel" class="...">
      <div id="doc-s1"> ... 文档占位 ... </div>
    </div>

  </div>

  <!-- 共享脚本 -->
  <script src="路径/shared/sidebar-data.js"></script>
  <script src="路径/shared/sidebar.js"></script>
  <script>
    initSidebar({ root: '路径', currentHref: '需修改' });
  </script>
  <script> hash 路由 </script>
</body>
```

### 模板包含的功能

1. **showScreen(id)** — 屏幕切换函数（同步切换手机屏 + 右侧文档面板）
2. **data-back 返回绑定** — `[data-back]` 元素点击统一绑定
3. **版本块折叠展开** — `.doc-version-hd` 点击折叠/展开
4. **hash 路由** — `_applyHash()` + hashchange 监听

### 模板中的占位标记

以 `<!-- TODO: -->` 注释标记需要修改的位置：
- `<title>` — 页面标题
- `initSidebar({ currentHref })` — 当前页面路径
- 共享资源的相对路径（根据页面嵌套深度调整）
- 屏幕内容区域
- 文档面板内容区域

### 相对路径说明

模板文件放在 `client/` 根目录，相对路径以两层为基准（`../../shared/`）。实际使用时需根据页面所在子目录深度调整：
- `client/xxx/Page.html` → `../../shared/`
- `client/xxx/yyy/Page.html` → `../../../shared/`

## 同步更新

### constraint.md

在 "共享资源引用" 章节之前添加：

```markdown
## 页面模板

新建页面请基于 `_template.html` 模板文件复制创建：
1. 复制 `client/_template.html` 到目标目录
2. 按文件内 `<!-- TODO: -->` 注释修改占位内容
3. 根据实际嵌套深度调整 shared/ 相对路径
```

## 不做的事

- 不改动现有 Badge.html 和 home.html
- 不引入模板引擎或构建工具
- 模板仅作参考骨架，不作为运行时依赖
