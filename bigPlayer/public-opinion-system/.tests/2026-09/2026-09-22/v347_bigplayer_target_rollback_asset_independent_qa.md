---
status: PASS_WITH_ROLLBACK_SCOPE_LIMIT
role: 测试负责人
scope: BigPlayer Worker target / TapTap baseline rollback asset read-only verification
date: 2026-09-22
---

# v347 BigPlayer target / rollback 资产独立 QA

## 结论

**PASS_WITH_ROLLBACK_SCOPE_LIMIT**。

BigPlayer target 资产闭包和只读恢复命令通过独立核验；当前快照的回滚语义仅为正在运行的 TapTap formal1 服务基线，不是 BigPlayer 上一版 release，因此不能把本报告解读为 BigPlayer rollback 已就绪。

## 核验结果

| 检查 | 结果 |
|---|---|
| target 根目录 | `.temp/assets/bigplayer-worker-target-20260922` 存在 |
| source commit | `da0ef4fd778f594b71132c338a753722654325c9`，与当前 `HEAD` 一致 |
| source evidence 文件数 | 74 |
| source evidence 路径/长度/SHA-256 | 全部通过，0 missing/hash failure |
| `checksums.sha256` | 全部通过，0 failure |
| manifest/source evidence 交叉身份 | evidenceId、sourceCommit、targetRoot 一致 |
| 生产触碰声明 | `productionTouched=false`、`serviceChanged=false`、`databaseTouched=false`、`endpoint3001Accessed=false` |
| TapTap XML/EXE/worker.js 快照与当前文件 | 3/3 存在且 SHA-256 一致 |
| `rollback-whatif.ps1` | 3 条绝对路径 `Copy-Item ... -WhatIf` 均成功输出 What if，无写入 |

## 范围限制

- manifest 明确标注 `rollbackSnapshot=rollback-current-taptap/`。
- XML 实际指向 `C:\ProgramData\PublicOpinion\releases\worker-release-taptap-20260921-v055-formal1\worker\src\worker.js`。
- 因此该快照只能证明当前 TapTap 服务基线可恢复命令可执行，不能证明 BigPlayer 上一版 Worker、wrapper/XML 或 release rollback 闭环已提供。
- 未启动服务、未切换服务、未执行真实 Run、未写 DB、未访问 3001。

## 判定

作为“隔离 BigPlayer target + 当前 TapTap 只读基线资产”的交测，**PASS**；作为“BigPlayer target + BigPlayer 上一版 rollback 可发布闭环”，**不适用/未满足输入**，仍需发布方提供真实 BigPlayer 上一版 release 及逐文件恢复对象后再验。
