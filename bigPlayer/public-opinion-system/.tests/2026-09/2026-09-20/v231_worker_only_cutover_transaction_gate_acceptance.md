# v231 Worker-only 事务切换门禁隔离验收

- 测试日期：2026-09-20（北京时间）
- 测试类型：隔离事务 mock
- 范围：Worker-only 预检、切换、readiness、仅 Worker 回滚及回滚失败停机门禁
- 边界：无真实服务、ProgramData、DB、API/3001 连接；无部署、重启、补跑、发版

## 结果

| 场景 | 结果 | 关键断言 |
|---|---|---|
| Worker-only transaction preflight | PASS | 预检失败时事务拒绝，不触碰 API 工件 |
| Worker-only transaction switch | PASS | 切换中失败仅进入 Worker 回滚路径，API wrapper/XML 不变 |
| Worker-only transaction readiness | PASS | readiness 失败自动回滚 Worker，API/3001 不变 |
| Worker-only transaction rollback | PASS | 回滚失败进入 `MANUAL_STOP_REQUIRED`，不扩大到 API |
| 定向自动化 | PASS | `node --test .tests/2026-09/2026-09-20/v227_worker_only_cutover_transaction.test.js`，4 passed / 0 failed |
| 语法/空白 | PASS | `node --check scripts/windows-services/worker-only-cutover-transaction.js`；`git diff --check` 通过 |

## API 不变性

四个事务场景均断言 API wrapper/XML hash 或内容前后一致。事务代码不提供真实服务控制、CLI、ProgramData 复制、数据库写入或全局 rollback 入口。

## 结论

Worker-only 事务切换门禁 **PASS（隔离 mock）**。真实切换仍需新的明确授权和真实环境预检；本报告不代表已部署、已切换、已回滚或线上数据恢复。
