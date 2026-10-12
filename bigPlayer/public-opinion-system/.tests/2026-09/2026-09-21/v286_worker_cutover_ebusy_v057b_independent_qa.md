---
status: pass
priority: P0
date: 2026-09-21
role: test-owner
---

# v057b Worker cutover EBUSY 独立复核

## 结论

**PASS（仅隔离候选复核）。** 候选可从自身根目录独立执行 fake preflight，依赖完整；满足重新申请唯一受控切换的测试门槛。未执行真实服务切换，不代表线上切换完成。

## 候选与 manifest

- 候选：`.temp/candidates/v057b-worker-cutover-ebusy-gate-20260921`
- manifest SHA-256：`F93F00E79B94DB6B6100F268F6A7D5D8C22D3D140AED1FADC80A24242EC2403A`
- manifest 声明 6 个文件；逐项 SHA-256 复算：6/6 匹配
- `public-opinion-worker-only-adapter.js` 已包含，候选根目录执行无 `MODULE_NOT_FOUND`

## 独立执行结果

| 验证项 | 结果 |
|---|---:|
| `node scripts/windows-services/worker-only-controlled-cutover.js --preflight --controller=fake` | PASS；`apiUnchanged=true`，仅 fake `sc.exe query` 观察 |
| `v227_worker_only_cutover_transaction.test.js` | 5/5 PASS |
| `v283_worker_cutover_mutation_gate.test.js` | 4/4 PASS |
| `v284_worker_cutover_ebusy_simulation.test.js` | 3/3 PASS |
| 合计门禁测试 | 12/12 PASS |
| `node --check`（3 个脚本） | PASS |

覆盖确认：活 wrapper/Node 或文件锁时禁止复制且字节不变；完全退出并独占访问后才复制；mutation gate 超时不 install/start 且字节不变；rollback 使用同一门禁。

## 操作边界

- 未操作真实 Worker/API/3001；
- 未写数据库；
- 未创建 run；
- 未修改候选或业务代码。

## 交接

已向项目经理回执 PASS。后续如需真实切换，必须由项目经理重新申请唯一受控切换授权；本报告不授权真实服务动作。
