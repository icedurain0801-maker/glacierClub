---
status: QA_PASS
scope: API scheduler readiness index compatibility
date: 2026-09-21
---

# Unified Scheduler 索引兼容修复

## 变更范围

- `server/src/db/repository.js`
  - readiness 查询同时识别 legacy `po_sync_checkpoints_window_uk` 和多站点 `po_sync_checkpoints_site_window_uk`。
  - 读取 migration ledger 后，027 已应用时只检查 site-aware 索引；未应用时只检查 legacy 索引，不同时要求两个索引。
  - 023/025/026 始终作为基础 scheduler migration；027 已应用时要求 028，保持旧 schema 的 legacy 分支兼容。
- `server/test/repository.test.js`
  - 增加 027 site-aware 索引通过、legacy 索引缺失的回归用例。
  - 增加 027 未应用时 legacy 索引通过、site-aware 索引缺失的回归用例。
  - 更新 schema harness 以区分两类索引 readiness。

## 验证

- `node --test server/test/repository.test.js`：141/141 PASS。
- `node --test server/test/bigplayerMultisiteMigration.contract.test.js server/test/repository.test.js`：通过。
- `git diff --check -- server/src/db/repository.js server/test/repository.test.js`：PASS。
- API release verifier：`PASS: verified API release (393 files)`。

## API 候选

- 候选目录：`.temp/candidates/v053-unified-scheduler-index-compat-20260921-qa/release`
- `package-release-manifest.json` SHA-256：`ED26E5FF4E21D852E187EB3E70B68AF33EFBEBCE83BF5D287244C3CAEC8A2F90`
- 未切换 4320，未重启服务，未执行 migration，未发 sync，未触碰 TapTap/Worker/3001。

## QA 建议

测试负责人已在隔离 API 候选上完成验证：release verifier 393 files PASS，定向回归 141/141 PASS，候选自身只读 readiness 在真实 027/028 schema 返回 PASS；生产仅存在 site-aware 索引且列序准确。报告见 `.tests/2026-09/2026-09-21/v277_v053_unified_scheduler_index_compat_qa.md`。
