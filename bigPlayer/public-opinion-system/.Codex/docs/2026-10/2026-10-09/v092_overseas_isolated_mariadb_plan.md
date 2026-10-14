# 海外独立MariaDB验证方案与只读条件核验

Status: isolated-plan / RUNTIME_NO_GO

2026-10-09核验：C:/xampp/mysql/bin/mysqld.exe --no-defaults --version为10.4.14-MariaDB，mysql_install_db.exe支持独立datadir/port且无需service参数。现役mysql服务使用该binary，PID5900监听3306；3001监听PID19768，不碰。13316检查时无监听，启动前必须再次bind探测。C盘约23GB可用、系统约12GB可用RAM。

独立进程参数：--no-defaults、basedir=C:/xampp/mysql（仅二进制共享）、datadir=仓库根.temp新mkdtemp目录/data、bind-address=127.0.0.1、port=13316、server-id=20261036、唯一pid-file；关闭binlog/event scheduler，64M buffer pool、10连接、16M packet。不注册服务，不读现役my.ini、生产凭据/目录或业务内容，不停生产实例。初始化与数据输出仅该独立目录，保留不删除。

启动后核@@port/server_id/datadir/pid_file/version与进程PID匹配才DDL合成fixture；新数据库仅本单最小现有schema合同，合成source/account/community/site/checkpoint/run，无真实内容。用实际Repository及receipt prepare/handoff/reconcile/recovery，不fixture SQL ACK。测试真实row锁并发/CAS回滚/模拟ACK丢失（实际commit后客户端包装报错），新Node读取receipt且连隔离DB恢复scope。仅已核身份的control可SHUTDOWN测试实例，不按服务名/PID猜测杀进程。

本阶段不等于完整runSource真实DB验证或真实上游HTTP，后续逐步补page/jobs/终态schema与进程崩溃、部分执行/epoch恢复。窗口、全入口独占、第二源、真实采集仍NO_GO。资源参数是配置上限，不是Windows OS级硬内存/CPU限额。
