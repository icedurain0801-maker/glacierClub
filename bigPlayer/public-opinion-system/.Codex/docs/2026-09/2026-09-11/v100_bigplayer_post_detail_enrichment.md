---
date: 2026-09-11
status: tests_red
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
| Repository 防降级 | `5538d3f` | 已有 `detail_enriched` 时拒绝后续 `summary_fallback` 覆盖 body/media/raw_payload；其他安全字段仍可更新 | 定向 `2/2`；Repository `103/103`；独立审查 PASS |

## 安全边界

- 只读探测禁用 auth refresh，仅在内存中使用既有 account token；未输出 token、密文或完整 provider payload。
- 未启动真实同步、未回补历史数据、未写生产库、未执行 migration、未重启 Worker、未发版、未 push。
- 派单前已有的 connector、connector test、Repository test 工作树改动继续保留，测试提交仅包含任务 baseline 后的补丁。

## 待完成

- 实现并复核 connector detail enrichment。
- 独立审查、全量回归、测试负责人交接、项目经理返件。
