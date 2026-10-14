# V019 真实 R2 字段元数据诊断

Status: DEV_FREEZE_READY_QA / REAL_RETRY_NOT_STARTED
Date: 2026-10-10

真实新 permit 已成功完成连接、R1、事务只读启动，并在 R2 字段契约处返回 `MYSQL2_FIELDS_REJECTED`。为定位真实 MariaDB 类型差异，字段事件现在在契约拒绝前以非敏感元数据形式记录 `name`、`columnType`、`flags`、`characterSet`；不记录任何配置、账号、token 或正文值。

本改动只增加失败前诊断证据，不放宽字段白名单，也不重放 nonce `1530fbfc63ab57687d77e16a1ecd5f53`。待新冻结包经独立 QA 后，再由项目经理签发新 permit 获取 R2 实际元数据并据此制定最小类型白名单修复。
