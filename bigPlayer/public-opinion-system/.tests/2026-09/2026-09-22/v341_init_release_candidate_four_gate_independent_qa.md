---
status: FAIL_TEST_GATE_FALSE_COVERAGE
date: 2026-09-22
role: test-owner
topic: init-release-candidate 四项反例门禁独立复核
---

# init-release-candidate 四项门禁独立 QA

## 结论

**FAIL。** 脚本已增加真实 DB config hash、evidence 互引和 rollback 文件 hash 的实现，但独立测试发现反例用例存在共同的提前失败原因，无法证明所声明的反例门禁；rollback command 也未实际 dry-run 执行。

## 已核对实现

- `configFingerprints()` 仅读取 `DB_HOST` / `DB_NAME` 并计算 SHA-256，worker evidence 与 config 值比较。
- `runPreflight()` 已比较 preflight 输出与 worker evidence/config 的 platform、subject、DB hash。
- rollback Worker 文件存在、位于 rollback release 内且 hash 与 evidence 一致。
- per-file rollback 对象存在性与 hash 被记录；payload 闭包和测试仍通过。
- `node --test scripts/init-release-candidate.test.js`：8/8 PASS。

## 阻断证据

1. `scripts/init-release-candidate.test.js` 的第 7 项“platform/subject/path/commit/DB fingerprint”反例，以及第 8 项“missing target release and rollback objects”反例，均使用 `sourceCommit='c'`，而 fixture 的 `worker-evidence.json.commit='abc'`。
   这使所有这些反例在 `worker commit mismatch` 处提前失败，测试绿灯不能证明指定 mutation 被拒绝。尤其第 7 项 `dbFingerprint` mutation 所匹配的是旧固定字面量，当前 preflight 写入动态 hash，替换通常无效；仍会因 commit 不匹配变绿。
2. `validateRollbackDryRun()` 只执行 `Test-Path -PathType Leaf`，没有 dry-run/解析或执行 `rollback.restoreCommand`。因此“rollback command dry-run 可执行”未被验证。
3. 生成的 per-file `restoreCommand` 目的地是相对 `target`，未明确指向真实 target release 文件；即使文件存在，也不足以证明实际恢复命令可在发布环境执行。
4. 现有测试没有针对“格式正确但不同于 dbConfig 的 hash”“preflight 与 worker evidence 的 hash 不同”“rollback 文件 hash 与 evidence 不同”“rollback command 语法/路径错误”分别构造唯一失败原因。

## 退回要求

- 所有目标反例使用与 fixture 一致的 `sourceCommit='abc'`，每个断言应匹配预期错误码/错误文本，确保失败原因唯一。
- 新增四个单独反例：DB config mismatch、preflight/worker mismatch、rollback 文件 hash mismatch、rollback command 无法 dry-run。
- rollback dry-run 应在不覆盖目标文件的前提下解析并校验命令的源/目标、文件存在性、hash 与预期映射；生产项目标必须是明确 release 路径。

未创建候选，未启动/切换服务，未执行真实 Run、DB 写入或 3001 访问。
