# Worker-only 已注册服务流程测试

- Status: test-added-pending-implementation
- Date: 2026-09-21

## 测试范围

新增隔离子进程级事务测试 `.tests/2026-09/2026-09-21/v292_worker_cutover_existing_service_flow.test.js`。测试只操作临时目录工件和注入式 Worker fake，不连接 SCM、真实 WinSW、数据库、API 或运行任务。

## 覆盖边界

- `PublicOpinionWorker` 已注册：只允许 stop、copy、start，禁止 install。
- 服务不存在：copy 后允许 install，再 start。
- 已注册服务 rollback：同样禁止 install，恢复 Worker wrapper/XML 后 start。
- 未注册服务 install 失败：验证 rollback 的 install 规则、Worker 字节恢复和 API 字节不变。

## 当前结果

当前事务实现仍无条件调用 `worker.install()`，因此该测试会按预期暴露已注册服务路径缺陷；待开发负责人接入注册状态判断后重新执行。
