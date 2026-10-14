# Last Night 海外独立链路生产规模只读评估

Status: incomplete-no-go-no-production-connection
Date: 2026-10-08

## 本轮只读事实

- 本机 C 盘空闲 `27,055,820,800` bytes（约 25.2 GiB），物理内存空闲 `16,531,448` KiB（约 15.8 GiB）。这是单次 OS 快照，不保证执行窗口仍有余量，也不能证明 433xx 实例与国内进程资源隔离。
- 当前进程没有 `PO_READONLY_DB_*`、`LASTNIGHT*READ*` 或同类专用只读配置；此前快照预检记录仅有现役 root，独立只读账号缺失。既有一次性 DBA 只读授权已耗尽，且目标 host 绑定曾不符。本轮数据库连接 `0`、生产查询 `0`、写入 `0`；没有借用 root/写账号。
- 全新隔离夹具占用 43319 时仅覆盖 11 条内容、22 个 AI job/result，不能外推三站真实日采集量、评论/回复扇出、数据库索引/redo 空间或 API/AI 请求量。

## 规模结论

缺少固定三站和时间窗内的有界行数、平均/峰值行宽、页数与评论扇出，以及独立库实测 P95/P99 事务时长，故无法计算可信的存储、CPU/IO、API/AI 时限预算。不能以 C 盘空闲量或小夹具 PASS 推断生产可运行；规模门禁 `NO_GO`。

后续只读评估需项目经理另行提供并核准固定目标指纹、专用 `SELECT` 身份、时间窗、索引及查询硬时限。先 `EXPLAIN` 目标源/站点/时间窗有界聚合，缺索引即停止；只输出脱敏聚合、资源余量与置信范围，不读取凭据值、正文或全库队列，不申请全局 `PROCESS`。该评估不授权生产执行、DDL、停服务或 029/030。

## 下一阶段最小权限申请（未执行）

目标仅限经现场核对的 `127.0.0.1:3306/public_opinion`，仍须以 `@@hostname`、`@@port`、`@@server_id`、`@@datadir`、`VERSION()`、`DATABASE()` 六项实际指纹确认，不把旧服务配置当现场证明。建议 DBA 创建独立 `po_lastnight_reader`，只授予目标库 `po_sources`、`po_games`、`po_communities`、`po_source_sites`、`po_accounts`、`po_credentials` 六表的 `SELECT`；无 `PROCESS`、全库 `SELECT`、DML、DDL 或 `GRANT OPTION`。这六表是固定 source、三站、账号和凭据引用所需的候选上界；读取前仍须按现场 schema 与列需求复核，缺表/字段直接 `NO_GO`。MariaDB 表级授权不能限制行，因此程序必须以固定 source ID `081a16d2-5545-4afd-9c65-e04777e4540b` 和已核准账号 ID 做参数化过滤；若需数据库层行隔离，只能由 DBA 另行批准固定源视图，不在本次创建。

凭据不进命令行、Git、证据或日志。建议独立服务身份从 `C:/ProgramData/PublicOpinion/lastnight/readonly.env` 读取数据库连接凭据，该文件仅授予该服务身份、SYSTEM、Administrators，连接前核 ACL 和固定目标，进程内用完即释放引用；平台密钥仅按 `po_credentials` 的 `secret_ref` 从既有受控密钥存储读取，不输出值，不通过共享登录会话写回授权状态。账号密码优先；有账密而登录失败不得回退 Token，仅无账密时考虑 Token；401/403 阻断 Run。该安全路径需要 DBA 与项目经理确认后实现和独立测试，不等于本轮授权。
