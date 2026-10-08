# Last Night 专用 reader 凭据设施只读调查

Status: blocked-external-dba-input-production-no-go
Date: 2026-10-08

## 已核事实

- 第二次受控审计的脱敏结果位于 `C:/ProgramData/PublicOpinion/audit/lastnight-reader-audit-20261008.once/result.json`，SHA256 `0C8510BCA236CEFE919B02E7A0D932DCBA1E290898527850AF9001DF98E3F7B8`。`AUDIT_TARGET_CONFIG_MISMATCH`，连接/查询均为 0，once 已消耗。受限 env 的 host/port/db/root 用户名匹配固定目标，但 `DB_PASSWORD` 非空检查为 false；未查询 reader、账号或凭据形态。
- 四项现役 WinSW 服务以 `LocalService` 运行，实际 XML 指向同一受限 `public-opinion.env`，没有 `DB_*` 或 `DATABASE_URL` 注入。受限 env ACL 只有 SYSTEM、Administrators、LOCAL SERVICE 和当前操作者的对应权限。机器级与当前操作者用户级环境仅查变量名，未见 `DB_PASSWORD` / `DATABASE_URL`；这不能代表 `LocalService` 进程环境。
- `server/src/db/repository.js` 优先使用 `DATABASE_URL`，否则使用 `DB_PASSWORD || ''`；审计脚本要求非空 `DB_PASSWORD`。这解释了审计与服务入口不等价，但**不能证明**现役服务采用 URI、空口令或其他认证方式，也不能因服务 Running 推断 root 可用。
- 仓库未发现 Credential Manager、DPAPI 或 SecretStore 的数据库凭据 resolver。没有读取或输出口令/密文，没有连接 3306，也没有修改服务配置。

## 外部交付门禁

1. DBA/运维确认生产实例六项指纹、现役服务的实际数据库认证方式及受控 DBA 交付渠道；本窗口无法从现有只读证据独立确证。不得借用 root、共享写账号或空口令试连。
2. DBA 在明确审批后建立 `po_lastnight_reader` 的精确 Host 身份，仅授予 `public_opinion` 的 `po_sources`、`po_games`、`po_communities`、`po_source_sites`、`po_accounts`、`po_credentials` 六表 `SELECT` 与必要 `USAGE`；不得有全库 SELECT、DML、DDL、PROCESS 或 GRANT OPTION。账号创建和 GRANT 不在开发会话执行。
3. 为海外独立执行器配置独立 Windows 服务身份及仅该身份可读的凭据设施。优先由运维在该身份下供给 OS 凭据保管项，并由独立 resolver 以固定目标名读取到内存；不得把口令写入共享 env、命令行、日志、仓库或证据文件。若改用 DPAPI/ACL 受限文件，须单独审查加密作用域、服务身份、轮换和备份恢复，不能假设 LocalService 可读取当前操作者的用户级保管项。
4. 代码仅接专用 reader，并在首次业务 SELECT 前验证固定 `127.0.0.1:3306/public_opinion` 的六项实例指纹、`CURRENT_USER()` 和自身 `SHOW GRANTS`。凭据设施缺失、解密失败、身份/权限漂移均零业务查询失败关闭。真实连接须另冻结脚本、独立 QA 和新的单次授权。

## 当前结论

专用 reader 是否存在、权限是否符合六表 SELECT、目标 source/account 的凭据形态均**待确认**。外部 DBA 身份和受控凭据交付未到位前，真实海外 API 采集、独立 AI 与后台生产只读接口保持 `NO_GO`。本记录仅为只读调查与方案，不是建号、部署或发版授权。
