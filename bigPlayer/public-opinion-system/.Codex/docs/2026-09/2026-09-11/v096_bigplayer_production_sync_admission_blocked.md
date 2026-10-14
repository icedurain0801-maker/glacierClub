---
date: 2026-09-11
status: blocked
scope: bigplayer-domestic-and-overseas-production-sync-admission
owner: 开发负责人
---

# BigPlayer 两地生产同步准入阻塞记录

## 结论

境内与境外 BigPlayer 均为 `NOT_ADMITTED`。本轮只执行生产数据库、Worker 运行态和同步入口的只读取证；未执行 migration、未重启 Worker、未启用来源、未读取或修复真实凭据、未启动同步、未写库。

API Server 已恢复且页面能显示合法空态，但境内当天帖子、评论与内容列表仍为 `0`。该现象只证明查询链路可用，不证明真实采集恢复。

## 准入结果

| 门禁 | 结果 | 证据 / 稳定阻塞码 |
|------|------|-------------------|
| migration 023 | FAIL | ledger 无 023；`po_source_schedule_state` 不存在；必需列 `0/21`；唯一索引列 `0/2`。`UNIFIED_SCHEDULER_SCHEMA_NOT_READY` |
| Worker 制品 | FAIL | PID `46764` 启动于 `2026-09-07 20:20:28`，早于 `fa616ce`（2026-09-11 10:38:13）；无法加载统一调度、失败节流和凭据主体修复。`WORKER_RUNTIME_STALE` |
| Worker 模式 | FAIL | 进程环境 `UNIFIED_SOURCE_SCHEDULER_MODE` 未设置，`WORKER_INTERVAL_MS=60000`。`UNIFIED_SCHEDULER_MODE_UNSET` |
| 精确手动同步入口 | FAIL | migration 023 要求 `po_sync_runs.source_id NOT NULL`，现有 `createSyncRun/startSourceSync/resetSourceSync` 入队仍未写 `source_id/trigger_type`；`/collect` 又不能保证只消费指定两地各一条。`MANUAL_SYNC_SCHEMA_CONTRACT_BROKEN` |
| 境内来源 | FAIL | source `5c21f78d-5f67-4467-963d-dcdeb5e26cab` 为 `enabled=0`。`SOURCE_DISABLED` |
| 境外来源 | 部分通过 | source `081a16d2-5545-4afd-9c65-e04777e4540b` 为 `enabled=1`，但其余全局门禁仍失败 |
| 默认账号绑定 | FAIL | 生产 schema 尚无 `po_sources.default_account_id`，无法确认统一调度默认账号绑定。统一调度会落入 `ACCOUNT_NOT_FOUND` 风险 |
| 凭据运行态 | FAIL | 元数据行存在且 active、未过期、密文非空；但近 48 小时真实 run 持续返回 `CREDENTIAL_NOT_FOUND`，不能据元数据宣称凭据可用 |

## 两地只读快照

查询时数据库时间约为 `2026-09-11 12:01`（Asia/Shanghai）。

| 项目 | 境内 | 境外 |
|------|------|------|
| source | enabled=`0`；auth=`authorized`；frequency=`3600` | enabled=`1`；auth=`authorized`；frequency=`3600` |
| account | enabled=`1`；auth=`authorized`；expire=`NULL` | enabled=`1`；auth=`authorized`；expire=`NULL` |
| credential 元数据 | `account_password`、`api_token` 共 2 条；active、未过期、密文非空 | `api_token` 1 条；active、未过期、密文非空 |
| 近 48 小时失败 run | `CREDENTIAL_NOT_FOUND` 1299 次，采集/写入计数均为 0 | `CREDENTIAL_NOT_FOUND` 2800 次，采集/写入计数均为 0 |
| 最近成功 | source `last_success_at=2026-09-04 12:50:36` | 2026-09-10 10:42:32 的 run 成功，inserted=`25`、comments=`46` |
| 最新内容水位 | collected `2026-09-10 09:30:40`；published `2026-09-09 15:56:31` | collected `2026-09-10 10:42:37`；published `2026-09-10 02:06:13` |

凭据取证仅检查存在性、状态、过期时间和密文非空标志；未读取或输出任何 secret。

## 手动入口缺口

1. `POST /api/public-opinion/sources/:id/sync` 是当前最接近精确同步的入口，但会自动启用 disabled source，且 migration 023 后现有 INSERT 缺少必填 `source_id`。
2. `POST /api/public-opinion/sources/:id/collect` 只写 `collect_requested_at`；下一次全局 tick 还会消费其他 queued、manual 和周期到期来源，不能保证“每地仅一个任务”。
3. 直接调用 `runSource` 同样经过缺少 `source_id` 的 `createSyncRun`，不能作为 023 后的受控入口。

## 后续最小修复范围

以下内容未获本轮授权，未执行：

1. 修复 manual run 入队合同，强制写入 `source_id`、`trigger_type='manual'`，并覆盖全部创建/重置路径。
2. 将精确手动入队收口到单事务：锁定 source、拒绝 disabled、复核 source/game/community/account/credential、拒绝活动 run/checkpoint/lease 后只创建一条 manual queued run。
3. 补 migration 023 实库合同测试：成功入队、来源与触发类型正确、重复请求只保留一条、disabled 与旧 schema 均 fail-closed。
4. 由有权限的运维/发布流程受控应用 migration 023、部署可信 Worker 制品、显式配置调度模式，并复核两地默认账号和真实凭据主体。

上述全部完成并独立验证前，禁止启动两地真实同步，也不得宣称数据恢复。
