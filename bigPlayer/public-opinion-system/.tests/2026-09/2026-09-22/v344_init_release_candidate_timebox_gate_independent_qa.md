---
status: FAIL_TIMEBOX_GATE_FALSE_COVERAGE
role: 测试负责人
scope: A 线 init-release-candidate 源头门禁独立复核
date: 2026-09-22
---

# v344 init-release-candidate 时间盒门禁独立 QA

## 结论

**FAIL_TIMEBOX_GATE_FALSE_COVERAGE**。

`node --test scripts/init-release-candidate.test.js` 当前为 `8/8 PASS`，但第 7、8 项测试只断言“命令失败”，没有断言失败原因，因此不能证明四类 worker/preflight/DB 反例和 rollback 反例被逐项门禁覆盖。A 线不得据此判定源头门禁 PASS。

## 已执行

| 检查 | 结果 |
|---|---|
| `node --test scripts/init-release-candidate.test.js` | 8/8 PASS |
| `node --check scripts/init-release-candidate.js` | PASS |
| `node --check scripts/init-release-candidate.test.js` | PASS |
| `git diff --check` | 无明确 diff 错误；仅仓库既有 LF/CRLF 警告 |
| 3000/3001 服务或真实 Run | 未启动、未访问 |

## 最小 FAIL 清单

1. **第 7 项反例测试被 commit mismatch 提前短路**
   - `scripts/init-release-candidate.test.js` 的 mutation 循环统一传入 `['sourceCommit', 'c']`。
   - fixture 的 worker evidence 固定为 `commit: 'abc'`。
   - 因而 platform、subject、workerPath、DB fingerprint mutation 会先触发 `worker commit mismatch: abc`，未证明各自唯一失败原因。

2. **DB fingerprint mutation 实际未改动 fixture**
   - preflight 使用插值后的动态 SHA-256 值。
   - 测试仍用 `/dbHostFingerprint='0123456789abcdef'/` 替换旧占位字面量，通常无法命中。
   - 该分支即使失败，也不能证明 `worker evidence DB fingerprint mismatch with config` 或 `preflight evidence does not match worker evidence/config`。

3. **回滚反例覆盖不足**
   - 第 8 项只覆盖 `path`、`rollbackReleasePath` 不存在。
   - 未覆盖格式正确但 hash 错误、rollback worker 路径/文件不匹配、rollback command 与 evidence 不一致、per-file rollback object/hash/target 缺失，以及 `Copy-Item ... -WhatIf` 不可执行。

4. **成功路径的 `-WhatIf` 已执行，但没有负向断言**
   - `validateRollbackDryRun()` 会执行 PowerShell `Copy-Item ... -WhatIf`，这是正向证据。
   - 当前测试没有构造命令语法/目标不一致或 WhatIf 失败并断言唯一错误，无法证明该门禁在反例下有效。

## 退回要求

开发负责人需补齐测试后重新交测：

- mutation 测试统一使用匹配的 `sourceCommit='abc'`，并逐项断言唯一错误文本；
- 直接篡改动态 DB fingerprint，分别断言 worker/config 与 preflight/worker mismatch；
- 增加 rollback hash、rollback command/target、per-file rollback object/hash、WhatIf 失败反例；
- 每个反例确认不会生成 `READY.json`，且不会被其他前置错误短路。

本报告只判定源头门禁测试覆盖，不代表真实生产凭据、服务或采集恢复。
