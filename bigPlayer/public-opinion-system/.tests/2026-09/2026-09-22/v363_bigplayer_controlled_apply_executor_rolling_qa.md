---
status: fail_regression_and_checksum
date: 2026-09-22
role: test-owner
topic: v363 BigPlayer P0 滚动验收
---

# v363 BigPlayer P0 滚动验收

## 结论

**FAIL，停止继续验收并退回开发负责人。**

## 发现

1. **回归测试失败：4/5 PASS。** `tests/executor.test.js` 第 4 项仍匹配旧字符串 `/rollback hash recheck failed/`，实际执行脚本已改为调用 `Assert-RestoredHashes`，导致测试失败。交测声称的 `5/5 PASS` 与当前工作树实际结果不一致。
2. **checksum 闭包失败：426 条中 1 条 mismatch。** `checksums.sha256` 对 `scripts/controlled-apply-executor.ps1` 的 hash 与当前文件不一致，说明脚本更新后未重新生成 checksum。

## 已通过/已核对

- 脚本已出现 `SqlBatch`、`ROW_COUNT()`、三条 identity `UPDATE`、migration/identity/release fault injection。
- 回滚代码已调用 `Assert-RestoredHashes`，并包含 XML/EXE/Worker 恢复与服务 stop/start 入口。
- 未运行 `-Apply`，未连接或写生产 DB，未写 ProgramData，未切换/重启 Worker，未真实 Run，未访问 3001。

## 退回要求

开发负责人需同步更新第 4 项测试以匹配真实 `Assert-RestoredHashes` 合同，并重新生成完整 426 文件 checksum；提交后重新跑全套测试，测试结果必须与交测声明一致后再进入下一项候选验收。
