---
status: PASS_A_LINE
role: 测试负责人
scope: init-release-candidate target/rollback identity gate final regression
date: 2026-09-22
---

# v348 init-release-candidate 身份门禁最终 QA

## 结论

**PASS_A_LINE**。

target/rollback 身份字段已显式建模并完成正反回归：`targetPlatform` 固定为 `bigplayer_h5`，`rollbackBaseline` 固定为 `pre-bigplayer-taptap-formal1`。错误的 TapTap 或 BigPlayer previous release 参数在目标目录创建前失败，目标目录和 `READY.json` 均不存在。

## 已执行

| 检查 | 结果 |
|---|---|
| `node --test --test-reporter=spec scripts/init-release-candidate.test.js` | 12/12 PASS |
| `node --check scripts/init-release-candidate.js` | PASS |
| `git diff --check` | 无 whitespace error；仅仓库既有换行警告 |
| 正向字段互引 | manifest/provenance/READY 均为 `bigplayer_h5` + `pre-bigplayer-taptap-formal1` |
| `targetPlatform=taptap` 独立负向命令 | exit=1；target 不存在；READY 不存在；错误为 `targetPlatform must be bigplayer_h5` |
| `rollbackBaseline=bigplayer-previous-release` 独立负向命令 | exit=1；target 不存在；READY 不存在；错误为 `rollbackBaseline must be pre-bigplayer-taptap-formal1` |

## 复测边界

- 本报告只判定 A 线源头门禁身份字段及 v345 反例回归。
- 不创建候选、不发布、不切换服务、不重启、不执行真实 Run、不写 DB、不访问 3001。
- B 线仍保持 `BLOCKED_INPUT`。
