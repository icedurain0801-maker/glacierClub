---
date: 2026-09-11
status: code_verified_external_admission_pending
scope: bigplayer-domestic-and-overseas-scheduling
owner: 项目经理
---

# v092 BigPlayer 60 分钟调度 P0 事件

## 现象

用户反馈抓取账号管理已设为 60 分钟，但境内、境外 BigPlayer 最近两日均无数据。截图已确认境内 / 超能世界国服版 / BigPlayer社区在 2026-09-11 为帖子 0、评论 0。

## 唯一待办

| 状态 | 事项 | 验收 | 负责人 |
|---|---|---|---|
| done | 核对两个范围的 BigPlayer source 准入、频率、计划时间、近 48 小时 run、Worker 健康和 DB 内容水位 | 已确认 schema、Worker、来源和失败码事实 | 开发负责人 |
| done | 最小代码修复：失败后按来源频率节流，禁止每分钟重试风暴；补齐统一调度接线和迁移准入合同 | 开发与独立回归均通过 | 开发负责人 |
| blocked_external | 受控生产迁移 023、Worker 可信候选镜像重载、两个来源凭据复核 | 外部操作前置，不得作为代码已修复或真实采集恢复 | 运维 / 发布负责人 |
| done | 独立回归与状态收口 | 定向 `82/82`、Server `338/338`、Worker `183/183`，缺陷 `0` | 测试负责人 / 项目经理 |

## 约束

- 不凭“今日 0 条”推断根因；先核对近 48 小时任务和数据水位。
- 不改采集频率、不删数据、不重启无关进程、不启动真实批量采集、不发版或 push。
- 若外部凭据、平台可用性或运行镜像阻塞，必须以稳定错误码和运行证据登记，不能伪报已修复。

## 诊断事实

1. 生产库停在 migration `022`，未应用 `023`；缺少 `po_source_schedule_state` 及统一调度所需字段，因此无 `next_scheduled_at` 可用。
2. Worker PID `46764` 自 2026-09-07 运行，早于统一调度代码；当前源码 `buildDeps` 未注入 unified scheduler，seam 默认关闭。
3. 境内 source `5c21f78d...`：`enabled=0`、`auth=authorized`、frequency `3600`；近 48 小时均 `CREDENTIAL_NOT_FOUND`，最后运行 2026-09-10 09:53:10。
4. 境外 source `081a16d2...`：`enabled=1`、`auth=authorized`、frequency `3600`；仅 2026-09-10 10:42 成功写入 25 条，其余为 `CREDENTIAL_NOT_FOUND`。
5. legacy `listDueSources` 仅以 `last_success_at + frequency` 判定；失败不推进水位，导致失败任务约每分钟新增，未按 60 分钟节流。

## 代码修复

1. `server/src/db/repository.js`
   - legacy 到期查询改用“最近成功时间”和“最近实际尝试完成/开始时间”中的较晚者作为频率水位。
   - 存在 `queued` / `running` sync run 的来源不再从周期扫描重复入队。
   - `frequency_seconds=3600` 的失败来源会等待完整 60 分钟，不再跟随 60 秒 Worker 扫描周期重试。
   - 已提交：`6cc495a fix(public-opinion): throttle failed source retries`。
2. `worker/src/worker.js`
   - `buildDeps()` 将同一 Repository 的连接池交给统一调度，接入 mode、workerId、clock 与基于 connector 注册信息生成的 capability map。
   - BigPlayer 平台键使用生产真实值 `bigplayer_h5`。
   - 统一调度执行前只读验证 migration ledger 与 023 必需表/列；缺失返回 `UNIFIED_SCHEDULER_SCHEMA_NOT_READY`，查询失败返回 `UNIFIED_SCHEDULER_SCHEMA_CHECK_FAILED`，均不误触发统一调度。
   - `enabled + schema ready` 时由统一调度独占周期来源；调度任务失败也不回退 legacy 形成双采。`shadow` 只做准入验证，不写调度任务并保留 legacy。
3. `.env.example`
   - 新增 `UNIFIED_SOURCE_SCHEDULER_MODE=off`，明确只有 migration 023 应用并验收后才能由发布流程启用。
4. 统一调度实现已提交：`fa616ce fix(public-opinion): gate unified source scheduling`。

## 本地验证

- 调度迁移、适配器、runtime、job、Worker seam、legacy frequency 定向回归：`82/82` 通过。
- Repository 定向回归：`93/93` 通过。
- Worker 全量回归：`183/183` 通过。
- Server 全量回归：`338/338` 通过。
- `node --check` 与 `git diff --check` 通过；仅有工作树既有 LF/CRLF 提示。
- 验证全程未连接外部采集平台、未触发真实采集、未改生产数据库、未重启 Worker。

## 剩余外部准入

- 生产库尚未应用 migration 023，统一调度保持不可启用状态。
- 运行中的 Worker 仍是 2026-09-07 启动的旧进程，未加载本次代码或 2026-09-10 的凭据主体修复。
- 境内来源仍为 `enabled=0`；境内、境外真实凭据可用性不在本次代码修改范围。
- 因以上门禁，本返件只证明代码合同已修复，不宣称真实数据已经恢复。

## 独立回归

结论：P0/P1/P2 代码合同 `PASS`，缺陷 `0`。测试负责人独立验证：定向 `82/82 PASS`、Server 全量 `338/338 PASS`、Worker 全量 `183/183 PASS`，9 个目标文件语法检查和 `git diff --check` 均通过。报告：`.tests/2026-09/2026-09-11/v093_bigplayer_schedule_p0_regression.md`。

生产准入仍为 `NOT_ADMITTED`：仍需受控应用 migration `023`、可信 Worker 候选镜像重载、两个来源的凭据/授权核验，以及受控真实采集观测。上述外部操作完成前，不能宣称 60 分钟调度已在生产恢复或近两日数据已补齐。
