---
status: active
owner: project-manager
date: 2026-09-22
scope: BigPlayer release and runtime chain only
---

# BigPlayer 运行链时间盒与止损规则

## 不在本轮范围

- 不重写 BigPlayer 采集、解析、归一化或入库业务逻辑。
- 不改 Discord/TapTap 业务规则；不做 UI、美化、翻译、算法、历史清理或补跑。
- 封存候选 `v334c-r2` 不修改、不重签。

## 唯一待办

| 顺序 | 工作 | 负责人 | 时限 | 完成证据 | 超时处理 |
|---|---|---|---|---|---|
| 1 | 补齐候选生成器源头门禁：真实非敏感 DB 指纹、三方 evidence 一致性、rollback 对象 hash/dry-run、逐文件映射 | 开发负责人 | 30 分钟 | 反例测试、独立 QA 结论 | 停止修改，提交未满足的具体门禁 |
| 2 | 只读定位真实 BigPlayer target release 与上一版 rollback release；没有对象时明确缺失路径/责任方 | 开发负责人 | 15 分钟，并行于 1 | 绝对路径、文件 hash、配置来源（不含 secret） | 标记 `BLOCKED_INPUT`，不得伪造或造候选 |
| 3 | 对源头门禁做独立复核 | 测试负责人 | 收到交测后 10 分钟 | PASS/FAIL 报告 | FAIL 只退回一个最小缺陷清单 |
| 4 | 仅在 1-3 都通过且真实 release 输入齐全后，原子生成一个新候选 | 开发负责人 | 15 分钟 | READY、manifest、payload、rollback 全互引 | 任一失败封存并停止造包 |

## 后续门禁

受控发布、服务切换及 v335 运行验收不在本时间盒内，须在候选 QA PASS 后单独进入发版流程。v335 必须验证同版 Worker、health、3000 浏览器、最小真实 Run 和窗口/幂等结果。

## 止损判定

任何单轮超过 30 分钟且没有新增可验证证据，项目经理停止该轮；下一步只可为补齐明确输入、修复一个明确缺陷，或报告外部阻断。禁止以增加候选、扩大测试或重写采集器替代证据。

## 本轮结果

- A 线：`v344`、`v345` 两次独立复核均为 `FAIL_TIMEBOX_GATE_FALSE_COVERAGE`。第二次 20 分钟最小返工后仍存在 source commit 反例同时篡改 evidence/参数、rollback 反例缺唯一错误断言的问题。触发止损，停止继续修改生成器测试。
- B 线：`BLOCKED_INPUT`。真实 BigPlayer target release、上一版 rollback release、逐文件实体映射均未提供；不得用 TapTap/P0 release 代替。
- 结论：本轮不创建候选、不进入发布。后续恢复条件为：发布方提供 B 线三个实体输入，并由开发负责人以新的、单独 20 分钟任务处理 v345 的最小测试缺口；两项都满足才允许重新进入候选预检。

## 责任纠正

`v346` 证明不存在既有 BigPlayer target/rollback release，但这不是用户或外部发布方的输入义务。开发负责人必须从已验证源码构建 BigPlayer target release；当前正式 TapTap 服务及其 XML/Wrapper 仅可作为“切换失败后恢复现状”的回滚基线，绝不可作为 BigPlayer target。资产构建与基线快照均不属于发布、切换或服务重启。

## 恢复准入

- A 线最终独立 QA：`v348_init_release_candidate_identity_gate_final_qa.md`，`PASS_A_LINE`，12/12 PASS；`targetPlatform=bigplayer_h5` 与 `rollbackBaseline=pre-bigplayer-taptap-formal1` 在 manifest/provenance/READY 中互引，错误身份不生成 target 或 READY。
- 资产独立 QA：`v347_bigplayer_target_rollback_asset_independent_qa.md`，目标资产 74 文件/hash/WhatIf 通过；回滚含义限定为恢复切换前现状基线。
- B 线的 `BLOCKED_INPUT` 已解除。准许原子脚本创建一次新候选，并在创建后立即进入独立发布前只读预检；本条不构成发布、切换或真实 Run 授权。
