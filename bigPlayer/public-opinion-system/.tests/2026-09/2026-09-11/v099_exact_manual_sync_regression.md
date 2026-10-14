# Exact Manual Sync 合同独立盲测报告

- 日期：2026-09-11
- 测试角色：测试负责人
- 范围：manual sync 单事务合同、同源 active run 互斥、API/reset、scheduler/legacy fallback
- 边界：仅本地/隔离测试；未执行生产 migration、Worker 重启、来源启用、真实同步、历史回补、发版或 push

## 执行结果

| 检查 | 结果 |
|---|---:|
| Server repository/API/migration 定向测试 | 19/19 PASS |
| Worker scheduler/legacy fallback 定向测试 | 12/12 PASS |
| `node --check`（repository、API、scheduler adapter、Worker） | 4/4 PASS |
| `git diff --check` | PASS（仅 LF/CRLF 提示） |

## 合同覆盖

- 023 后 run 创建显式写入 `source_id` 与 `trigger_type`；manual 为 `trigger_type='manual'`，legacy fallback 为 `trigger_type='legacy'`。
- 指定 source 的 start 只创建一条 queued manual run；同 source/account/mode 重复 start 幂等复用，不产生双 active run。
- reset 遇活动 run、活动 checkpoint 或 scheduler lease 稳定拒绝，不重置或取消活动任务。
- disabled source、未授权/过期账号、缺失凭据、旧或不可验证 schema 均 fail-closed。
- scheduler lease 与 manual/legacy 竞争互斥；scheduled slot merge 不接收 manual/legacy intent。
- 无 unified scheduler slot 的兼容路径显式走 legacy 入队并保留 source 身份；既有 runOnce 行为通过。

## 缺陷分级

- P0：0
- P1：0
- P2：0

## 结论与边界

**代码合同：PASS，缺陷 0。** 本地合同证明同源不会因重复 manual start 或 scheduler 竞争产生双 active run，API/reset/fallback 行为符合约定。

本报告不改变生产准入结论：生产 migration 023、可信 Worker 制品/模式、来源启用状态、默认账号与真实凭据授权仍需外部核验；在这些前置完成前，生产同步仍为 `NOT_ADMITTED`，不得宣称 8/9 号数据已恢复。
