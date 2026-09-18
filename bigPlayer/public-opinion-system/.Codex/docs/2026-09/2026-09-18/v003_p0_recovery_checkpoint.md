# P0 恢复执行阶段检查点

更新时间：2026-09-18 14:15（Asia/Shanghai）

## A. Discord partial 归因与续接

- 责任人：开发负责人。
- 当前状态：run `2983a044-77bc-47a4-9b16-ccdcb1512f82` 已于 `2026-09-18T06:04:15Z` 终态 `partial`，不是成功。
- 计数：`fetched=782`、`stored=779`、`inserted=1`、`changed=778`、`unchanged=3`、`comments=0`。
- cursor：owned_content 推进到 `channelIndex=34`、`before=1514479445891616859`；旧证据为 `before=1524340652974800997`。
- 错误：owned_content `SYNC_PAGE_BUDGET_EXHAUSTED`；多条 comments 为 `RATE_LIMITED`。
- 退避证据：connector 能读取 `Retry-After`/body `retry_after` 并形成 `retryAfterMs`，worker 可生成 `next_eligible_at`；本次公开 run 响应未包含 `next_retry_at`，错误消息也未持久化 `retry_after_ms`，不能据此立即重试。
- Worker 证据：`PublicOpinionWorker.out.log` 存在 `06:02:04Z scan_started` 和 `06:10:46Z scan_completed`，本次不存在“缺 scan_completed 日志”的阻断。
- 下一动作：北京时间 15:00 由一次性自动化 `discord-partial` 只读复核 active run、退避字段、cursor 与 scan 日志；不会自动 POST。复核完成即删除自动化。
- 失败回流：若仍限流或退避不可证明，保持 partial、保存 cursor 和证据，退回项目经理决定下次有界窗口；禁止无界重试。

## B. BigPlayer / TapTap 两日分片收口

- 责任人：开发负责人整理证据；测试负责人按 partial/完成语义验收。
- BigPlayer 已完成窗口：超能世界自然日 `fbc26206-17cb-4962-91e1-829c77104825`、X-Clash 自然日 `d66edda2-ace4-4ced-b6ba-997794722477`、Last Night 自然日 `46e10cb6-ed33-4ae9-b09d-4fd037ba0373`、超能世界当前半日 `13640913-2ecb-43c6-a9ab-d53ded3ab9c6`，终态均为 `completed_authorized_scope`。
- TapTap 未完成窗口：自然日 `3ebacd1e-d88b-474c-a07a-8908c6b08eef` 为 `partial`，`fetched=588/stored=9/changed=9/unchanged=579`，原因 `PARTIAL_SYNC`/page budget，checkpoint 保留。
- TapTap 当前半日：`ce20e2ad-8b8c-46b5-b751-0a6fca5f79cf` 为 `partial`；续段 `53306e2f-6a74-405d-912c-81a53a90a60b` 从 `from=480` 收口为 `completed_authorized_scope`。前段 partial 不改写，因此整个两日验收仍保留未完成标记。
- 下一动作：测试负责人按 run/window/checkpoint 核对管理页与 API；不得把 TapTap partial 计为成功，不从头重拉。
- 失败回流：如页面计数或 cursor 与 API 不一致，退回开发负责人做只读定位；不改历史终态。

## C. BigPlayer 多站点

- 责任人：开发员工实现，开发负责人审核。
- 当前状态：保持开发队列；A/B 未收口前不抢占主线。
- 下一动作：等待项目经理重新派发 server/repository/worker 接线；当前只保留已完成的 migration、配置纯模块、父子 run 聚合和前端表单资产。

## 边界

- 本检查点未 push、未发版、未删数据、未修改历史 run。
- 未触发 BigPlayer/TapTap 新 run；Discord 未重复 POST。
