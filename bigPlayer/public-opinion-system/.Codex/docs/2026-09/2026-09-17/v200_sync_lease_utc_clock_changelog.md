# v200 同步租约 UTC 时钟修复

## 问题

`po_sync_runs` 的领取和续租使用 `UTC_TIMESTAMP(3)`，但运行前写入校验、检查点续租、可运行队列和周期到期判断仍混用 `NOW()`。当数据库会话处于东八区时，新领取的租约会被立即判定为过期，Worker 随后报 `SYNC_RUN_LEASE_LOST`。

## 修改

- 同步运行的领取、续租、完成、写前 fencing、进度更新统一使用 `UTC_TIMESTAMP(3)`。
- 同步检查点的领取、过期判断和分页续租统一使用数据库 UTC 时钟。
- 可运行队列、评论父项恢复筛选和周期到期判断统一使用数据库 UTC 时钟。
- 调度成功锚点 `last_success_at` 以及同步终止时间统一写入 UTC。
- 自动认领条件仍仅包含 `queued` 和租约已过期的 `running`；不会自动恢复历史 `failed` 或 `partial`。

## 边界

- 未部署，未重启 API 或 Worker。
- 未写生产数据库，未补跑历史任务。
- 未修改连接器授权、能力检测或业务数据。
- 未提交、未 push、未发布。

## 验证

- Server 全量测试：`425/425 PASS`。
- Worker 全量测试：`228/228 PASS`。
- `node --check` 与 `git diff --check`：通过。
- SQL 合约覆盖 manual/scheduled 领取、续租、写前 fencing、进度和 checkpoint 更新、周期队列，并确认 `failed/partial` 不进入自动认领。
