# 支付配置管理新增 Terminal3 / Xsolla

日期：2026-10-20

## 变更

- 方案类型由六种扩充为八种，新增 Terminal3支付、Xsolla支付。
- Terminal3 配置 publicKey（公钥）、privateKey（私钥）、sandBox（沙盒支付）。
- Xsolla 配置 projectId（项目ID）、apiKey（API密钥）、notifyKey（通知密钥）、sandBox（沙盒支付）。
- 两种类型均不配置 gameId；公钥和私钥沿用现有中文名，其余字段补充中文名称。
- 沙盒支付必选：true 为沙盒环境，false 为正式环境；初始不默认选择环境。
- 下拉字段纳入类型独立内存草稿与必填校验，false 选项可正确恢复；密钥使用密码输入框。
- 同步页面需求说明、设计文档与自动化回归脚本，更新资源版本避免缓存。

## 文件

- admin/config/paymentConfigManagement.html
- admin/config/paymentConfigManagement.js
- docs/design/feature-payment-config-management.md
- .tests/2026-10/2026-10-20/payment-config-management.test.cjs

## 验证与边界

- JavaScript 语法检查通过。
- Playwright 检查八种类型字段、必填、提交、沙盒选择与草稿、密钥保护、需求说明及 1920/1440/375px 视口。
- 无真实支付提交，不存储或复制截图示例凭据，不新增依赖，不重启本地服务，不改动大玩家与舆情系统。
