---
status: FAIL_SCRIPT_GATE_INCOMPLETE
date: 2026-09-22
role: test-owner
topic: init-release-candidate 发布候选生成门禁
---

# init-release-candidate 脚本门禁独立 QA

## 结论

**FAIL。** `node --test scripts/init-release-candidate.test.js` 为 8/8 PASS，但脚本未强制“真实配置指纹”和“可验证回滚”的核心约束，仍可能生成不可审计的 READY。封存 v334c 未修改，未创建新候选。

## 已通过

- 缺少目标路径/rollback 目录、相对依赖缺失、legacy identity、hash mismatch、部分 worker evidence 字段错误时，脚本会删除临时目录且不生成 READY。
- 目标路径存在性、rollback 目录存在性、candidateId/目录名、payload 自测、checksum 和基础只读 preflight 都有门禁。

## 阻断缺口

1. `scripts/init-release-candidate.js:70` 只拒绝两个固定占位字符串；任何任意但格式正确的 `sha256:<16-64 hex>` 均可通过，未从真实服务配置计算/比对 `DB_HOST`、`DB_NAME` 指纹。
2. `runPreflight()` 仅验证 preflight 输出指纹“存在且符合 hex 格式”，未要求它与 `workerEvidence.dbHost/dbName` 相等。因此 worker evidence 与 preflight 可各自携带不同的非占位假值而通过。
3. `rollbackWorkerSha256` 在 `:68` 仅检查 hex 格式，未计算或比对 `rollbackReleasePath` 中实际 Worker 文件 hash。
4. `rollbackCommand` 在 `:69` 只要求字符串包含 rollback 目录，未验证命令可执行、目标文件存在或恢复对象 hash 匹配。
5. 生成的 per-file rollback 仍是抽象 `prior release:<relative>` / `restore <relative>`，没有引用已验证的 `rollbackReleasePath`；无法形成每个生产文件到上一版实体的映射。
6. 现有 8 项测试未覆盖“两个不同但格式正确的 DB 指纹”、错误但格式正确的 rollback hash、或仅包含路径但不可执行的 rollback command。

## 退回要求

- 从明确的、只读取 `DB_HOST`/`DB_NAME` 的配置文件计算 hash，并要求 worker evidence 与 preflight 输出逐项相等。
- 对 rollback release 下的实际 Worker/目标文件逐项计算 hash；formal-file-closure 的每个生产文件必须映射到该 release 的具体文件、hash 和可执行恢复命令。
- 补充上述三类反例测试；任一不匹配必须不生成 READY。

未启动服务、未切换、未发布、未执行真实 Run、未写 DB、未访问 3001。
