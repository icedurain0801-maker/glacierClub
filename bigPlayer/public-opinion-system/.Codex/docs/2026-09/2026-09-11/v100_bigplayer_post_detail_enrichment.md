---
date: 2026-09-11
status: implementation_complete_pending_qa
scope: bigplayer-post-detail-enrichment
owner: 开发负责人
---

# v100 BigPlayer 帖子详情正文补全记录

## 已完成

| 阶段 | 提交 | 结果 |
|---|---|---|
| 只读生产验证 | 无生产写入 | `/api/club/v1/auth/post/?postId=916457&source=0` 返回 `code=0`；`data.content` 含完整主体，目标正文标记位于 `$.data.content[3].data` |
| 设计与审查 | `ffcc92a`、`17f4fce` | 确认逐帖详情 enrichment、固定并发 4、失败保留摘要、abort 上抛、字段白名单、媒体并集、Repository 单向完整性 |
| 测试合同 | `730c92d` | 新增 916457 图文长正文 fixture；connector 7 条合同全部红灯；Repository 2 条合同为 1 PASS / 1 FAIL，证明实现缺口 |
| Repository 防降级 | `5538d3f` | 已有 `detail_enriched` 时拒绝后续 `summary_fallback` 覆盖 body/media/raw_payload；其他安全字段仍可更新；定向 `2/2`、Repository `103/103`、独立审查 PASS |
| Connector 详情补全 | `f56fe48` | 固定详情 URL 与并发上限 4；保持列表顺序；失败保留摘要并写稳定 `_contentIntegrity`；合并长正文与媒体；空值不降级元数据；窗口时间固定使用列表 `createTime`；raw payload 递归剔除敏感字段；401 刷新复用显式 account/credentialContext；致命取消广播 sibling 并等待收敛 |
| 精确提交与复核 | `f56fe48` | 以 HEAD 为底移植本需求，排除派单前 v2 cursor、分页预算、offset cap、重复页重试等脏改；干净候选 `connectorSlice 27/27`、`connectors 8/8`、定向 `9/9`，独立审查 PASS；主工作树 Server 全量 `362/362` |

## 安全边界

- 只读探测禁用 auth refresh，仅在内存中使用既有 account token；未输出 token、密文或完整 provider payload。
- 未启动真实同步、未回补历史数据、未写生产库、未执行 migration、未重启 Worker、未发版、未 push。
- 派单前已有的 connector、connector test、Repository test 工作树改动继续保留，测试提交仅包含任务 baseline 后的补丁。

## 受控历史回补策略（仅方案，未执行）

1. 前置门禁：仅在 migration 已完成、来源/默认账号授权有效、无 active run/checkpoint/scheduler lease，且项目经理单独批准生产操作后进入回补。
2. 范围控制：先限定单一 BigPlayer 来源、单一账号和明确 `historyStart`；首轮只覆盖包含帖子 `916457` 的最小时间窗，不做全历史批量回补。
3. 执行节奏：使用现有 backfill/manual sync 入队边界，保持单源单运行；不得绕过 Repository 准入、lease、checkpoint 或 Worker 互斥。
4. 验收信号：同步运行成功结束，目标帖子正文命中详情标记，媒体并集正确，`summary_fallback` 不覆盖已有 `detail_enriched`，且日志/响应无凭据泄露。
5. 扩围规则：最小窗口验收通过后，按时间窗分批扩大；每批记录 run id、窗口、成功/降级/失败计数，出现授权、lease、结构异常或降级率异常立即停止。
6. 回退方式：停止后续入队并保留已写历史；不删除内容、不清空 checkpoint、不手工改库。需要数据修复时另行评审并取得授权。

当前生产状态仍为 `NOT_ADMITTED`；本记录不构成 migration、重启、真实同步、历史回补或来源启用授权。

## 待完成

- 测试负责人盲测与回归。
- 测试通过后向项目经理返件。
