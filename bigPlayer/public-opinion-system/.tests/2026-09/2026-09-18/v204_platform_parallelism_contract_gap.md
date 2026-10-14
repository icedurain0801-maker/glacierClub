# v204 平台多任务并发规则：测试准入缺口

- 验收角色：测试负责人
- 新合同：同平台不同 source/account 或不同 window 可并行；同 source+account+window+cursor/segment 的重复 claim 必须拒绝；lease、checkpoint、deadline 独立；一个来源失败不影响同平台其他 run；BigPlayer、TapTap、Discord 各有一组并行证据。
- 当前结论：**FAIL / 未准入。** 当前代码和既有测试仍实施“同一 source 任一活动 run 全局阻断”，未覆盖新合同，不能判 PASS。

## 静态证据

| 项目 | 现状 | 与新合同关系 |
|---|---|---|
| 活动 run 门禁 | `server/src/db/repository.js:1637-1638` 以 `source_id` 查询任意 `queued/running` run，存在即 `PREVIOUS_RUN_ACTIVE` | 阻断同一 source 的不同 account 或不同 window 并行 |
| 活动 checkpoint 门禁 | `server/src/db/repository.js:1639-1640` 以 `source_id` 查询任意活跃 checkpoint，存在即 `SYNC_CHECKPOINT_ACTIVE` | 未按 account/task/window/cursor/segment 隔离 |
| 调度 lease | `po_source_schedule_state` 仍按 source 领取 | 不应阻止不同 source 同平台并行；同 source 的并发边界需重新明确 |
| 既有测试 | `server/test/repository.test.js` 的“bounded manual backfill reuses only the same active source window”明确期望不同 window 返回 `PREVIOUS_RUN_ACTIVE` | 与新合同直接冲突，必须改为新并发矩阵 |

## 需要开发返件的最小验证矩阵

1. BigPlayer、TapTap、Discord 各覆盖同平台两个不同 source/account 可并行 `running`，并验证各自 run lease、checkpoint lease 和 deadline 没有串写。
2. 同一 source+account+window+cursor/segment 并发双 claim：恰好一个成功，另一方稳定拒绝或复用同一 run；不得产生第二个活跃 checkpoint。
3. 同一 source 的不同 window：按用户新合同允许时，必须分别持有各自 window 的 checkpoint；不允许时，需由项目经理补充澄清，但当前文本将其列为允许。
4. 其中一个 source 连接器失败后，另一个同平台 run 继续到自己的终态；不得因共享 lease、abort signal 或 deadline 被取消。
5. 真实环境只在项目经理给出受控窗口后执行三平台并行四证，不自行创建 run。

## 验收门槛

开发需先提交最小代码与上述定向自动化回归。测试负责人随后核对 API、MariaDB、Worker 日志和管理页：运行可同时处于 running、重复 claim 被拒、所有 lease/checkpoint/deadline 独立、失败隔离。此前不得把当前实现标为并发 PASS。
