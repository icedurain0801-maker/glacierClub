# 候选 15：新 Node actual runSource 真实 SQL 独立 QA 交接

Status: frozen-awaiting-independent-QA / RUNTIME_NO_GO
Date: 2026-10-09

需求：复用 v092 新合成独立实例，验证新 Node actual runSource/Repository/PageStore/PageJobs/终态，不再仅只读恢复 scope。

已拍板决策：仓库根 `.temp` 新 datadir，127.0.0.1:13316/serverId20261036；身份匹配后合成 DDL，只有 owned control SHUTDOWN。生产3306/PID5900、Worker19584、3001/PID19768不动，无真实上游、第二生产消费者、push或发版。候选14及所有失败证据保留。

## 冻结与开发证据

- 快照：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-candidate15-20261009-01`
- 清单：`v098_overseas_candidate15_real_mainchain_frozen_manifest.json`；643文件，验证必须采用 `inventoryExtraFiles`，包括新增helper。
- 变更：`v097_overseas_real_mainchain_sql_changelog.md`；正式脚本 `scripts/overseas-isolated-mariadb.js`、`scripts/overseas-isolated-mainchain.js`。
- 离线12文件99/99 PASS、exit0。
- 工作树开发结果：根.temp `overseas-real-db-HdAMJE/result.json`。
- 冻结快照开发复跑：根.temp `overseas-real-db-upbRsF/result.json`，exit0、8/8，serverStopped/portReleased均true。
- 新Node合成transport真实SQL：actual claim/renew/content INSERT/analysis INSERT/translation INSERT/terminal UPDATE各1；1篇入库、分析与翻译各1 pending、checkpoint4、collection audit success；site-en完成authorized_scope、site-fr仍queued。
- 后哈希验证注意：`verifyInventory` 的 expected 参数只传 `{nodeVersion,policy,files}`（与冻结脚本一致），extras传 `inventoryExtraFiles`。传完整manifest会因额外交接元数据导致结构比较报错，不是哈希变化。

## 请测试负责人执行

先审两脚本身份、安全闸与停机路径，独立记录生产端口/PID创建时间只读基线；按manifest前哈希→12文件离线→冻结CWD `node scripts/overseas-isolated-mariadb.js --isolated`→643后哈希→实例退出/13316释放/生产进程连续性复核，保存新报告并消息回开发与项目经理。不修改快照、不运行迁移、不读取真实凭据或上游。

特别核对：SQL observation透传mysql2，不伪造ACK；Journal owner来自actual claim随机owner；合成createTime取receipt窗口；当前合成内容表无board列，只有可选boardName写禁用；其余主链实际SQL。合成schema仅覆盖本项，不等价完整生产约束快照。

## 未放行范围

本轮不执行AI或翻译消费者；pending入队不等于分析/译文完成。真实HTTP为false。原人工terminal UPDATE仅用于第二请求ACK丢失测试，不是采集完成证据。初始化器模板字符串不等于动态初始化审计或断电证明。多站部分进度、epoch>1、client中断、checkpoint恢复、全入口单消费者、第二源精确修复及跨平台真实回归仍待做；生产保持RUNTIME_NO_GO。
