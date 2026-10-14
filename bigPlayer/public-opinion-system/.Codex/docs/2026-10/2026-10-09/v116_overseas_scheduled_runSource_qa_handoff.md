# scheduled 隔离子主链 QA 交接

Status: FROZEN / ISOLATED_CHILD_MAINCHAIN_PARTIAL_PASS / FULL_RUNTIME_NO_GO / CUTOVER_HOLD

独立QA v087已完成：679前后hash、76/76、fresh13316十组SQL通过。负责人核原始TAP SHA `3a6d6b0dee17a45be979061f863ae3460a386007a327fe5041ba48c3a3362a96`及Je4LGV result SHA `0606f23548f93a1ef48f50ea873345644ba76d46a6ed802b62908053d9a8574f`一致，QA自有实例停止/端口释放。仅接收隔离子主链局部PASS，完整运行和生产不放行。

冻结路径：仓库根 `.temp/overseas-qa-scheduled-stage-00gmkU`。
外部manifest SHA256：`31f1af6e9d180f59578c39ad5c5374a98b82134535a8e2e2fb46c58e88cf0dea`。
开发冻结前后679条hash核验一致，12文件76/76纯测通过，业务guard拒绝为空。
新实际SQL命令：`node scripts/overseas-isolated-mariadb.js --scheduled-mainchain`。
冻结开发原始结果：仓库根 `.temp/overseas-real-db-zJDddv/result.json`；十组检查PASS，实例停止且13316释放。
result SHA256：`b3697029e66291f315f7c85225c9af449214fa6def53a09a0404715c173e6598`。

本包优先新跨模块交付：专属firstClaim proof factory→实际runSource→connector页面归一化→帖子、顶层评论、内嵌回复、动态回复→原子PageStore及各四个pending分析/翻译任务→五个任务/CP完成→子审计成功终态。11次合成请求；四内容持久计数一致；父run、source-state和source全行未变。

新反例：缺run、parent/manual、错owner/epoch/window以及snake/camel字段、复制/跨repo proof在写入/发送前拒绝；claim重放、普通审计/终态/source写拒绝；错CP账号拒绝。真实CP释放在Asia/Shanghai使用UTC SQL DATETIME转换，精确保留安全cursor。该释放是专属repository路径，不是完整runSource页预算耗尽/transport异常验收，后两项仍待补。

厂内profile由调用方提供main profileSpec快照，factory不require worker；合成runner在导入worker前stub runtimeEnv loader，不读取开发.env。固定租约只观察不延期，parent/state过期后失败关闭。旧manual factory/router拒绝scheduled仍保留，不装现役shared入口。

QA仅冻结副本和自行创建/自行关闭的13316/serverId20261036/po_overseas_fixture实例；禁止3306、真实HTTP、账号刷新、AI/翻译消费、生产DDL、国内服务更改/停机/重启、第二生产消费者。后续仍缺epoch2/restart、父聚合/cursor并发、shared scan/permit完整入口、AI持久预算/通知；生产NO_GO、切换HOLD，不得称整批完成。旧Vd73p7及grKQ7Y原件不改、不为本增量重复跑旧包。

失败VwzdwH/bhQ1ow原件保留，授权失败是合成凭据类型错误；nBisNF早期通过后再补env隔离和反例，以本冻结新结果为准。
