---
status: pass_pre_execution_readonly
date: 2026-09-22
role: test-owner
topic: v363 BigPlayer controlled apply executor 最终修复复测
---

# v363 BigPlayer controlled apply executor 最终 QA

## 结论

**PASS_PRE_EXECUTION_READONLY**。

此前旧断言和 checksum 缺陷已修复；v363 现在通过执行前隔离 QA。该结论不代表已执行生产 Apply 或真实 Run。

## 结果

| 检查项 | 结果 |
|---|---|
| `node --test tests/executor.test.js` | `5/5 PASS` |
| `node --test tests/execution-gates.test.js` | `3/3 PASS` |
| checksums | `426/426 PASS`，`0 mismatch` |
| identity batch | 同会话事务、`ROW_COUNT()`、JSON `identity-committed/affectedRows=3`、异常 handler rollback |
| rollback hash | XML、EXE、Worker 各自损坏夹具均 fail-closed；恢复后逐项重新 hash |
| 生产边界 | 未运行 `-Apply`，未连接/写生产 DB，未写 ProgramData，未切换/重启 Worker，未真实 Run，未访问 3001 |

## 后续边界

真实生产执行仍需独立批准窗口，并在执行后另行验收服务身份、DB 证据、Worker health 和真实 Run；本报告不能替代生产执行报告。
