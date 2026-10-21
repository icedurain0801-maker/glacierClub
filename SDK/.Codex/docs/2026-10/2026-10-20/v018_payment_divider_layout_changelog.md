# 支付分隔线与Checkout标签修复

- Xsolla、Adyen、PayerMax、Waffo、Checkout分隔线移到方案名称后、渠道基础字段前；其他类型原顺序不变。
- Checkout处理渠道ID、Webhook签名密钥标签允许换行，避免被输入框遮挡。
- 不修改字段值及支付规则，不自动推送。
