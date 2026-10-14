---
candidate: v046-bigplayer-api-cutover-20260921-0200
status: PENDING_QA
---

# v046 BigPlayer API Cutover Candidate

## 变更范围

- 补齐 API release 所需的 `server/package.json` 与 runtime packaging 文件。
- 将 API staging 调整到系统临时短路径，避免 Windows 长路径复制失败。
- 对深层 npm 依赖 ACL 枚举做容错；根目录 ACL、WinSW、部署边界仍 fail-closed。
- 不触碰 TapTap；不执行生产 API 重启、Worker 重启或 sync。

## 验证证据

- API route regression：69/69 PASS。
- migration/repository/frequency regression：156/156 PASS。
- candidate verifier：PASS。
- isolated API preflight：PASS，393-file release。
- hermetic verifier：PASS，证据目录：`.temp/hermetic-runs/v046-bigplayer-api-cutover-20260921-0200-copy/verification-evidence/1789901200658_a7c9224f`。
- manifest：527 files，0 hash mismatch，0 extras，0 reparse point，0 workspace absolute-path reference。

## 当前状态

候选已封存并交测试负责人盲测。QA 明确 PASS 前，不进行生产 API cutover、服务重启或有界 sync。
