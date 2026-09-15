---
date: 2026-09-11
status: code_verified_production_admission_pending
scope: bigplayer-post-content-integrity
owner: 项目经理
---

# v097 BigPlayer 正文完整性 P0

## 已确认缺陷

境内 / 超能世界国服版 BigPlayer 帖子 `916457`（标题“重新认识各类减伤及其效果（中）——免伤型和抵御型减伤”，2026-09-09 23:56:31）在舆情库中仅保留引言和图表，原帖主体分析段落缺失。该问题会使 AI 分析、风险判断和用户页面内容失真。

## 唯一待办

| 状态 | 事项 | 验收 | 负责人 |
|---|---|---|---|
| done | 对照原始响应、connector 解析、清洗/截断、DB 字段与页面，定位正文丢失层 | list payload 为摘要；固定详情接口提供完整正文 | 开发负责人 |
| done | 最小修复 | 详情补全、失败保留摘要、防覆盖、脱敏和取消合同均独立通过 | 开发负责人 / 测试负责人 |
| blocked_external | 历史遗漏内容受控回补 | 先完成生产迁移、可信 Worker、来源/凭据门禁；再单帖 `916457` 验收，不批量回补 | 运维 / 发布负责人 |

## 约束

- 本轮不启动真实同步、不重抓历史内容、不删数据、不写入来源/凭据、不发版或 push。
- 解析保留正文文本，不能用图片、摘要或首段替代主体。

## 当前诊断

帖子 `916457` 的 DB 落库字段不存在二次截断；缺失发生在 BigPlayer feed/list 上游 payload，本身仅携带正文摘要。下一步需只读验证对应详情接口是否提供完整正文，再以最小 enrichment 补齐。禁止以 list 摘要或图片替代正文；本轮不执行历史批量回补。

## 修复与独立验收

已固定详情接口 `/api/club/v1/auth/post/?postId=<id>&source=0`，并发上限 `4`。详情失败保留 list 摘要并写入 `_contentIntegrity`；`null` / 空字符串不覆盖列表元数据；窗口时间使用 list `createTime`；raw payload 递归脱敏。测试负责人盲测详情 `10/10 PASS`、Server `362/362 PASS`，P0/P1/P2 均为 `0`。实现/测试记录：`.Codex/docs/2026-09/2026-09-11/v100_bigplayer_post_detail_enrichment.md`、`.tests/2026-09/2026-09-11/v101_bigplayer_post_detail_enrichment_regression.md`。

通过范围只限代码与隔离合同：未迁移、未重启 Worker、未真实同步、未启用来源、未回补历史内容、未发版或 push。生产准入完成后，首个回补任务固定为单帖 `916457`，验证原文完整入库和页面可见，再决定是否另立批量回补任务。
