---
status: fail_execution_integrity
date: 2026-09-22
role: test-owner
topic: v363 BigPlayer controlled apply executor 独立 QA
---

# v363 BigPlayer controlled apply executor 独立 QA

## 结论

**FAIL，禁止进入真实执行。**

离线测试和包完整性通过，但真实 Apply 路径没有兑现交测声明的 hash 校验、三条 identity 事务和失败回滚，当前只能退回开发负责人。

## 关键缺陷

1. **v358/rollback hash 门禁未执行。** `$expected.worker`、`$expected.xml`、`$expected.exe`、`$expected.rollbackWorker` 只被定义，Apply 分支没有读取 `release-metadata.json`、计算文件 hash 或比较 rollback hash；Step 4 仅检查隔离源目录存在后直接 `Copy-Item`。
2. **三条 same-URL identity 没有实际更新。** Step 3 只执行 `START TRANSACTION`、`SELECT COUNT(*)` 和 `COMMIT`，没有 `UPDATE`，也没有以 `affectedRows = 3` 作为实际更新结果门禁；因此声称的 identity apply 未发生。
3. **失败回滚未实现。** `catch` 仅写 `apply-state.json` 的 `rollback=running`、输出错误并重新抛出，没有删除已复制的 ProgramData release、回滚已执行的 migration/事务、恢复服务或校验回滚 hash。README 所称“stops/rolls back on failure”与实际代码不符。

## 已通过项目

| 检查项 | 结果 |
|---|---|
| `node --test tests/executor.test.js` | `3/3 PASS` |
| 候选 checksums | `16/16 PASS` |
| 默认模式 | `DRY_RUN`；未进入 DB 或文件系统 Apply |
| confirmation/evidence 门禁 | 缺 confirmation、错误 evidenceId 均 `FAIL_CLOSED` |
| 互斥锁与状态文件入口 | 静态存在；真实运行未执行 |
| Real Run | 明确阻断为独立批准窗口 |

## 退回要求

开发负责人需补齐：实际 Worker/rollback 文件逐项 hash 校验；三条明确 same-URL `UPDATE` 及精确 `affectedRows=3`、NULL/历史不可改门禁；migration、identity 和 release 安装的可验证失败补偿/回滚，并增加隔离故障注入测试。修复后重新生成 checksum，再由测试负责人复核。

本轮未运行 `-Apply`，未连接或写生产 DB，未写 ProgramData，未切换/重启 Worker，未真实 Run，未访问 3001。
