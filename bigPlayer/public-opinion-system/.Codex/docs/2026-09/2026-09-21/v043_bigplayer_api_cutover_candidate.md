# v043 BigPlayer API cutover candidate

- CandidateId：`v043-bigplayer-api-cutover-20260921-0025`
- 状态：`PENDING_QA`，manifest `SEALED_FOR_QA`
- 候选：`.temp/candidates/v043-bigplayer-api-cutover-20260921-0025`
- Hermetic：`.temp/hermetic-runs/v043-bigplayer-api-cutover-20260921-0025-copy`
- manifest SHA256：`25E8C9FFDA5C2363BB6FB46BB5493FA286905D50B5E05EEE944D67E04927D821`

## 完整性与验证

- manifest：527 文件、0 hash mismatch、0 extras、0 reparse point、0 工作树绝对路径引用
- 候选内 verifier：PASS；空库、旧 schema、ledger 重跑、FK 中断、fail-fast、生产 strict compare、DDL/回滚证据均 PASS
- API 路由：`69/69 PASS`
- migration/repository/frequency：`156/156 PASS`
- `prepare-services.ps1 -Mode Apply` hermetic 隔离 preflight：PASS
- API release：393 文件，verify-api-release PASS；WinSW 同名布局、ACL 白名单、dry-run 命令校验 PASS

## 候选补齐

- `server/package.json`
- 完整 `scripts/windows-services/` 服务/验证/回滚脚本
- `deployment/api-rollback.json`：保留旧 API release、包装器 hash 与回滚边界
- 生产迁移后脱敏 baseline：`verification/production-schema.json`

## 边界

- v038、v039、v040、v041、v042 不修改、不复用。
- 本候选尚未触生产 API cutover、服务重启或 sync；等待 QA 独立验收。
- TapTap、Worker 业务代码和其他页面不在本候选变更范围。
