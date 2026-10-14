---
status: FAIL_TIMEBOX_GATE_FALSE_COVERAGE
role: 测试负责人
scope: A 线 init-release-candidate 源头门禁复测
date: 2026-09-22
---

# v345 init-release-candidate 复测 QA

## 结论

**FAIL_TIMEBOX_GATE_FALSE_COVERAGE**。

本轮新增 3 项测试后，实际结果为 `10 PASS / 1 FAIL`。失败项暴露了身份门禁反例仍未构造正确；回滚反例虽均退出失败且无 READY，但没有逐项证明唯一错误原因。

## 已执行

| 检查 | 结果 |
|---|---|
| `node --test --test-reporter=spec scripts/init-release-candidate.test.js` | 10/11 PASS，1 FAIL |
| 失败用例 | `source commit mutation reaches preflight identity gate` |
| 失败位置 | `scripts/init-release-candidate.test.js:94-98` |
| 3000/3001 服务或真实 Run | 未启动、未访问 |

## 最小 FAIL 清单

1. **source commit 反例仍是无效 mutation**
   - 测试同时把 `worker-evidence.json.commit` 改成 `mutated-commit`，并把命令参数 `sourceCommit` 也传成 `mutated-commit`。
   - 这满足脚本的 commit 合同，候选实际成功创建，`assert.notEqual(result.status, 0)` 失败。
   - 正确反例应只改变一侧：例如 evidence 保持 `abc`、命令传 `mutated-commit`，并断言 `worker commit mismatch`；或命令保持 `abc`、preflight 输出改成不同 commit，并断言 preflight identity mismatch。

2. **rollback 反例仍缺唯一错误断言**
   - `rollback hash / command target / per-file object / WhatIf` 四个用例只断言非零退出和不存在 `READY.json`。
   - 没有分别断言 `rollback worker hash mismatch`、`rollback command/path mismatch`、`rollback object unavailable` 或 `Copy-Item ... -WhatIf` 失败。
   - 因此不能排除它们被其他前置错误短路。

## 放行条件

- 修正 source commit 反例，使其只破坏一侧合同，并断言唯一错误文本；
- 回滚四类反例逐项断言唯一错误，且保持无 `READY.json`；
- 重新运行该测试文件，所有用例通过且不再存在假成功路径。

本报告只判定 A 线源头门禁测试覆盖；B 线仍为 `BLOCKED_INPUT`，不触发任何发布动作。
