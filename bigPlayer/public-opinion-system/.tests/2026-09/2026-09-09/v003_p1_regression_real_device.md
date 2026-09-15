# 舆情管理 P1 修复真机回归报告

- 日期：2026-09-09
- 角色：测试负责人
- 环境：Konga 映射 HTTPS 页面；本机 API `localhost:4320`
- 约束：只读验收；未触发重新分析、补偿或业务写入；未启动、占用或操作 `3001`。

## 结论

**通过本轮 P1 回归。** Facebook 概览与内容详情字段两项修复均已在真实映射页面和本机 API 上验证通过。

## 验收结果

| 编号 | 验收项 | 结果 | 真机 / API 证据 |
|---|---|---|---|
| R-01 | Facebook 概览筛选 | 通过 | 从 Discord 切换 Facebook 后 URL 为 `platform=facebook`；关键模块展示 0 数据或业务空态，无“platform is not supported” |
| R-02 | Facebook overview API | 通过 | `GET /api/public-opinion/overview` 返回 HTTP 200；响应不含 `platform is not supported` |
| R-03 | 内容详情风险等级 | 通过 | 真实负面关注级帖子抽屉展示“风险等级：关注”，与列表值一致 |
| R-04 | 内容详情分析状态 | 通过 | 同一详情抽屉展示“分析状态：已完成”，与列表值一致 |
| R-05 | 内容详情 API 契约 | 通过 | `GET /api/public-opinion/contents/{id}` 返回 HTTP 200；内容字段 `severity=attention`、`analysis_status=completed`、`sentiment=negative` |
| R-06 | 静态回归契约 | 通过 | `node --test .tests/2026-09/2026-09-09/v002_p1_facebook_detail_contract.test.js`：3/3 通过 |

## 采集限制与后续

- 当前浏览器自动化会话未暴露控制台日志读取接口；未能采集浏览器控制台记录。
- 两次截图采集均因 CDP `Page.captureScreenshot` 超时失败；可访问性树（AX）已采集，包含 Facebook 空态与详情字段文本。
- 翻译 completed、pending/running/retryable、failed 的真实样本仍未提供，延续为未验收项，不将其视为通过。
- 本轮启动的本机 API 已在验收后停止，`4320` 端口确认无监听。
