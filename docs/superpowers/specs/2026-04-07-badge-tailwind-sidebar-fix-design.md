# Badge.html Tailwind 迁移 + 侧边栏导航修复 设计文档

**日期**：2026-04-07  
**文件**：`bigPlayer/client/profile/personalization/Badge.html`  
**范围**：两个独立子任务，一并实施

---

## 任务 A：修复侧边栏导航到 s5/s6

### 问题

`sidebar-data.js` 中三个 item（徽章墙、徽章获得通知、角色信息确认）的 `href` 均指向同一个 `Badge.html`。点击后页面重新加载，始终显示默认屏 s1，s5/s6 无法通过侧边栏直接访问。

### 方案：URL hash 跳转

**1. `bigPlayer/shared/sidebar-data.js`**

为 `徽章获得通知` 和 `角色信息确认` 两个 item 添加 `screen` 字段：

```js
{ type:'item', label:'徽章获得通知', version:'v3.0.9',
  href:'client/profile/personalization/Badge.html', screen:'s5' }

{ type:'item', label:'角色信息确认', version:'v3.0.9',
  href:'client/profile/personalization/Badge.html', screen:'s6' }
```

`徽章墙` item 不加 `screen` 字段（默认显示 s1，无需 hash）。

**2. `bigPlayer/shared/sidebar.js`**

渲染 `<a>` 时，若 item 有 `screen` 字段则在 href 末尾追加 hash：

```js
a.href = root + '/' + node.href + (node.screen ? '#' + node.screen : '');
```

**3. `bigPlayer/client/profile/personalization/Badge.html`**

在现有 JS 脚本末尾（`initSidebar` 调用之后）添加启动跳转逻辑：

```js
const _hash = location.hash.slice(1);
if (_hash && document.getElementById(_hash)) showScreen(_hash);
```

### 边界条件

- hash 不存在或对应 id 不存在时，不做任何操作，页面显示默认 s1
- 页内导航（`showScreen()`）不修改 URL hash，不影响浏览器历史

---

## 任务 B：Badge.html 全量 Tailwind CSS 迁移

### 范围

- **修改**：`bigPlayer/client/profile/personalization/Badge.html`（删除 `<style>` 块，HTML 元素加 Tailwind class）
- **不修改**：`bigPlayer/shared/sidebar.css`、`sidebar.js`、`sidebar-data.js`（共用文件）

### Tailwind 引入方式

CDN（无需构建工具）：

```html
<script src="https://cdn.tailwindcss.com"></script>
```

放在 `<head>` 中 `sidebar.css` 引入之后。

### 样式迁移规则

| 原 CSS 写法 | Tailwind 替代方式 |
|---|---|
| 标准颜色/间距 | 标准 utility class（`bg-white`, `p-4`, `text-sm`） |
| 自定义颜色值 | 任意值语法 `bg-[#3ab4e8]` |
| 自定义尺寸 | 任意值语法 `w-[375px]` `h-[667px]` |
| CSS 渐变 | `bg-[linear-gradient(...)]` |
| clip-path | `[clip-path:polygon(...)]`（空格用下划线） |
| `::before` 装饰竖条 | 改为显式 `<span>` HTML 元素 |
| `position:sticky` + `top:0` | `sticky top-0` |
| `flex:1` | `flex-1` |
| `overflow-y:auto` | `overflow-y-auto` |
| `transition` | `transition-all duration-150` 等 |

### 布局结构（保持不变）

```
body (flex justify-center min-h-screen)
└── .page-wrapper (flex w-fit min-h-screen)
    ├── nav#sidebar.sidebar            ← 220px 深色侧边栏，sidebar.css 管理
    ├── .phone-shell                   ← 375×667px 固定，sticky top-4
    │   ├── #s1 ~ #s6 (.screen)       ← 每次只显示一个 active
    └── .doc-panel                     ← 300–480px，sticky top-0
        └── #doc-s1 ~ #doc-s6         ← 与 screen 同步显示
```

### 需要保留的非 Tailwind 样式

以下样式无法直接用 Tailwind class 表达，通过 `style=""` 内联或 `<style>` 内保留最小集：

1. **`.screen { display:none }` / `.screen.active { display:flex }`**：JS 依赖这组 class 切换显示，用 Tailwind `hidden` 替代 `display:none`，`active` 时手动加 `flex`
   - 方案：`showScreen()` 改为操作 `hidden` class（`classList.add('hidden')` / `classList.remove('hidden')`）
2. **`clip-path` polygon**：Tailwind 任意值语法支持，无需内联
3. **`#s4::before` 伪元素光晕效果**：Tailwind 不支持伪元素任意值，保留为 `<style>` 中最小片段，或改为额外 `<div>` 元素

### JS 变更

`showScreen()` 函数从操作 `.active` class 改为操作 Tailwind 的 `hidden` class：

```js
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  document.querySelectorAll('.doc-panel-inner').forEach(d => d.classList.add('hidden'));
  const doc = document.getElementById('doc-' + id);
  if (doc) doc.classList.remove('hidden');
  document.querySelector('.doc-panel').scrollTop = 0;
}
```

初始状态：s1 和 doc-s1 无 `hidden`，其余所有 screen/doc-panel-inner 有 `hidden`。

---

## 实施顺序

1. 修改 `sidebar-data.js`（加 screen 字段）
2. 修改 `sidebar.js`（追加 hash）
3. 重写 `Badge.html`：
   a. 引入 Tailwind CDN
   b. 删除 `<style>` 块，保留 `#s4::before` 最小片段
   c. 全量替换 HTML class 为 Tailwind
   d. 更新 `showScreen()` 使用 `hidden`
   e. 添加 hash 启动跳转

---

## 不在范围内

- `changelog.html` 不迁移
- `sidebar.css` / `sidebar.js` / `sidebar-data.js` 的样式部分不迁移
- 不引入任何构建工具或 npm 包
- 不新增功能，不修改现有交互逻辑
