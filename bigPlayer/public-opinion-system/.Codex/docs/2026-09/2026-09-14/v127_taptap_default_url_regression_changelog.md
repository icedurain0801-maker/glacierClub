# v127 TapTap 超能世界默认地址回归修复

日期：2026-09-14

## 变更

- TapTap 默认网页地址改为匹配包含“超能世界”的社区名称，覆盖“超能世界国服版”等实际名称。
- 其他社区仍不注入默认地址。

## 验证

- `node --check admin/PublicOpinion/assets/sources.js`：通过。
- `node --test admin/PublicOpinion/assets/source-status.test.js`：15/15 通过。

## 范围

仅修复默认 URL 匹配与预填逻辑，未修改字段精简、频率、同步或其他平台。
