# v003 Changelog · 2026-05-28

## .temp/admin-prototype/ · Club 后台原型补全（25 个页面）

源：`bigPlayer/admin-new/club/` 下的 22 个 React 入口文件。

### 本次产出（新增 23 个页面 + 重构 2 个样本）

**内容（9）**
- `pages/board.html` — 版块管理
- `pages/content-post.html` — 帖子列表/审核
- `pages/content-comment.html` — 评论列表/审核
- `pages/content-coordinator.html` — 协调员申请/在职
- `pages/content-recycleBin.html` — 帖子/评论回收站
- `pages/encyclopedia.html` — 攻略 / 百科
- `pages/emotions.html` — 表情包
- `pages/topic.html`（重构）— 接入共享 sidebar
- `pages/banner.html`（重构）— 接入共享 sidebar

**运营（8）**
- `pages/badge-category.html` — 徽章分类
- `pages/badge-list.html` — 徽章列表/审核
- `pages/appearance.html` — 装扮管理
- `pages/lottery.html` — 抽奖
- `pages/push.html` — 推送消息
- `pages/creator.html` — 创作者
- `pages/log-report.html` — 举报日志
- `pages/statistics.html` — 社区统计（12 张指标卡 + 趋势图 + 明细表）

**用户（8）**
- `pages/user-list.html` — 用户列表
- `pages/user-aiQuality.html` — AI 质量审核
- `pages/user-aiMessage.html` — AI 对话统计
- `pages/user-avatar.html` — 头像审核
- `pages/user-nickName.html` — 昵称审核
- `pages/user-tag.html` — 标签分析（TOP10 分布）
- `pages/user-tagSetting.html` — 标签配置
- `pages/user-largeModel.html` — 大模型参数（8 个滑块）

### 架构调整

1. **新增 `js/sidebar.js`** — 共享三栏外壳渲染器，菜单单点定义。所有页面只需写 `<div id="shell-root" data-active="xxx">` + 内容区，外壳自动注入；从此改菜单/品牌只动一个文件。
2. **`js/admin.js` 改成事件委托** — 不依赖 DOM 渲染顺序，解决 sidebar.js 后插入元素绑定失效的问题。
3. **`css/admin.css` 新增组件样式**
   - `.stat-grid` / `.stat-card` — 统计卡片网格
   - `.chart-box` / `.chart-placeholder` / `.bar` — 饼图/柱图占位
   - `.section-title` — 蓝色短竖条 + 标题
   - `.slider` — 滑块（大模型参数页用）
   - `.input-number` — 数字步进
   - `.drawer` — 右侧抽屉（举报来源详情）
   - `.empty-state` — 空状态

### 操作列修复（沿用 v002 的反馈）
- 所有列宽较多的页面，操作列均使用 `position: sticky; right: 0`，表格横向滚动时操作按钮保持可见。

### 生成方式（可重复运行）
```
cd .temp/admin-prototype
python _gen.py    # 装扮/表情/日志/创作者/徽章分类/徽章列表
python _gen2.py   # 帖子/评论/协调员/回收站/攻略/版块/抽奖/推送/统计
python _gen3.py   # 用户 8 个子模块
```

### 打开方式
```
cd .temp/admin-prototype
python -m http.server 8765
# 访问 http://localhost:8765/index.html
```
（8081 端口被 bigPlayer C 端 dev server 占用，故用 8765）

### 待用户确认
看完所有 25 个页面后决定：
- 是否搬到 `bigPlayer/admin-prototype/` 正式目录
- 哪些页面需要进一步打磨细节（数据真实度、Modal 字段、行操作等）
- 是否需要把跳转/状态做成可演示的流程（如点「审核通过」→ 状态变绿 → 出 Toast）
