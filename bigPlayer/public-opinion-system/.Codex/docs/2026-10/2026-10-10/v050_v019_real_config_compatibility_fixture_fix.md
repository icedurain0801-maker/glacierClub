# V019 真实配置兼容夹具修复

Status: DEV_FREEZE_READY_QA
Date: 2026-10-10

## 变更

- 保持 `DB_HOST=localhost` 仅归一为 `127.0.0.1`。
- 允许配置文件中明确存在的 `DB_PASSWORD=` 空值；缺键、重复键、其他空值、错误目标、URI 替代仍拒绝。
- 离线 memory peer 仅在签名 fixture 执行中消费已解析的 `DB_USER`/`DB_PASSWORD`，使用空值合并保留显式空密码；直接协议负测继续使用固定合成认证，避免放宽旧负测。

## 验证

- 新冻结目录：`C:\Users\Administrator\AppData\Roaming\Code\User\project manage\.temp\v019-seven-read-executor-DkvtZb`
- manifest SHA256：`e7236cd55bd91d0fba1082e7e58ee9bb8d69892739f28b20bed5b8c6b8163f86`
- 开发原始结果：`.temp/v019-seven-read-dev-2GE5k7/result.json`
- raw SHA256：`81fe39e4b5f17489db7f425889978ad765194a55e74b4e3d590d65aeff918c75`
- `--verify`、`--test`、`--verify` 通过，23/23；未读取真实生产配置、未建立真实连接。

## 边界

旧真实失败 claim 永久保留且不重放；真实重试必须使用经理重新签发的新 permit。国内 Worker、`.env`、ACL、账号和生产 DDL 均未修改。
