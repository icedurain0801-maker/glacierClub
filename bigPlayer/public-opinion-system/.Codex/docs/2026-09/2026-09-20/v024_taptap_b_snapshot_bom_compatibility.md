# TapTap B 快照 UTF-8 BOM 兼容修复

## 范围

- `scripts/windows-services/worker-only-controlled-cutover.js`
- `scripts/windows-services/prepare-taptap-worker-candidate.ps1`
- `.tests/2026-09/2026-09-20/v229_worker_only_controlled_cli.test.js`

## 修复

Windows PowerShell 5.1 使用 `Set-Content -Encoding utf8` 生成的 Stage C
`verified-snapshot.json` 带有一个 UTF-8 BOM。B CLI 现在仅在读取该快照的
边界剥离一个开头 BOM，然后继续使用严格的 `JSON.parse`。

重复 BOM、UTF-16、畸形 JSON 和缺少必要结构仍会被拒绝；没有放宽快照哈希、
路径或 API/3001 观察边界。Stage C 快照写入改为显式无 BOM 的 UTF-8。

## 隔离验证

- Windows PowerShell 5.1 实际写入单 BOM 快照后，B CLI 通过。
- 无 BOM 快照通过；双 BOM、UTF-16、畸形 JSON、缺失 `sha256` 均拒绝。
- `v229_worker_only_controlled_cli.test.js`：17/17 通过。
- `v240_taptap_stage_c_candidate_prepare_contract.test.ps1`：通过。
- Node/PowerShell 解析及 `git diff --check`：通过。

## 边界

第七候选 `worker-release-taptap-20260920-seventh7c3a` 只读保留，未续跑 B。
本修复未执行真实 C/B/D、服务控制、重启或补跑。
