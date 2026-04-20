# Client C端移动应用 — 约束文件

本文件定义 `bigPlayer/client/` 目录下所有页面必须遵守的规范。

> **本目录所有页面均为移动端 App 原型**，模拟 iOS / Android 手机界面，面向 C 端玩家用户，不支持 PC 宽屏布局。

---

## 移动端基础约束

- **目标设备**：手机（iOS / Android），基准机型 iPhone 6/7/8（375×667 pt）
- **视口固定**：原型容器宽度锁定 **375px**，高度 **667px**，不得响应式拉伸
- **触控优先**：所有可点击元素最小触控目标 **44×44px**（符合 Apple HIG / Material 标准）
- **不使用 hover 样式**：移动端无 hover 状态，交互反馈改用 `active:opacity-80` 或 `active:scale-95`
- **手势约定**：返回操作统一使用页面内 `‹` 返回按钮，不依赖浏览器返回
- viewport meta 须设置：`<meta name="viewport" content="width=device-width, initial-scale=1.0">`

## 原型外壳布局（展示用）

页面在浏览器中以"手机放在桌面"形式呈现，整体三列结构：
- 左侧：通用侧边导航 `<nav id="sidebar" class="sidebar">`
- 中心：375×667 手机原型容器（`flex-shrink-0 w-[375px] h-[667px] overflow-hidden sticky top-0`）
- 右侧：文档说明面板（`id="doc-panel"`），768px 以下隐藏

手机容器样式：`rounded-lg shadow-[2px_0_16px_rgba(0,0,0,0.10)] my-5 ml-6 bg-white`

> 外壳仅为设计展示，**手机容器内部**才是真正的移动端界面，所有移动端约束针对容器内部生效。

## CSS 框架

- **使用 Tailwind CSS CDN**：`<script src="https://cdn.tailwindcss.com"></script>`
- Tailwind 不支持的样式（如 `clip-path` 伪元素、复杂渐变动画）使用 `<style>` 块补充
- 禁止引入其他 CSS 框架

## 共享资源引用（必须）

每个页面底部 `</body>` 前按顺序引入，并在 `initSidebar` 后追加 hash 路由支持：
```html
<script src="../../../shared/sidebar-data.js"></script>
<script src="../../../shared/sidebar.js"></script>
<script>
  initSidebar({
    root: '../../..',
    currentHref: 'client/xxx/PageName.html'  // 修改为当前页面路径
  });
</script>
<script>
  function _applyHash() {
    const h = location.hash.slice(1);
    if (h && document.getElementById(h)) showScreen(h);
  }
  _applyHash();
  window.addEventListener('hashchange', _applyHash);
</script>
```
样式引入：`<link rel="stylesheet" href="../../../shared/sidebar.css">`

> 注意：相对路径层级根据页面实际位置调整。

## 色彩规范

| 用途 | 颜色值 |
|------|--------|
| 主色（按钮、激活、强调） | `#3ab4e8` |
| 主色渐变（顶栏背景） | `linear-gradient(180deg, #3ab4e8 0%, #5ec8f0 40%, #c8e8f8 80%, #eaf4fb 100%)` |
| 页面背景 | `#f0f6fb` 或 `#f0f4f8` |
| 主要文字 | `#1a2233` / `#333` |
| 次要文字 | `#555` / `#666` |
| 辅助文字 | `#888` / `#aaa` |
| 危险/删除 | `#ff4d4f` |
| 成功 | `#52c41a` / `#2ec87a` |
| 警告/升级标记 | `#ff9500` |
| 奖品/礼包标记 | `#ff6b35` |
| 白色卡片背景 | `#ffffff` |
| 卡片边框 | `#e8e8e8` / `#e8ecf0` |

## 屏幕切换模式（多屏页面必须）

多个"页面"（Screen）写在同一个 HTML 文件内，通过 JS 控制 `display` 切换：

```javascript
function showScreen(id) {
  const screens = ['s1', 's2', 's3', /* ... */];
  screens.forEach(sid => document.getElementById(sid)?.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  // 同步切换右侧文档面板
  screens.forEach(sid => document.getElementById('doc-' + sid)?.classList.add('hidden'));
  document.getElementById('doc-' + id)?.classList.remove('hidden');
  document.getElementById('doc-panel').scrollTop = 0;
}
```

