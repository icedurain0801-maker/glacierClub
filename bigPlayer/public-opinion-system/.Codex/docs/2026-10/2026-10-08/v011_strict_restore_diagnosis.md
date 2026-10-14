# 严格恢复修复：诊断与执行边界

Status: strict-import-succeeded-integrity-reference-missing-no-go

## 元数据诊断

原dump SHA256仍为ea842a68330a186cb4ec4cd9397c3aaf8b081c0dec3a042b74919f5979884cbb，831426517字节。安全诊断程序只输出统计，不输出原始行。

mysql.exe --help与--no-defaults --help均显示default-character-set=auto、binary-mode=FALSE。显式指定后显示utf8mb4、TRUE。本机CurrentCulture的ANSI/OEM代码页均936；这不单独证明mysql进程实际选择的字符集。dump头声明SET NAMES utf8mb4及SQL_MODE=NO_AUTO_VALUE_ON_ZERO。第861行1044420字节、32169个非ASCII字符、1147个字面反斜线n，UTF-8读取未含替换字符。

原客户端未指定utf8mb4，dump声明的服务端字符集不能替代客户端词法解析参数。字符集不匹配是有证据支持的待验证原因，但尚未通过仅改变单一参数的对照复现证实；不能把Unknown command归因于业务文本自身错误，也不能声称已排除所有dump/配置问题。

## 单次修复执行

受审脚本为仓库根.temp/po-closeout-20261008/strict-restore-once.js。新目标C:/ProgramData/PublicOpinion/audit/restore-strict-20261008-r4，43312/server_id20261013，同版10.4.14。端口预检、空目录、源SHA、至少15GiB空间、SYSTEM/Administrators ACL先于恢复。mysqld首参--no-defaults，127.0.0.1绑定、关闭binlog和event_scheduler，核对port/server_id/datadir/version后才写隔离库。

mysql客户端首参--no-defaults，显式TCP、目标端口、utf8mb4、binary-mode、64M packet；无force、无自动重试。初始化工具Windows版本不支持no-defaults选项；使用显式新datadir/port、不安装服务、不启用远程root，实际运行服务独立以no-defaults启动。子进程不继承数据库口令环境。每2秒检查空间，低于10GiB或运行超过30分钟停止自有child；错误仅以代码/行号计数输出，原始日志留受限目录。

本地只读审查指出空间监测和mysqld启动失败等待两处缺口，执行前已修复。允许一次严格导入，任一失败即停止、不重试。

## 不得跳过的完整性缺口

没有本次dump快照时的源端精确计数/确定性摘要，没有经独立验证且覆盖完整SQL语法的dump解析器。对持续写入的生产库事后COUNT或摘要不等价本次快照；不为凑齐参照创建未经验证的解析器。

严格导入后最多可提供恢复端精确COUNT、schema SHA、对象数和ledger，不能称双侧校验通过。即使导入退出0，状态也只能为STRICT_IMPORT_SUCCEEDED_INTEGRITY_REFERENCE_MISSING，生产门禁仍NO_GO。补足同快照参照需另行审查备份方案，本阶段不重做生产备份、不排空、不执行029/030、不切服务、不真实Run、不push。

## 本轮实际结果

严格导入仅执行一次，退出0，耗时1710219ms（约28分30秒），import.log为0字节、ERROR=0。全部流程2026-10-08 09:24:23Z至09:53:34Z。完成后自有数据库关闭，43312无监听；ACL仍仅SYSTEM/Administrators。C盘空间从39678304256降至36508925952字节，未触发阈值。

恢复端逐表精确COUNT已完成：33张表；po_contents=55570，po_sync_checkpoints=102112，po_sync_runs=15176，po_sync_run_contents=3969055，ledger行数31。完整计数、逐表SHOW CREATE的SHA256和ledger文件名均在脱敏报告。恢复端triggers/routines/events各0；没有同快照源清单，不把0解释为双侧对象完整性证明。schema hash不是数据摘要。

脱敏报告：`C:/ProgramData/PublicOpinion/audit/restore-strict-20261008-r4/sanitized-result.json`，SHA256 `4500be487012bab8d94aa42cc405070d10e319ae59d8d618f7eba1591d5e8438`。执行脚本SHA256 `c50c0fab621c3ea5a28fe90d93950c59b3d3347d5d3dc6c990146f3e358c6d21`。原dump导入前后SHA保持一致。

结论：受控客户端配置已使原样dump在同版MariaDB上严格无错导入，旧的Unknown command错误不再出现；本次同时隔离了默认配置、显式字符集和packet等参数，不能声称单变量因果实验已证明唯一根因。最直接的既有配置缺口是客户端auto字符集与utf8mb4 dump未明确匹配，现已纠正。没有复制业务原文到工具输出、没有修改旧dump或复用旧恢复目录。

下一步仅交测试负责人复核现有脱敏证据；仍缺同快照源端精确计数/数据摘要及对象清单，停止在NO-GO，不继续恢复复试或生产变更。
