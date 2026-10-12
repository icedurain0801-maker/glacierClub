---
date: 2026-09-22
status: FAIL
scope: init-release-candidate.js v340 four-gate independent review
---

# v340 `init-release-candidate` 独立门禁复核

## 结论

**FAIL，不能据此放行新的 READY 候选。**

现有自动化测试通过，但第 4 项“rollback command dry-run 可执行”未闭合：脚本只验证 rollback 对象路径存在，没有执行或解析每条 `restoreCommand`。因此当前实现无法证明回滚命令本身可执行。

## 验证结果

| 门禁 | 结果 | 证据 |
|---|---|---|
| 真实非敏感配置计算 DB 指纹 | PASS | `configFingerprints()` 读取 `DB_HOST`/`DB_NAME`，通过 SHA-256 计算；worker evidence 与 preflight 输出分别和配置指纹比对（`init-release-candidate.js:84-109`）。未读取或输出密码/token。 |
| preflight / worker evidence / manifest 互引 | PASS | `runPreflight()` 校验 candidate/evidence/sourceCommit、platform、subject、workerPath 与两项 DB 指纹；manifest/provenance/READY 再校验 candidateId、evidenceId、workerEvidence 完全一致（`init-release-candidate.js:47-59,153-156`）。 |
| rollback 对象存在性与 hash | PASS | worker rollback 文件存在、位于 rollback release 内、SHA-256 与实际文件一致；每个非测试 payload 文件均映射到上一版本实体并计算 hash（`init-release-candidate.js:74-80,127-136`）。 |
| rollback command 隔离 dry-run | FAIL | `validateRollbackDryRun()` 只收集带 `rollback.sha256` 的对象，并执行 `Test-Path`；没有执行、解析或验证 `rollback.restoreCommand`，也没有验证 worker evidence 的 `rollbackCommand` 可执行（`init-release-candidate.js:41-46`）。 |

## 自动化与反例

- `node --test scripts/init-release-candidate.test.js`：**8/8 PASS**。
- 已覆盖的反例：相对依赖缺失、preflight 失败、candidateId/目录名不一致、外部依赖、旧候选标识、checksum mismatch、platform/subject/path/commit/DB fingerprint 不匹配、rollback 路径缺失，均不能生成 READY。
- 独立静态反例：将任意不存在/不可执行的 `restoreCommand` 写入 rollback 映射时，当前 dry-run 仍只按对象路径通过；代码路径不会读取该命令。该缺口不被现有 8 个测试覆盖。
- `node --check scripts/init-release-candidate.js`：PASS。
- 未访问 3001，未执行真实 Run，未连接或写入数据库，未创建候选。

## 放行前要求

补齐隔离 rollback dry-run：对每个 `restoreCommand` 做受控解析/试运行，仅允许预期的 `Copy-Item -LiteralPath ... -Destination ... -Force` 或明确的 test-only remove 命令；必须验证源路径、目标路径均在隔离目录内，且任何命令失败返回非零。补充对应反例测试后，再重新运行四项门禁。
