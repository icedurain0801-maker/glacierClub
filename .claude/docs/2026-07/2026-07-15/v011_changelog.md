# v011 变更文档 — C 端 chat.html 英雄卡片改为紧凑布局(图鉴式技能选择器 + 缎带稀有度)

日期：2026-07-15

按用户选定方案（技能展示保留图标 + 顶部方案4"缎带徽章"）重构英雄卡片，大幅降低整体高度，同时保留深色金边主题风格：

- 顶部：稀有度徽章改为右上角斜角缎带(`.hero-ribbon`)，替代原来的圆角药丸徽章；头像缩小为 52x52 方形圆角图标（原为 68x86 竖版大图），名称/称号/阵营职业标签紧凑排列在头像右侧同一行
- 技能区：由"每个技能一张卡片纵向堆叠"改为"技能图标横向选择条(`.hero-skill-icon-row`) + 底部单个共享详情面板(`.hero-skill-details`)"，默认展开第一个技能，点击图标切换高亮与详情内容，核心技能图标右上角有红点标记(`.hero-skill-core-dot`)
- 事件绑定通过 `bodyEl` 的点击事件委托实现（`.hero-skill-icon-btn` 点击时按 `data-skill-index` 匹配同一张卡片内的图标与详情面板），兼容聊天记录中动态渲染的多张英雄卡片

涉及文件：
- `web/js/chat.js` — 重写 `renderHeroCard(card)` 输出新结构；`bodyEl` 点击事件委托新增技能图标切换逻辑
- `web/css/style.css` — "Hero card theme override" 区块内替换头部/技能相关选择器：新增 `.hero-ribbon`、`.hero-icon-tags`/`.hero-icon-tag`、`.hero-skill-icon-row`/`.hero-skill-icon-btn`/`.hero-skill-core-dot`、`.hero-skill-details`/`.hero-skill-detail`；移除该主题覆盖块内旧的 `.hero-rarity`/`.hero-meta`/`.hero-name-row`/`.hero-title-wrap`/`.hero-skill-grid`/`.hero-skill-card`/`.hero-skill-main`/`.hero-skill-top`（基础样式表中的同名旧规则未删除，因其已被主题覆盖块完全覆盖且未被实际调用的 `renderHeroCard` 使用）；同步更新 `@media (max-width: 420px)` 响应式规则

验证方式：Node 脚本抽取 `renderHeroCard` 函数体单独执行验证输出结构，并通过本地静态页面在浏览器中加载真实 CSS，截图确认徽章、头像、技能图标条、详情面板样式，并模拟点击验证技能切换交互（切换高亮边框、核心标记 tag、描述文案）均生效。
