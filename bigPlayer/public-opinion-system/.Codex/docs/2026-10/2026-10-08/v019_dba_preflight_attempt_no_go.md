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

`scripts/snapshot-production-dba-preflight.js` 已改为：先检查固定目标指纹与证据输出顶层字段白名单，再验证操作者、创建独立目录，使用 `icacls` 设置 SYSTEM/Administrators/当前操作者三类 ACL；本地准备全部成功后才读取服务 env。若 ACL 设置失败，仅清理本次新目录。`scripts/snapshot-production-dba-preflight.acl.test.js` 在系统临时目录验证最小 ACL、脱敏 JSON 写入、禁止额外顶层字段、固定目标漂移在 ACL 操作前拒绝，以及正常和模拟 ACL 失败时清理。测试结果 `PASS_LOCAL_PREFLIGHT_ACL`，`productionTouched:false`，凭据读取 0、数据库连接 0，1/1 通过；`node --check scripts/snapshot-production-dba-preflight.js` 通过。脱敏测试结果写入仓库上级 `.temp/po-closeout-20261008/dba-preflight-acl-local-test.json`。该测试不加载服务 env、不连接数据库，不能替代新的生产授权或 DBA 预检。

冻结哈希：预检脚本 SHA256 `888073d986c1eac48424be359221238dfbafbe57b4c02d0dac387260e34c1b08`；本地 ACL 测试 SHA256 `0b1e50dc8067a47e05148e8dbc7e5a83d6e223664809bf4ae1bffc98952c4d64`；脱敏测试结果 SHA256 `0c2040e911b1dbf2fbd8b077bd08e341d8f4d6a25423ba18e013c012c64beab0`。独立 QA 尚未完成，不能称生产预检通过。

## 未执行事项

两次准备尝试均先将受限 `public-opinion.env` 读入进程内存，包括 `DB_PASSWORD` 字段；没有输出或写盘该值。未建立数据库连接、未执行任何生产 SQL；未使用 `PO_READONLY_DB_*`；未改变服务、任务、数据库、锁、备份、迁移、切换或真实 Run 状态。v018 的生产入口仍为 `PRODUCTION_EXECUTION_DISABLED`。

## 重新授权后的单次尝试

项目经理会话在用户明确重新授权后转达：只允许一次现有 DBA 身份的 2–5 分钟生产只读预检。执行前复核脚本 SHA256 仍为 `888073d986c1eac48424be359221238dfbafbe57b4c02d0dac387260e34c1b08`，工作树中的脚本未变，固定目标为 `LIUFUYI-2-48:3306/public_opinion`；受限 env 文件与审计根目录存在。执行 `node scripts/snapshot-production-dba-preflight.js` 恰好一次，退出码 1，在 `TARGET_CONFIG_MISMATCH` 失败关闭：env 的 host 配置与冻结目标不符，port 与 database 匹配。该检查在 `mysql.createConnection` 之前，故数据库连接 0、生产查询 0；未继续修改配置或重试。此次尝试读取了服务 env 到进程内存，但没有输出或写盘凭据。

脱敏结果位于 `C:/ProgramData/PublicOpinion/audit/dba-preflight-1791463744824-30444/result.json`，SHA256 `89310a245a28642a768211931722b43d9b5dd5922de3f29d25e20d52af70a52f`；仅包含白名单顶层字段与 `NO_GO/TARGET_CONFIG_MISMATCH`，无凭据字段、原始 SQL 或业务行，且身份/进程聚合为空。新审计子目录 ACL 无继承，仅当前操作者、Administrators、SYSTEM 三类 FullControl。结果已交测试负责人独立验收并回报项目经理；本次单次授权已耗尽，生产继续 `NO_GO`，不得将其表述为只读预检通过。
