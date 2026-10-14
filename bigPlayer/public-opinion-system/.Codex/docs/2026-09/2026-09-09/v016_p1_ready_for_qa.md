# P1 Facebook 与详情字段：回归交接

- Status: ready_for_qa
- Owner: 项目经理
- Updated: 2026-09-09

## 开发交付

- GET `/overview`、GET `/sources` 的只读筛选白名单已增加 Facebook；写接口与未知平台仍维持原限制。
- 内容详情抽屉新增“风险等级”“分析状态”，复用既有 badge 样式。
- 开发验证：专项契约 3/3、sourceValidators 5/5、JS 语法和 diff check 通过；Facebook overview/sources 200，未知平台 400。

## QA 范围

精确 Konga 映射 URL：切换 Facebook 后关键模块与 API 正常；真实详情中风险等级、分析状态可见且正确。

## 未包含

真实翻译 A-D 样本仍缺失，继续独立待复验。
