---
status: qa_pass_release_review
date: 2026-09-21
candidate: v066b-bigplayer-comment-window-integration-20260921
manifest_sha256: F7FB68F221963F8DA4019CCC6D3C8A1CCDA1826A55D32F48AD559888BB23A810
---

# BigPlayer 评论窗口 v066b 变更记录

## 功能范围

- `listDomesticBigPlayerCommentGaps` 按 source、account、site 和 `[publishedFrom,publishedTo)` 持久窗口严格隔离。
- Worker 仅消费合法、非未来且最多七天的 BigPlayer 持久窗口，并将同一窗口传递到评论/回复 checkpoint 与 connector。
- 声明存在评论但接口空成功时转为可重试 `partial`，不得伪报成功 0 条。
- connector 与 scheduler 文件未扩面；正式工作树未落盘。

## 候选身份

- 冻结基线：`v058f-risk-severity-formal-integration-20260921`；manifest SHA256：`1BB0CFFCF660124FA421C1615F024CFE2E9080C308F3B7260A14537AE525FE1E`。
- v066 因 manifest 与 provenance 的 baseline 标识冲突被封存且未放行。
- v066b 仅修正候选元数据并重新签名；五个 overlay 文件与 v066 逐字节 `5/5 MATCH`。
- Overlay：`server/src/db/repository.js`、`server/test/repository.test.js`、`server/test/bigplayerEffectiveWindow.test.js`、`worker/src/worker.js`、`worker/test/worker.test.js`。

## 开发验证

- Node check：PASS。
- v066 功能定向回归：`240/240 PASS`；v066b 重签后最小目标与身份校验：`241/241 PASS`；两者测试集合不同。Worker 核心：`93/93 PASS`；connector 合同：`59/59 PASS`。
- Worker 全量：`265/266 PASS`，唯一失败为已登记基线；deadline 时间敏感用例独立连续 `3/3 PASS`。
- Server 全量：`482/493 PASS`，11 项为已登记基线/环境失败；新增失败 `0`。
- 未写数据库、未启动真实 run、未操作服务、未访问 3001、未发布或 push。

## 独立 QA

- 结论：`QA_PASS_RELEASE_REVIEW`，仅限候选层；报告 `.tests/2026-09/2026-09-21/v318_v066b_bigplayer_comment_window_qa.md`。
- Manifest 647 项密封 PASS；baseline 为冻结 v058f；五个 overlay 与 v066 `5/5` 逐字节一致。
- 最小目标 `241/241 PASS`、Worker 核心 `93/93 PASS`、connector `59/59 PASS`、deadline `3/3 PASS`、关键 repository/worker `11/11 PASS`。
- Worker 全量 `265/266` 与 Server 全量 `482/493` 仅包含既有 baseline/environment failures；`newFailures=0`。
- 可交项目经理进入发布评审；本结论不授权真实 run、正式落盘、发布或 push。

## v323 只读根因复核

- 真实 Run 结论保持 `BLOCKED`，继续冻结；未创建 Run、未写入/清理数据库、未改配置或服务、未访问 3001、未发布或 push。
- 已确认 config 仅 1 个站点，`site-*` 与既有 registry `legacy-*` 不一致；该不一致是后续多站点/子 Run 的确定性风险，但不会在当前单站手动路径中必然触发 `MULTISITE_SITE_REGISTRY_MISMATCH`。
- 当前确定性 admission 硬门禁是 migration 029 未登记，且 `po_sync_runs` 尚缺 `site_url_snapshot`、`last_request_at`。
- 85 条 stale running checkpoint 均为 `lease_until` 非空且已过期：`site_id=NULL` 68 条、legacy 17 条；不得直接删除、重置 cursor 或批量改写 identity。
- 最小修复方向为先获批应用 029，再将 source config 对齐既有 legacy registry 身份；85 条 checkpoint 另行备份、quarantine 与回滚审批。未获四项授权前不流转真实 Run。
