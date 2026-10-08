# DBA 只读预检尝试记录

Status: no-go-preflight-not-connected
Date: 2026-10-08

## 授权范围

本次授权仅覆盖一次现有 DBA 身份的 2-5 分钟只读预检：目标 `LIUFUYI-2-48:3306/public_opinion`；不包括 `PO_READONLY_DB_*`、新增账号/GRANT、停服务/禁任务、FTWRL、dump/备份、DDL、切换、站点对齐或真实 Run。

## 尝试结果

执行脚本：`scripts/snapshot-production-dba-preflight.js`。

1. 第一次尝试：创建新审计目录后设置最小 ACL 失败；数据库连接 0 次，生产查询 0 次，未生成结果文件。
2. 第二次尝试：修正本地 ACL 设置方式后仍在证据目录准备阶段失败；数据库连接 0 次，生产查询 0 次，服务/任务 0 次写操作，未进入白名单查询。准备阶段失败的具体 Windows ACL 错误未保留，不能推断为数据库或 SQL 问题。

两次目录均为本次新建目录：

- `C:/ProgramData/PublicOpinion/audit/dba-preflight-1791462226636`
- `C:/ProgramData/PublicOpinion/audit/dba-preflight-1791462450691`

第二目录已由本地 `icacls` 收紧为 SYSTEM、Administrators 和当前操作者三类 FullControl；没有写入数据库证据或凭据。由于本次授权是一次性且失败即停止，未再重试；当前结论固定为 `NO_GO_PREFLIGHT_NOT_CONNECTED`，需要项目经理向用户重新申请授权后才能再次执行。

## 本地准备修复与验证

`scripts/snapshot-production-dba-preflight.js` 已改为：先验证操作者，再创建独立目录，使用 `icacls` 设置 SYSTEM/Administrators/当前操作者三类 ACL；若设置失败，仅清理本次新目录。`scripts/snapshot-production-dba-preflight.acl.test.js` 在系统临时目录验证最小 ACL、脱敏 JSON 写入、正常及模拟 ACL 失败时清理，结果 `PASS_LOCAL_PREFLIGHT_ACL`，`productionTouched:false`，1/1 通过。脱敏测试结果写入仓库上级 `.temp/po-closeout-20261008/dba-preflight-acl-local-test.json`。该测试不加载服务 env、不连接数据库，不能替代新的生产授权或 DBA 预检。

冻结哈希：预检脚本 SHA256 `1350f54f775868a643ef7632c8dafa7b491ab58c917e5d3fd19b4d09afa60`；本地 ACL 测试 SHA256 `687e17367b7aa6d4af730bb4beacacf6f0dda10d4927bf952ae21cf9d74f6096`；脱敏测试结果 SHA256 `5d83cc7f1c48684bc5c7af74b32866123cf9f7a6069f16938ada39194f44a863`。独立 QA 尚未完成，不能称生产预检通过。

## 未执行事项

两次准备尝试均先将受限 `public-opinion.env` 读入进程内存，包括 `DB_PASSWORD` 字段；没有输出或写盘该值。未建立数据库连接、未执行任何生产 SQL；未使用 `PO_READONLY_DB_*`；未改变服务、任务、数据库、锁、备份、迁移、切换或真实 Run 状态。v018 的生产入口仍为 `PRODUCTION_EXECUTION_DISABLED`。
