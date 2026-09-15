# 概览页面 404：静态恢复交接

- Status: ready_for_qa
- Priority: P0
- Owner: 项目经理
- Updated: 2026-09-09

## 已完成恢复

- 来源：`stash@{4}^3:bigPlayer/admin/PublicOpinion/`，稳定快照 `b4d5d3b1955fe6c2814e192a3b1eed5dff059920`。
- 仅恢复 `bigPlayer/admin/PublicOpinion/` 的 20 个文件；未整体应用 stash，未改 Apache、Konga、8088 或业务数据。
- 来源与落盘文件哈希 20/20 一致；HTML 静态引用缺失 0。
- 用 `Host: lfy3001.dev.q1op.com` 访问目标入口，已从 404 变为 `HTTP 200 OK`。

## QA 验收范围

1. 在 3000 免登录静态实例中打开概览入口，确认 HTTP 页面非 404。
2. 验证地区、社区、平台、日期等筛选在刷新和进入详情后返回时保持。
3. 验证内容详情入口可达并可返回概览。

## 已知风险

- `4320` API 当前未监听，是静态入口恢复后的独立次级问题；如阻断动态数据加载，须单独报告，不能将静态 404 复发归因于此。
- 为保持审计快照字节一致，来源中 6 个文件的 EOF 空白行未清洗；`git diff --check` 的该类提示不代表本次恢复内容被改写。
