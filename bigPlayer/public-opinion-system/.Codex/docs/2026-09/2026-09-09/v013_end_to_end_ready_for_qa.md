# 舆情概览：端到端验收交接

- Status: ready_for_final_qa
- Priority: P0
- Owner: 项目经理
- Updated: 2026-09-09

## 开发交付证据

- 精确 HTTPS 页面返回 200，已完整渲染。
- 精确域名下 `communities`、`overview?period=today`、`sources` 实际 API 均返回 200。
- 开发侧控制台无 error/warning 与“舆情 API 暂不可用”。
- 本机服务：PID `28292`，监听 `:::4320`，仅用于本次验收。
- 启动修复：补齐缺失的 `server/src/connectors/discordConnector.js` 默认禁用、fail-closed 连接器，使服务能启动；未写业务数据。

## 最终 QA 目标

仅精确 Konga 映射 URL；验证页面、三个筛选、关键模块、内容详情往返、翻译 A-D、情感分析、实际 API 和控制台。全部满足后才可报告完成。

## 收尾

测试结束后停止 PID `28292`，并回传停止结果。
