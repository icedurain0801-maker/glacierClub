# 下一候选单命令 QA 记录

- QA 日期：2026-09-20
- 规则来源：项目经理转达的“下一候选单命令 QA 规则”
- 结论：`PENDING`

## 当前状态

不存在新的 CandidateId、候选路径、manifest 和候选内 `verify-candidate` 入口，尚未到正式验收点。本报告仅记录等待状态，不构成失败判定。

## 核查结果

1. `.temp/candidates/` 当前仅有 v029-v034 候选，没有新的候选 ID。
2. 全部候选目录递归搜索均未发现 `verify-candidate` 或 verifier 入口。
3. v034 manifest 虽声明 8 项门禁为 PASS，但没有候选内单入口可执行文件；且 v034 已按规则永久拒绝，不能重命名、复用或补跑。
4. 因此未执行任何人工拼接的迁移、数据库或回归命令，避免违反新门禁规则。

## 门禁判定

| 项目 | 结果 | 说明 |
|---|---|---|
| 新候选 ID | PENDING | 尚未提供下一候选 |
| 候选内 `verify-candidate` | PENDING | 尚未提供入口 |
| 自动隔离 DB 创建/清理 | PENDING | 等待 verifier 自动执行 |
| 8 项迁移门禁 | PENDING | 不人工代跑 |
| 69/69 与 156/156 | PENDING | 等待单入口输出 |
| manifest 校验 | PENDING | 等待新候选 manifest |

## 约束执行

- v034 永久拒绝。
- 未修改业务代码、候选文件或生产库。
- 未执行生产 migration、API 切换、服务重启或 sync。

请开发负责人交付一个全新的候选 ID，并在候选内部提供可执行的 `verify-candidate` 单入口；入口必须自行创建/清理隔离 DB 并输出全部门禁结果后，QA 才能继续验收。新候选交付前，测试停止扫描和报告。
