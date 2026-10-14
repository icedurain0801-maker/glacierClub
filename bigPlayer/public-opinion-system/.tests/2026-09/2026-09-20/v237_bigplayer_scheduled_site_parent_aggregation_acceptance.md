# v237 BigPlayer A' 第二段 repository 事务/fencing 验收

- 测试日期：2026-09-20（北京时间）
- 测试类型：repository 隔离合同
- 边界：未连接真实 DB，未执行迁移、服务、重启、补跑或发版；第三段 API/UI/pause-cancel 不在范围

## 结果

| 检查项 | 结果 | 证据 |
|---|---|---|
| child owner+epoch+lease fencing | PASS | `finishScheduledSiteRun fences child leases...`；更新条件包含 owner、epoch 和未过期 lease |
| sibling 锁与最后 child 聚合 | PASS | 仅 terminal child 完成后锁定 sibling 并聚合 parent |
| 1 失败 + 1 成功 | PASS | parent=`partial`，汇总 discovered/stored，错误码 `MULTISITE_PARTIAL_FAILURE`，保留失败证据 |
| 全部失败 | PASS | parent=`failed`，错误码 `MULTISITE_ALL_SITES_FAILED`，计数求和并保留各 child 错误 |
| 重复 finalize 幂等 | PASS | 重复终态不二次聚合 parent |
| 旧 owner/epoch | PASS | 旧 fencing token 不得更新 child 或再次聚合 parent |
| 父不可领取/子执行 | PASS | parent runnable 排除；子按 runId 独立领取和执行，legacy 保持原路径 |
| 定向回归 | PASS | repository 聚合 2/2 + parent/child 2/2，均 0 failed |
| 语法/空白 | PASS | repository、worker 及 CLI 相关文件 `node --check`/`git diff --check` 通过 |

## 已知边界

- 未覆盖真实 MySQL 事务隔离和锁竞争。
- 第三段 API/UI 投影、暂停/取消传播未实现。
- 完整 repository 全量测试仍有既有 checkpoint identity 失败，按交测说明未改动，不纳入本段新缺陷。

## 结论

A' 第二段 repository 事务/fencing 与父聚合合同 **PASS（隔离）**，不表示完整定时采集链路或真实 DB 可用。
