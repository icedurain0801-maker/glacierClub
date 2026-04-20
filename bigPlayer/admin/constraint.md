# Admin 后台管理系统 — 约束文件

本文件定义 `bigPlayer/admin/` 目录下所有页面必须遵守的规范。

> **本目录所有页面均为 PC 端后台管理界面**，运行于桌面浏览器，面向内部运营人员，不需要适配移动端。

---

## PC 端基础约束

- **目标设备**：桌面浏览器（Chrome / Edge），最小视口宽度 **1280px**
- **不支持移动端访问**：无需 touch 交互、无需响应式折叠，可使用 hover 状态
- **鼠标交互为主**：所有可点击元素须有 hover 样式（cursor: pointer + 颜色/边框变化）
- **信息密度**：后台允许高密度布局，字号可低至 12–13px，行高可紧凑
- viewport meta 保持默认，不得设置 `user-scalable=no`

## 布局结构

- 整体采用 `display: flex` 水平分割：左侧通用侧边导航 `<nav id="sidebar">` + 右侧 `.admin-main` 内容区
- 内容区最小高度 `100vh`，`padding: 24px`，背景色 `#f5f7fa`
- **侧边导航宽度固定**，内容区 `flex: 1`，自适应剩余宽度
- 字体栈：`-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif`

## 共享资源引用（必须）

每个页面底部 `</body>` 前按顺序引入：
```html
<script src="../../shared/sidebar-data.js"></script>
<script src="../../shared/sidebar.js"></script>
<script>
  initSidebar({
    root: '../..',
    currentHref: 'admin/xxx/PageName.html'  // 修改为当前页面路径
  });
</script>
```
样式引入：`<link rel="stylesheet" href="../../shared/sidebar.css">`

> 注意：如果页面在更深的子目录，相对路径中 `../..` 的层级需相应调整。

## 色彩规范

| 用途 | 颜色值 |
|------|--------|
| 主色（按钮、链接、激活态） | `#1890ff` |
| 主色 hover | `#40a9ff` |
| 危险/删除 | `#ff4d4f` |
| 成功/通过 | `#52c41a` |
| 警告 | `#fa8c16` |
| 页面背景 | `#f5f7fa` |
| 卡片背景 | `#ffffff` |
| 表头背景 | `#fafafa` |
| 主要文字 | `#262626` |
| 次要文字 | `#595959` |
| 禁用文字 | `#bfbfbf` |
| 边框线 | `#e8e8e8` |
| 分割线 | `#f0f0f0` |

## 组件规范

### 页面卡片
```css
.page-card { background: #fff; border-radius: 4px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); margin-bottom: 16px; overflow: hidden; }
```

### Tab 栏
- 高度由内容撑开，底部 `border-bottom: 1px solid #e8e8e8`
- 激活态：`color: #1890ff; font-weight: 500`，底部 2px 蓝色下划线
- 未激活态：`color: #595959`

### 筛选栏
- `padding: 16px 20px`，`border-bottom: 1px solid #f0f0f0`
- 筛选控件高度 32px，`border-radius: 4px`
- 必填标识用 `<span style="color:#ff4d4f">*</span>`
- 查询按钮：`background: #1890ff`，hover `#40a9ff`

### 操作栏
- `padding: 12px 20px`，`border-bottom: 1px solid #f0f0f0`
- 新增按钮样式同查询按钮
- 右侧工具图标：28×28，`border: 1px solid #d9d9d9`，hover `border-color: #1890ff; color: #1890ff`

### 表格
- `font-size: 13px`，`border-collapse: collapse`
- th：`padding: 12px`，`font-weight: 500`，`color: #262626`，`border-bottom: 1px solid #e8e8e8`
- td：`padding: 14px 12px`，`color: #595959`，`border-bottom: 1px solid #f0f0f0`
- 行 hover：`background: #fafeff`

### 分页
- `padding: 14px 20px`，`justify-content: flex-end`
- 页码按钮：28×28，`border: 1px solid #d9d9d9`，激活态 `background: #1890ff`

### 弹窗
- 遮罩：`rgba(0,0,0,0.45)`，`z-index: 1000`
- 弹窗盒：`width: 572px`，`border-radius: 8px`，`box-shadow: 0 8px 32px rgba(0,0,0,0.2)`
- 头部 `padding: 16px 20px`，标题 `font-size: 16px; font-weight: 600`
- 关闭按钮：24×24 圆形，背景 `#f0f0f0`
- 表单标签宽度 88px，右对齐，`font-size: 13px`
- 表单控件高度 34px，`border: 1px solid #d9d9d9`，focus `border-color: #1890ff`
- 底部提交按钮：`height: 36px; padding: 0 24px; border-radius: 4px`

### 表单控件（通用）
- 高度 32px（筛选栏）或 34px（弹窗内）
- `border: 1px solid #d9d9d9; border-radius: 4px; font-size: 13px`
- focus：`border-color: #1890ff; box-shadow: 0 0 0 2px rgba(24,144,255,0.15)`

### 开关（Toggle）
- 轨道尺寸：36×20，圆角 20px
- 关闭态背景 `#d9d9d9`，开启态背景 `#1890ff`
- 滑块：14×14，left=3px，开启时 `transform: translateX(16px)`

## 需求说明浮窗（标配）

每个页面右下角须配置可拖拽的需求说明浮窗（FAB），样式：
- 尺寸 120×120，`border-radius: 16px`，背景 `linear-gradient(145deg, #1890ff 0%, #096dd9 100%)`
- 点击展开右侧 480px 说明面板，支持版本折叠展开
- 面板内按版本号倒序排列需求说明

## 操作按钮规范

| 类型 | 样式 |
|------|------|
| 编辑 | `color: #1890ff`，hover `#40a9ff` |
| 删除 | `color: #ff4d4f`，hover `#ff7875` |
| 所有操作按钮 | `background: none; border: none; font-size: 13px; cursor: pointer` |

## PC 端交互规范

- **hover 状态必须**：按钮、链接、表格行、图标均须定义 hover 样式
- **cursor**：可点击元素一律 `cursor: pointer`，输入框 `cursor: text`，禁用态 `cursor: not-allowed`
- **键盘焦点**：表单控件须有 focus 样式（蓝色描边），不得用 `outline: none` 直接移除而不补充替代
- **工具提示**：图标按钮须加 `title` 属性，为鼠标悬浮提供文字说明
- **滚动**：内容超出时使用 `overflow-y: auto`，禁止用 `overflow: hidden` 截断可操作内容
- **弹窗**：大弹窗（> 572px）水平居中显示，不得全屏覆盖（保留背景可见的遮罩层）

## 禁止事项

- 不得在页面内引入外部 UI 框架（如 Bootstrap、Element UI）
- 不得内联大量重复样式，公共样式提取到 `<style>` 块顶部
- 不得省略 `initSidebar` 调用
- 不得针对移动端添加 touch 事件或 375px 断点样式
- 不得将任何 PC 页面设置为 `width: 375px` 固定宽度
- 分页、筛选等交互如无真实后端，可用 mock 数据静态展示，但需保留真实的 DOM 结构
