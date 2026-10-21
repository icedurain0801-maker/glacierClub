# Checkout 支付字段顺序调整

Status: approved
Updated: 2026-10-21

## 变更

Checkout 支付的渠道字段从 `processingChannelId → apiKey → authorizationKey → webHookSignKey` 调整为 `apiKey → processingChannelId → authorizationKey → webHookSignKey`。

## 边界与验收

- 仅调整 Checkout 表单和需求说明中的显示顺序；字段名称、控件类型、必填校验和敏感字段处理保持不变。
- 浏览器中选择 Checkout 支付后，`apiKey` 位于 `processingChannelId` 之前。
