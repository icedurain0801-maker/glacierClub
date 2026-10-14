# 备份恢复阶段：NO-GO

Status: restore-failed-stopped

## 备份产物

源：LIUFUYI-2-48:3306/public_opinion，MariaDB10.4.14，server_id=1。工具为同版本mysqldump，使用single-transaction/quick/routines/triggers/events/hex-blob。2026-10-08 08:22:09Z开始、08:22:22Z结束，dump执行13154ms、退出0、stderr为空。

受控目录：`C:/ProgramData/PublicOpinion/audit/backups/public_opinion-20261008082209`。SQL大小831426517字节，SHA256为`ea842a68330a186cb4ec4cd9397c3aaf8b081c0dec3a042b74919f5979884cbb`。此文件**未证明可恢复**。metadata中的counts来自information_schema.table_rows，是估算，不是确切计数；diskFreeBytes为null，不能用于容量证明。OS实测初始C盘约44.4GB空余、复试期间约39.7GB空余。

前两次备份脚本均在spawn dump前失败，只留下空目录20261008082034/20261008082139。两次失败的根本原因都是mysql2查询结果解构错误；第一次修改数值类型判断并没有解决原因，随后将[identity]改成[[identity]]后通过。此前将第一次失败归因字段类型不准确，予以更正。无旧备份被覆盖。

## 隔离恢复失败证据

| 尝试 | 目标 | 结果 |
|---|---|---|
| r1 | 43309/server_id20261010，audit/restore-20261008082209 | mysql退出1；第861行Unknown command '\n' |
| r2 | 43310/server_id20261011，audit/restore-20261008082209-r2 | binary-mode仍退出1；同一错误 |
| r3 | 43311/server_id20261012，audit/restore-20261008082209-r3 | 使用force继续导入不构成成功；日志715条ERROR，含712条Unknown command及1064语法错误。已核验PID24064命令行目标43311、PID32424 datadir后停止本次导入；父脚本回收自有实例。 |

原始日志在各自目录mysql-restore.log、restore.log、init.log；保留目录和部分恢复数据，不覆盖、不删除。最终43309/43310/43311均无监听。未操作3306或既有43307服务。

准确分类为“客户端命令解析错误及SQL语法错误”；尚不能确定是dump编码/转义、客户端配置/字符集还是内容本身导致。先前声称已确定是工具解析而非数据问题，证据不足，撤回。CPU增长不证明完整性，日志mtime也未持续更新。

## 验证缺口和数据保护

没有完成源快照确切计数、恢复逐表计数/摘要、例程/触发器/事件完整性校验。现有恢复脚本只检查表存在及估算计数，不能输出有效RESTORE_VERIFIED结论；不得继续运行force版本绕过错误。三个尝试均未产生可采纳的完整恢复通过结论。

诊断时一次工具调用误输出了备份业务正文，违反脱敏要求；不在本报告复述。其输出无法在本会话中撤回。已停止读取原始行。备份及三个恢复目录原继承ACL过宽，现收紧为SYSTEM与Administrators，保留全部证据。后续只输出统计、错误类别和hash。

结论：备份恢复门禁NO-GO，连续失败后停止复试；交测试负责人及项目经理复核。生产DDL、停启、禁任务、真实Run、push均未执行。后续如继续，先审查客户端默认配置/字符集、连接来源及安全诊断方案，再用全新隔离目标无force恢复，补同一快照的确切计数与校验，不能用当前文件hash替代可恢复性证明。
