# v038 BigPlayer verifier candidate

- CandidateId: `v038-bigplayer-migration-api-hermetic-20260920-2230`
- 状态：`PENDING_QA`，manifest `SEALED_FOR_QA`
- 候选路径：`.temp/candidates/v038-bigplayer-migration-api-hermetic-20260920-2230`
- Hermetic 副本：`.temp/hermetic-runs/v038-bigplayer-migration-api-hermetic-20260920-2230-copy`
- manifest SHA256：`2CE660E7DE6EAB8A3C23BD5224896F98DE96FAF5D63DB6CD9F81C92C8CE4ABA8`

## 门禁结果

- 候选内 `scripts/verify-candidate.ps1`：hermetic 副本执行总 `PASS`
- 空库 `001 -> 028`：PASS
- 旧 schema `001 -> 026 -> 027/028`：PASS
- 删除 ledger 幂等重跑：PASS
- FK 已存在、ledger 缺失中断恢复：PASS
- 缺 `window_start`：`MIGRATION_027_PREREQUISITE_NOT_READY`，PASS
- 生产只读 baseline strict compare：PASS；MariaDB `10.4.14-MariaDB`，lock waits `0`
- DDL/回滚 JSON：PASS；DDL 非事务、隐式提交、失败保留数据库和证据
- hermetic 路径复算：489 manifest 文件、0 hash mismatch、0 extras、0 绝对工作树引用、0 reparse point
- hermetic 路由回归：`69/69 PASS`
- hermetic migration/repository/frequency 回归：`156/156 PASS`

## 交接

- 已纳入 `scripts/verify-candidate.js`、`scripts/verify-candidate.ps1`、`scripts/production-schema.js`、脱敏 `verification/production-schema.json`、migration/bootstrap/API/tests。
- 失败 CandidateId 不修改、不复用；v034、v036、v037 均保持原样。
- 已交测试负责人独立验收；生产 migration、API cutover、服务重启、sync 继续冻结。
