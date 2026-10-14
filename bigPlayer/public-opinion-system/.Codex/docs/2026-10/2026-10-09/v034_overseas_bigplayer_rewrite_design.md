# 海外 BigPlayer 主链适配设计

Status: approved-design / implementation-in-progress

用户已弹窗批准两步方案：先海外限定候选和隔离验证，真实执行前单独审查精确配置修复。需求以 `feature-overseas-bigplayer-api-collector-rewrite.md` 为准。

## 边界与模块

1. 海外站点 session：仅 overseas/bigplayer_h5，按不可变站点 URL 的 gameId/gameVersion/languageId 交换 Token；缓存隔离 source/account/site/board/基 Token，全部请求使用 club-en，错误不泄露 Token。
2. 主链 connector：海外 session 独立注入，不解除旧 LastNight 隔离模块的门禁；401/403 仍最多一次现有授权刷新。帖子、动态、详情、版块、评论复用原契约。
3. 评论发现：海外当前页 unchanged 父帖也调度；旧父帖从同源、账号、社区、站点的持久化 run 关联 keyset 穷尽。评论父链缺失失败关闭；窗外上下文不计入窗内内容、AI/翻译。
4. 配置准入：海外强制 club-en 与合法 board，支持账密优先；不臆造 board，不自动改历史 siteId。第二源配置修复独立计划。
5. 消费接线：复用现行手动/定时 run、窗口、checkpoint、事务入库、AI 与翻译。独立候选不启用生产消费者；仅调度 allowlist 不构成消费隔离，实跑须证明新旧排他。

## 已核实现状

- PID19584 为 v055-formal1 共享 Worker，工作树与其 connector/worker/scheduler hash 不同，不替换或重启。
- 081a16d2-5545-4afd-9c65-e04777e4540b：board100017，三个配置站点与 registry 对齐。
- 8c690d6e-12ea-4ad3-b434-d941276c4906：三个配置站点、registry 一个 legacy 站点，缺 boardId；未修复，保留未完成。
- 当前主链只为 changed 且窗内父帖调度评论；旧父评论窗外时关联也需保全。

## 验证与运行门禁

离线覆盖多源/N站点、双授权、跨域拒绝、unchanged/旧父帖新评论、窗外父评论新回复、分页未穷尽 partial、重复同步 AI/翻译幂等及国内/其他平台回归。开发测试不是独立 PASS。

交付候选 manifest/hash、自测原始输出、配置修复计划及唯一消费者方案给经理与 QA。真实手动采集、AI/翻译完成、下一定时槽位须分别获取真实证据；禁止以离线测试或入队冒充完成。没有 push、合并、tag、发版、迁移、重键、删除历史授权。
