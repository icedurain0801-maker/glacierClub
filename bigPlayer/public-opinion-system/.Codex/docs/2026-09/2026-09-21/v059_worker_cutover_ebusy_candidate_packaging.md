---
status: independent-qa-pass
priority: P0
date: 2026-09-21
---

# Worker cutover EBUSY 候选封装修复

- v057 独立 QA 发现候选缺少 `public-opinion-worker-only-adapter.js`，导致 CLI fake preflight 无法从候选目录独立执行；v057 因此维持 FAIL，不修改原候选或 manifest。
- 新候选：`.temp/candidates/v057b-worker-cutover-ebusy-gate-20260921`。
- 补齐 CLI 直接依赖 `public-opinion-worker-only-adapter.js`，并将 v284 EBUSY 模拟测试纳入候选及 manifest。
- manifest 共 6 个文件，逐项 SHA-256 验签通过；manifest SHA-256：`F93F00E79B94DB6B6100F268F6A7D5D8C22D3D140AED1FADC80A24242EC2403A`。
- 从 v057b 根目录直接执行 `worker-only-controlled-cutover.js --preflight --controller=fake`：PASS，`apiUnchanged=true`。
- 从 v057b 根目录执行 v227、v283、v284：`12/12 PASS`。
- 测试负责人独立复核：6/6 文件 hash 匹配，候选根 fake preflight PASS，v227 `5/5`、v283 `4/4`、v284 `3/3`，`node --check` PASS；报告 `.tests/2026-09/2026-09-21/v286_worker_cutover_ebusy_v057b_independent_qa.md`。
- 当前仅获得重新申请唯一受控切换的资格，尚未执行真实切换，TapTap run 验收仍未开始。
- 未操作真实服务、数据库、API、3001 或 Worker，未创建 run。

## 真实预检退回

- 获得唯一切换授权后，切换前使用 v057b 执行真实只读 preflight；在任何服务动作前失败。
- 唯一错误：`MODULE_NOT_FOUND`，缺少 `scripts/windows-services/worker-readiness.js`。v057b 的 fake preflight 不进入真实 readiness 分支，未发现该依赖缺口。
- 已按失败即停：未执行 apply、未控制服务、未写数据库、未创建 run、未重试。
- 原 Worker 保持 `RUNNING`，Worker/API active 哈希均未变化。
- 证据：`.temp/taptap-v057b-real-preflight-missing-readiness-20260921.json`。
