# Worker-only EBUSY 定向测试

- Status: completed
- Date: 2026-09-21

## 范围

新增隔离测试 `.tests/2026-09/2026-09-21/v284_worker_cutover_ebusy_simulation.test.js`，仅调用 `worker-only-cutover-transaction.js` 的注入式事务，不连接真实服务、不执行 stop/install/start、不写数据库、不创建运行任务。

## 覆盖边界

- stop 返回但 wrapper 或 Node 仍存活时，模拟 `EBUSY`，事务禁止复制，Worker 工件保持不变。
- wrapper 与 Node 均退出且目标文件可独占后，允许复制并完成切换。
- mutation gate 超时时，事务返回 `MANUAL_STOP_REQUIRED`，不执行 install/start，工件保持不变。

## 验证命令

```text
node --test .tests/2026-09/2026-09-21/v284_worker_cutover_ebusy_simulation.test.js
node --test .tests/2026-09/2026-09-21/v283_worker_cutover_mutation_gate.test.js
```

两份测试合并执行结果：`7/7 PASS`；`node --check` 与 `git diff --check` 通过。
