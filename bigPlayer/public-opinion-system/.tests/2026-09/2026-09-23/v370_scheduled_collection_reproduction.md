# v370 定时调度抓取不到——只读/单测复现

## 结论

单测复现初始结果：**2 PASS / 2 FAIL**。开发负责人修复动态轮询后复测为 **3 PASS / 1 FAIL**。未执行生产 DB、真实服务切换或真实抓取。

## 复现命令

```powershell
node --test .tests/2026-09/2026-09-23/v370_scheduled_collection_reproduction.test.js
```

既有相关基线：

```powershell
node --test worker/test/scheduleSlots.test.js worker/test/sourceScheduler.test.js worker/test/sourceSchedulerRuntime.test.js worker/test/schedulerRepositoryAdapter.test.js worker/test/worker.test.js
```

基线结果：`136/136 PASS`。

## 断言结果

| 编号 | 场景 | 结果 | 关键断言 |
|---|---|---|---|
| A1 | dueSlot 取最新未处理固定槽，nextSlot 保持锚点 | PASS | `dueSlotAt=2026-09-22T18:00:00.000Z`；`nextSlotAt=2026-09-23T18:00:00.000Z` |
| A2 | `scheduleSlotAtomic` 被 queued/running 或 lease 拒绝后持久化 reason，且不推进 cursor | FAIL | 当前 queued 分支仍仅返回 `{ acquired:false }`、无 `reasonCode`；三类区分及持久化尚未进入后续断言 |
| B1 | `runOnce` 扫描期间动态消费普通 `scheduled` run | PASS（已修复） | 实际消费 `['manual-1','scheduled-2']` |
| B2 | credential 失败后下一槽仍可重试 | PASS | `slot-1` 抛 `CREDENTIAL_NOT_FOUND` 后，下一次 `runOnce` 仍尝试 `slot-2` |

## 失败定位

1. `worker/src/schedulerRepositoryAdapter.js`
   - `scheduleSlotAtomic()` 的条件更新同时检查 lease 与活跃 run。
   - `affectedRows !== 1` 时直接 rollback 并返回 `{ acquired:false }`。
   - 当前没有只读判因或 `last_reason_code` 持久化，因此后台只能看到“未获得 lease”，无法知道是 queued/running 卡住还是 lease 未释放。

2. `worker/src/worker.js`
   - `runOnce()` 初始 `listRunnableSyncRuns()` 会消费列表中的普通 `scheduled`。
   - 扫描期间 `pollManualQueue()` 的触发类型白名单只有 `manual`、`scheduled_site`，遗漏 `scheduled`。
   - 当 scheduled run 在初次读取之后入队时，本轮 Worker 不会拾取，只能等待下一次完整扫描；若扫描/调度状态又被旧 run 阻塞，就表现为“定时调度老是抓取不到”。

## 输入状态

- 单测复现输入完整，不属于 `BLOCKED_INPUT`。
- 未获授权读取生产 DB 或常驻服务状态，因此真实环境是否同时存在“旧 queued/running/lease 残留”属于 `PRODUCTION_CONFIRMATION_BLOCKED_INPUT`，不能把单测推断写成生产事实。