- 每个屏幕 `<div id="sN">` 默认第一屏显示，其余加 `class="hidden"`
- 返回按钮使用 `data-back="sN"` 属性，统一绑定：`document.querySelectorAll('[data-back]').forEach(el => el.addEventListener('click', () => showScreen(el.dataset.back)))`
- Hash 路由：`location.hash` 变化时调用 `showScreen`，支持直接访问指定屏幕

## 导航栏规范

- 状态栏高度占位：`pt-11`（约 44px，模拟手机状态栏）
- 返回按钮：`text-[22px]` 的 `‹` 符号，`w-7 flex-shrink-0`
- 标题：`text-[17px] font-semibold` 居中
- 颜色：白色文字，渐变蓝色背景

## 组件规范

### 徽章图标形状
- 活跃成就类：五边形 `[clip-path:polygon(50%_0%,97%_34%,79%_97%,21%_97%,3%_34%)]`
- 社交/传播类：圆形 `rounded-full`
- 展示槽（空槽）：六边形 `[clip-path:polygon(50%_0%,93.3%_25%,93.3%_75%,50%_100%,6.7%_75%,6.7%_25%)]`

### 徽章级别渐变
| 级别 | 渐变 |
|------|------|
| 普通 | `linear-gradient(145deg, #c89850 0%, #7a5020 60%, #4a3010 100%)` |
| 珍贵 | `linear-gradient(145deg, #f5c842 0%, #e09800 100%)` |
| 稀有 | `linear-gradient(145deg, #b27fdb 0%, #6a1faa 100%)` |
| 史诗 | `linear-gradient(145deg, #f07070 0%, #c01010 100%)` |
| 传奇 | `linear-gradient(145deg, #70b8ff 0%, #0060d0 100%)` |
| 未获得 | `linear-gradient(145deg, #d4d4d4 0%, #b0b0b0 100%)` |

### 分类 Tab 条
- 激活：`bg-[#3ab4e8] text-white font-medium rounded-[14px] px-3 py-1`
- 未激活：`text-[#666] rounded-[14px] px-3 py-1`

### 按钮
- 主操作按钮：`bg-[#3ab4e8] text-white rounded-[25px] py-3.5 text-base font-medium`
- 次操作按钮：`border border-[#ddd] bg-white rounded-[22px] py-[11px] text-sm text-[#555]`，hover `border-[#3ab4e8] text-[#3ab4e8]`

## 右侧文档面板规范

- 宽度 `min-w-[300px] max-w-[480px]`，768px 以下隐藏（`max-[768px]:hidden`）
- 按屏幕对应 `id="doc-sN"` 分块，随屏幕切换同步切换
- 版本块可折叠，最新版本默认展开并标注「最新」badge
- 颜色：主标题 `#1a2233`，版本号 `#1a2233`，日期 `#aaa`，badge `#3ab4e8`

## 字体规范

- 导航/标题：14–17px
- 正文：13px
- 辅助/标签：11–12px
- 行高：`leading-relaxed`（1.625）或 `leading-[1.8]` / `leading-[1.9]`

## 移动端交互规范

- **触控反馈**：按钮点击反馈使用 `active:opacity-80` 或 CSS `transition`，不得依赖 hover
- **滚动区域**：超出手机容器高度的内容须设置 `overflow-y: auto`，禁止整页拉伸超出 667px
- **安全区域**：顶部状态栏占位 `pt-11`（44px），底部操作区预留 `pb-4`（避开 Home 指示条区域）
- **列表间距**：列表项垂直间距不低于 8px，防止触控误触相邻项
- **输入框**：避免在手机容器内使用复杂的多列表单，单列排列为主
- **弹窗**：弹窗宽度不超过 `300px`（容器宽度的 80%），垂直居中，不得全屏遮盖导航栏

## 禁止事项

- 不得将手机原型宽度改为响应式（必须固定 375px）
- 不得省略 Hash 路由逻辑（破坏直链访问能力）
- 不得省略 `initSidebar` 调用
- 不得在页面内引入除 Tailwind CDN 外的其他 CSS 框架
- 不得在手机容器内使用 PC 端 hover 样式（`:hover` 伪类）
- 不得将触控目标设置为小于 44×44px（图标按钮须用 padding 撑大点击区域）
- 图片资源统一使用外部 CDN（`opsoss.q1.com`），不得将图片放入项目目录
