# Last Night 海外独立链路第一阶段

Status: fake-e2e-pass-production-no-go
Date: 2026-10-08

## 本阶段

- 新增 `worker/src/lastNightIsolatedPipeline.js`：固定 Last Night source/game/community/board 与三个 HTTPS 海外站点；仅通过注入的 connector 和专属 store 采集分页帖子、评论；页游标、内容、Run 与 outbox 由 store 契约接收。独立 AI consumer 契约仅调用注入的 `analyzeBatch`，light/deep 策略由外部显式注入。模块不构建共享 `Repository`，不调用旧 `runSource`、统一调度、`Q1AnalysisRunner` 或 `lastNightSiteAlignment`。
- 新增假连接器/假 store 测试 `worker/test/lastNightIsolatedPipeline.test.js`，验证三站各两页帖子与评论、两次运行内容唯一键不重复、light/deep job 完成、范围及分页失败关闭、未授权响应失败关闭。`node --test worker/test/lastNightIsolatedPipeline.test.js` 为 2/2 PASS、0 FAIL。
- 设计边界见 `v021_lastnight_isolated_pipeline_design.md`。本阶段未连接生产、未改共享服务/表/任务、未执行 029/030、未触发真实 API 或 AI。

## 冻结哈希与缺口

- pipeline SHA256 `87EE604E95AA6472CFC85F8322CDC236E6F3F9D15A9BA0710ABBE82E30E4174C`；测试 SHA256 `6B8049B5B720550DB95878AAF6D9B0D276D78B0DA1A5B530D9FEBC724012626C`。
- 原始 TAP 位于仓库上级 `.temp/po-closeout-20261008/lastnight-isolated-pipeline-stage1.tap`，SHA256 `3A0B147E01D18F243847ED2D74EF5CC7B7685F663C7D860E55095B87C2E5A51D`。
- 假 store 只证明接口和唯一键语义，不是 MariaDB 事务/唯一索引证据；共享写入计数为测试未注入共享仓储的零调用证明，不代表真实进程隔离。
- 尚缺独立 433xx 数据库/表与账号、租约/调度、持久 checkpoint、账号密码优先且登录失败不回退 Token 的认证接线、401 失败关闭的真实连接验证、评论回复目标、原算法深度升级适配、后台海外只读查询，以及真实 API→入库→异步 AI 证据。以上均为下一阶段硬门禁，整体 `NO_GO`。
