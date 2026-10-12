---
date: 2026-09-23
role: test-lead
scope: UTC scheduler/window contract and Discord RATE_LIMITED terminal handling
verdict: FAIL
environment: isolated candidate / local tests only
---

# UTC/Discord P0 独立 QA 报告

## 结论

**FAIL**。UTC 调度、BigPlayer 执行窗口、国内/境外三频率、租约/幂等/缺口续跑的候选测试通过；Discord `RATE_LIMITED` 已能保存安全游标并按 `next_retry_at` 延迟回队，但没有最大重试上限，重复限流时会永久 `queued -> running -> queued`，无法进入需求规定的明确终态。

唯一退回项：为 Discord `RATE_LIMITED` 增加可配置且有界的最大重试次数；达到上限后必须进入明确终态并写入审计信息，同时补充“不再被 `listRunnableSyncRuns` 领取”的自动化用例。

## 实际命令与结果

```powershell
node --test worker/test/scheduleSlots.test.js worker/test/sourceScheduler.test.js worker/test/credentialBindingAndCatchupWindow.test.js worker/test/schedulerRepositoryAdapter.test.js worker/test/worker.test.js server/test/repository.test.js
node --check worker/src/scheduleSlots.js
node --check worker/src/sourceScheduler.js
node --check worker/src/schedulerRepositoryAdapter.js
node --check worker/src/worker.js
node --check server/src/db/repository.js
```

- 相关自动化：282/282 PASS，0 FAIL。
- 语法检查：5/5 PASS。

```powershell
node --test .tests/2026-09/2026-09-23/v001_scheduler_timezone_region_frequency_matrix.test.js
```

- 独立地区×频率矩阵：6/6 PASS。

## 覆盖矩阵

| 范围 | 1 小时 | 6 小时 | 1 天 | 结果 |
|---|---:|---:|---:|---|
| 境内 BigPlayer | PASS | PASS | PASS | UTC 槽位稳定，`window_end` 覆盖 09:00 北京时间实际执行点 |
| 境外 BigPlayer | PASS | PASS | PASS | 与境内走同一时间契约，窗口合法且不超过 7 天 |
| MariaDB `DATETIME(3)` | PASS | PASS | PASS | 无时区字符串按 UTC 解释，写入为 UTC `YYYY-MM-DD HH:mm:ss.SSS` |
| 连续槽位/重启恢复 | PASS | PASS | PASS | 固定锚点、不按完成时间漂移、只取最近漏跑槽、已处理槽不重复 |
| 帖子/动态/评论边界 | PASS | PASS | PASS | 固定窗口贯穿 Run/checkpoint；边界、评论缺口与同窗续跑用例通过 |
| 唯一键/幂等 | PASS | PASS | PASS | source+slot 幂等；checkpoint 维度含站点/任务/窗口，旧 owner 被 fencing |

## UTC 时间链证据

- `scheduleSlots` 在 `TZ=Asia/Shanghai` 下将 MariaDB 无时区值显式按 UTC 解析。
- BigPlayer 迟到执行时，`sourceScheduler` 将 `windowEndAt` 延伸到实际 `now`；北京时间 09:00 的 6 个地区/频率组合均验证 `window_end == 2026-09-23T01:00:00.000Z`。
- DB 领取、租约、更新与 runnable 查询统一使用 `UTC_TIMESTAMP(3)`。
- 页面时间格式化将无时区 API 值补 `Z` 后，以 `Asia/Shanghai` 展示；本轮未连接生产或执行真实抓取。

## Discord `RATE_LIMITED` 审查

### 已覆盖

- 首个 429 会停止同一 Run 后续评论/回复派发。
- checkpoint 保留最后安全 cursor，不重复提交已完成页。
- Run 从 `running` 释放为 `queued`，清理 lease，并写入 UTC `next_retry_at`。
- runnable SQL 在 `next_retry_at <= UTC_TIMESTAMP(3)` 前不会再次领取，因此不会每个扫描周期立即执行。

### 阻断缺陷

- `worker/src/worker.js` 的 `rateLimitRetry()` 仅把退避时间封顶为 1 小时，没有重试次数上限。
- `finishPagedFailure()` 对所有 Discord `RATE_LIMITED` 始终调用 `deferSyncRun()`。
- 现有测试明确断言 `attempts=99` 仍返回下一次重试时间，证明持续限流时不会进入 `failed` 或其他明确终态。
- 影响：`queued=1` 在退避窗口内会暂时消失，但到点后会再次领取；若 Provider 持续 429，该 Run 可无限循环，P0 验收项不成立。

## 边界与限制

- 本轮仅做候选隔离测试与静态审查。
- 未执行生产 Apply、真实抓取、DDL、服务切换、数据清理或 v370 验收。
- UTC/BigPlayer 子项可判 PASS；整体因 Discord 唯一 P0 阻断项判 FAIL。
