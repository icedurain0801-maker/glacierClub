# v028 完整交付硬门禁报告

- 日期：2026-09-20
- 候选范围：migration + test bootstrap + 新 API（不可拆分）
- 结论：**PENDING，尚未到验收点，不给恢复结论**

## 当前状态

- `C:\ProgramData\PublicOpinion\releases` 当前最新 API 候选仍为 `release-20260920-1621-v027`，未发现包含正式 migration 与 test bootstrap 的新完整候选。
- 生产只读 schema 仍缺 `po_sync_runs.parent_run_id`。
- 测试 bootstrap 未正式执行 027 migration；完整回归此前为 `67/69`，两个 sync-runs 列表/详情用例因缺列返回 500。
- 当前尚未交付候选，因此不能判定验收失败；v028 要求的空库安装、旧 schema 升级、幂等重跑、失败恢复、DDL 锁影响、回滚边界和生产 schema 迁移均待验收。

## 动作边界

- 旧 API 已保持稳定运行；4311/Worker 不变。
- 未执行生产迁移、API 切换或 sync。
- 开发下一步必须交付单一完整候选及隔离链证据；QA 不修改业务代码或生产数据。收到后再按 v028 验收表给出 PASS/FAIL。
