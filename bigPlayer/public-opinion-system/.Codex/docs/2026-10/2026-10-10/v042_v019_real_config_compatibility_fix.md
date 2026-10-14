# v019 首次真实七读配置兼容修复

Status: DEV_FIX_PENDING_QA / REAL_RETRY_NOT_STARTED / ORIGINAL_CLAIM_PERMANENT_HOLD
Date: 2026-10-10

首次真实入口在连接前返回 `MYSQL2_CONFIG_REJECTED`：原输出 `.temp/v019-seven-read-output-f47c8c5baf868668700b09d65aa41753/result.json` SHA `4d72698d9f3deed8a4c69e9627de004c1baa898e28ec2880b3edba0cdfbc40d5`，claim SHA `463e7fbbc4982909168f8c2f100294f9620fa07d535ed59e5608d2f8e82b8910`，经理 receipt SHA `231d7821c146d89ddafc1b0a299f0913611f81ec78abf1ee09f9017c8d456cd2`。证据为 `configurationReads=1`、`actualMysql2Loaded=false`、`realConnectionOpened=false`、`selects=0`、无 discovery、trace 仅 `DESTROY`。原 nonce 永久保留，不重放。

受控诊断只输出结构事实：`.env` 为 50 行、1801 字节、47 个唯一 `KEY=value` 键，无重复/坏行/`DATABASE_URL`；五 DB 键齐全。`DB_HOST` 是 localhost 回环类别，端口是 3306，数据库是固定 `public_opinion`；用户名属于既有 root 类别，密码键显式存在但为空。没有输出任何值、密码、URI 或其他 secret 正文。

最小修复仅在隔离解析器：空密码只有在 `DB_PASSWORD=` 明确存在时允许；`localhost` 归一化为固定 `127.0.0.1`。仍拒绝缺键、重复键、其他空键、非固定目标、`DATABASE_URL` 替代和其他文件；没有 root/空密码 fallback，没有修改 `.env`、ACL、身份或国内服务。新增兼容回归，真实失败 claim 不重放。

新代码必须另冻、另发单次许可并交独立聚焦 QA 后才能重试真实七读；本文件不代表真实重试已授权或已执行。
