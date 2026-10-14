# 抓取内容管理默认选中帖子

Status: 已启用并验收，未提交、未推送 Git

- `../admin/PublicOpinion/assets/content.js`：初始模式和无有效URL筛选参数时的模式由 attention 改为 post。首次请求 contentType=post，不带 riskMode。
- `../admin/PublicOpinion/content.html`：初始帖子按钮 active/aria-pressed=true，关注按钮恢复未选中；更新 content.js 缓存版本。
- URL明确指定评论、关注或紧急告警时保留对应筛选。用户切换评论后刷新仍保留评论。
- 从现役前端运行包复制候选，仅精确修改上述默认值和缓存版本，保留现役已有其他功能；启用 `release-20261012-default-post-r1`。无API/数据库变更。
- 语法与空白检查通过。可见 Edge 在真实SSO会话验收默认帖子、评论切换、刷新保留评论、关注入口、紧急入口，共5场景通过，内容接口200，无页面脚本错误。
- 证据：`.tests/2026-10/2026-10-12/content-default-post-browser.json` 与同名 png、cjs。
- 临时切换产物及原服务配置备份：仓库根 `.temp/content-default-post/`。
