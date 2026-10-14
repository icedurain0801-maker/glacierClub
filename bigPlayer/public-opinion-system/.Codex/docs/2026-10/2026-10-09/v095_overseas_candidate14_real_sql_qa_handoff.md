# 候选14独立MariaDB真实SQL交接

Status: frozen / developer-partial-real-SQL-PASS / independent-QA-pending / RUNTIME_NO_GO

一句话需求：独立复跑实际MariaDB的manual事务/锁/CAS/ACKunknown及新Node真实SQL scope恢复，不用生产库作隔离。

已拍板决策：经理按v092确认独立13316/serverId20261036/new root.temp datadir、合成数据、--no-defaults/127.0.0.1/buffer64M/max10；不碰生产5900/3306、19584/Worker、19768/3001，不复制生产数据/凭据，不真实HTTP，旧证据保留，不push发版。

文件路径：仓库根.temp/overseas-qa-candidate14-20261009-01；本项目v094 manifest、v092方案、v093变更；冻结scripts/overseas-isolated-mariadb.js。开发实际冻结运行结果：仓库根.temp/overseas-real-db-yKxbTO/result.json及init/server日志；首轮与补强结果也保留。

请对方做：先读脚本和边界，确认13316空闲/生产PID创建时间与监听基线；642SHA前校验（manifest inventoryExtraFiles含脚本，不仅testFiles）。仅冻结CWD依次node --test manifest12文件（开发99/99）与node scripts/overseas-isolated-mariadb.js --isolated。程序新datadir、独立spawn windowsHide、不注册服务；init binary bootstrap模板只读含--no-defaults校验，目录非链接realpath校验；身份完整匹配才DDL，owned control SHUTDOWN。测试后校642SHA、13316释放、自有child关闭与生产PID/监听不变。保留新result/log，报告独立7真实SQLchecks而非继续只fixture PASS。

真实证据覆盖：InnoDB第二站故障整批rollback、真实source行锁并发仅一组入队、new Node真实SQL只读恢复2scope、两owner actual Repository claim SQL CAS只有一方成功且epoch1、正确owner renew/错owner拒、真实commit成功后客户端主动抛ACK丢失再只读accepted。原12文件仍SQLHTTPfixture，单列统计。

未完成：new Node只恢复scope非执行actual runSource/page/jobs；合成terminal设置不是completion证明；完整进程崩溃/多站部分进度/epoch>1恢复、TOCTOU/目录断电、全入口独占/第二源/真实上游/AI译文及下一槽仍NO_GO。无需浏览器、production SQL或服务重启。
