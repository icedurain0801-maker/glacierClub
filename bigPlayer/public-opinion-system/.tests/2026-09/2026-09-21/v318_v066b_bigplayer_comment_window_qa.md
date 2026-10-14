---
status: pass
priority: P0
date: 2026-09-21
role: test-owner
candidate: v066b-bigplayer-comment-window-integration-20260921
---

# v066b BigPlayer 评论窗口独立盲测与回归

## 结论

**QA_PASS_RELEASE_REVIEW（候选层）。**

v066b 已通过身份、密封、目标回归和 BigPlayer 评论缺口关键合同验收。未连接数据库、未启动真实 run、未访问 `3001`、未修改正式路径、未发布或 push。

## 身份与范围门禁

- 候选：`.temp/candidates/v066b-bigplayer-comment-window-integration-20260921/`
- manifest：647 项，SHA256 `F7FB68F221963F8DA4019CCC6D3C8A1CCDA1826A55D32F48AD559888BB23A810`。
- 冻结基线：`v058f-risk-severity-formal-integration-20260921`，base manifest SHA256 `1BB0CFFCF660124FA421C1615F024CFE2E9080C308F3B7260A14537EA525FE1E`。
- READY 与 provenance 均声明同一 baseline、同一 manifest；候选密封校验 PASS。
- 五个业务 overlay 与已封存 v066 逐字节一致：`repository.js`、`repository.test.js`、`worker.js`、`worker.test.js`、`bigplayerEffectiveWindow.test.js` 均 `5/5 MATCH`。
- v066 原候选未修改。

## 目标回归

- v066b 最小目标与身份集合：`241/241 PASS`。
- Worker core：`93/93 PASS`。
- connector contracts：`59/59 PASS`。
- deadline 隔离复跑：连续 `3/3 PASS`。
- `node --check`：候选验证脚本涉及文件全部通过。
- `verify-candidate.ps1`：PASS；最终输出 `HERMETIC_CANDIDATE_VERIFIED_WITH_DOCUMENTED_BASELINE_FAILURE`。

## 关键盲测用例

独立执行 v066b 候选中的目标集合：

- `server/test/bigplayerEffectiveWindow.test.js`：`2/2 PASS`。
- repository/worker 关键过滤集合：`11/11 PASS`。

覆盖结果：

- source/account/site 与精确 `[publishedFrom,publishedTo)` 窗口组成 checkpoint identity，并隔离同窗并发 claim。
- 国内 BigPlayer gap scan 将声明评论缺口派发到同一 source/account/site/window。
- 已有 active lease 时不重复入队，重放保持 task identity 与窗口。
- precreated 有界 run 使用持久窗口，不读取旧 `historyStart`；未来结束或 windowless run 在 connector 前 fail-closed。
- `declaredComments > validPersistedComments` 的缺口进入评论 checkpoint。
- 评论接口空成功页不会伪报成功，run 进入 partial，checkpoint 保留可重试状态。
- site-aware checkpoint、分页提交、lease owner fencing 和多站点子任务保持隔离。

## 全量基线说明

- Worker full：`265/266 PASS`，唯一失败为已记录 baseline failure；READY 标记 `newFailures=0`。
- Server full：`482/493 PASS`，11 项为已记录 baseline/environment failures。
- 全量基线失败不属于 v066b 五文件 overlay，未发现新增失败。

## 终态

候选层可回传项目经理进入发布评审。测试负责人不执行数据库验收、真实采集、发布、合并、tag 或 push。
