# 海外独立MariaDB真实SQL验证

Status: frozen / developer-real-SQL-partial-PASS / independent-QA-pending / RUNTIME_NO_GO

首轮独立13316实例在root.temp/overseas-real-db-pj9k5l完成实际Repository多站事务回滚、并发source锁单组入队、新Node真实DB只读恢复2scope、并发claim CAS唯一owner与epoch、合法owner续租/错误owner拒、实际commit后客户端模拟ACK未知+只读accepted对账。独立实例已owned SHUTDOWN，端口释放，生产5900/19584/19768创建时间和监听未变。原始result.json及server/init日志保留。

员工审查在执行期间返回补证项；首轮暂不当最终QA放行。补充.temp非链接/realpath校验及spawn error处理；子Node已核datadir（stdin目标）。初始化器二进制只读提取实际bootstrap模板包含“--no-defaults … --bootstrap”，未给不支持选项；该检查不是源代码/动态bootstrap进程审计，输出来源明确。重跑前置校验，失败关闭。

所有DDL只在新独立实例建立合成schema，未执行生产DDL/HTTP。合成终态UPDATE只是后续请求测试设置，不是采集完成证明。new Node恢复scope有真实SQL，但actual runSource/page/jobs未执行，epoch>1/部分进度/全入口独占及第二源仍未闭合。不更名fixture为真实数据库，不push发版。

补强重跑root.temp/overseas-real-db-YKHDyT/result.json PASS_ISOLATED_REAL_SQL_PARTIAL（7checks），自有实例关闭、端口释放。候选14冻结642SHA/99离线测试，另从冻结快照运行真实SQL命令，在root.temp/overseas-real-db-yKxbTO/result.json再次7checks PASS，运行后642SHA一致。生产PID5900/19584/19768创建时间仍为2026-10-08原值，3306/3001原owner不变，13316空闲。
