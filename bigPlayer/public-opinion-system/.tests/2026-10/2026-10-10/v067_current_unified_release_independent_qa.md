---
last_updated: 2026-10-10
status: candidate-partial-pass-production-hold
owner: 独立QA
---

# v097 当前统一候选独立最小验收

结论：候选限定范围独立 6/6 一次 PASS；生产发布准入 HOLD，上线后验收未执行。依据用户 heartbeat 和 v066 接收范围执行，不以开发 6/6 代签。无业务代码、部署、服务/任务/ACL、生产 DDL/数据修改；无真实认证、采集、付费 AI 或通知。

## 冻结与来源

候选仓库根 `.temp/risk-normalization-20261010/candidate-current-unified-release-v097/manifest.json`，SHA256 `2c545b245303aa7e726123ddbf6a52ffcd7df5e4f4539194f29ba9852380d6cc`。完整 2053 文件集合与字节 SHA 前后独立核验：API 402、collection 413、analysis 413、overseas 412、translation 413。四个非 API 树完整来源 v078（manifest `64c030e83c911f6af46fb33baf662825de0ab169c2cc4a077afac0c804051f6e`），脚本 1 和 schema 3 同原来源；每个来源文件重新哈希。v089 引用 manifest `99ace6cc9c3c040aa8eab3d548e002a7fc9a74503a19aed910feb5ca2fc35cc2`，各 schema sourcePath、dependencies 与 diff 工件独立哈希一致。未执行生产 schema。

API 当前基底为 `release-20261010-sync-status-scope`，归档 manifest `308d1aabfb5754707e34f770d044d1f3ead49d61b915fd185bde9bc530b13012`。396 文件中 391 原字节保留，5 个修改文件与 manifest 清单一致，新增 6 helper 与已验来源原字节一致。不是旧 login-auth-fix/v095 基底。manifest 内 revision/diff 标签仍含 v095，是交付遗留标签；本报告以 v097 路径、上述 SHA、实际 runtime 与当前归档绑定身份，未改冻结原件。

独立 ZIP 逐条读回 API 396、前端 v214 34 文件，无漏项/重复项，且与现役完整目录文件数/字节一致。前端保持 `release-20261010-sync-auth-v214`，不替换资源或重启。API connector、credentialContext 在 391 个不变文件内。独立比较 `upsertAccountCredential`、`startSourceSync`、实际 `enqueueManualSourceSync`、`getLatestSyncRunForSource` 及 optional projection，仅标准化 CRLF/LF 后方法内容相同；包含实际入队的四个可选字段兼容。app 独立 diff 仅手动安全入队冲突处理和新增错误映射两个片段；latest scope、capability/login/source 分支与现有 publicMessages 保留。

## 最小隔离验收

独立沿已建立 QA 生命周期与夹具写新断言，未运行开发验收入口。owned MariaDB 10.4.14，`--no-defaults`、loopback、eventScheduler OFF，新随机 CRUD 账号，`serverId=20261131`、端口 59352、数据库 `po_qa_v067_release`。global fetch 禁止，connector 注入 fake network，Worker 注入 fake provider；API 内存 handler 无 HTTP listener。

| 组 | 独立断言 | 结果 |
|---|---|---|
| 1 | API handler 202 → 指定 analysis 实际 Worker，当前 fingerprint/job/result/cache/audit 提交；fake AI 1 次、通知 0；两个旧入口拒绝且 query/pool 访问 0 | PASS |
| 2 | API repository producer → 指定 translation 实际 Worker；精确 job、fake translator 1 次、唯一 completed 与结果 fingerprint/version/body 一致 | PASS |
| 3 | 真实加密授权 SQL 写入、可解密 round-trip、旧 expiry 清除、账号/来源绑定；错误来源及过期结果拒绝，原记录不变 | PASS |
| 4 | 合成首次 401 后 refresh 1 次、login/persist 各 2 次；随后探测都复用新 token，帖子/评论 available | PASS |
| 5 | 实际 API page writer 同事务写正文与 intent，generation 1、pending、新旧 fingerprint 一致；注入 intent 写失败后 body/fingerprint 回滚，intent 0 条 | PASS |
| 6 | latest 正确 scope 200、错误 scope 404、未知 query 400，仅有效请求读取一次；cap detector 1 次，重复 health 0 次，未探测评论 configured 保留 | PASS |

不重复历史风险规则、intent/writer 矩阵、三站或无关功能。组 6 的 publicMessages 保护由完整 app diff 确认，未声称逐条运行错误文案矩阵；optional sync 保护由当前方法内容比对确认，未触发真实同步。

404 个隔离候选 require.cache 模块逐个与冻结 SHA 匹配；仅证明本次隔离加载，不证明现役 loaded。完整候选前后 SHA 一致；owned port/serverId/datadir/pidfile/childPID/runner 核身份后 SHUTDOWN，child exit、端口释放均通过，命令 exit 0。

## 原件与 QA 工具误报

原件全部保留于仓库根：

- `.temp/qa-v067-release-mN0dcg/result.json`：SHA `acff9e7b69db2ea6672329640493d5ea19a7de90f10f3c5726e2b8c75267147e`；初始化、数据库目录、日志、owner 原件同目录。
- `.temp/qa-v067-harness/lifecycle.cjs`、`seams.cjs`：独立 QA 执行实现；正式入口为本目录 `v067_current_unified_release_independent_sql.cjs`。
- `.temp/qa-v067-harness/baseline-after-r2.json`：SHA `092195ec28bea2ec09660818431da43589c8448dfbd65355f913fe3d6bb4cf71`。
- `.temp/qa-v067-harness/control-observation.json`：SHA `02b2a36323e1342e4d8189ec2130dd7ea0d38258e9a8b519c4ea3eb07a1a580c`。
- `.temp/qa-v067-harness/baseline-r1.ps1`、`baseline-r1-failure.json`：保留首次方法比较误报。旧 release repository 为 LF，候选为 CRLF，严格 substring 比较报 `Protected method changed: upsertAccountCredential`（exit 1）。只修 QA 方法内容比较的换行标准化，完整文件与 ZIP 字节检查仍严格；续核基底 PASS，没有重跑已经 PASS 的 SQL 组。首次完整基底 receipt 未生成，不能把它列为前置完整 PASS；随后完整独立核验时间为 18:29:20。

语法检查入口/lifecycle/seams 通过；新增正式脚本/报告以 `git diff --no-index --check -- /dev/null <path>` 核空白未报告错误，首次 EOF 空行已修正（Git新增文件的差异退出码不作测试失败）。没有改业务文件，也没有用开发 PASS、Running 或磁盘 SHA 推定生产加载。

复现：

```powershell
node .tests/2026-10/2026-10-10/v067_current_unified_release_independent_sql.cjs --isolated --candidate 'C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/risk-normalization-20261010/candidate-current-unified-release-v097/manifest.json' 2c545b245303aa7e726123ddbf6a52ffcd7df5e4f4539194f29ba9852380d6cc
```

## 生产边界与未执行项

| 工作项 | 独立接收结论 |
|---|---|
| 候选完整来源、当前基底及 6 个最小隔离组 | 已完成，候选部分 PASS |
| 当前基底漂移保护 | 18:29:20 只读完整复核 PASS：API Node47628/wrapper22852/XML `5789239411f27a2c6f0bbccf660bbfb96a6cfe04829078d62f93b958b697b062`；frontend Node18460/wrapper19104。只是时点核对，非部署锁、loaded 或控制证明 |
| 旧入口禁止再起 | 18:29:59 QA 独立读任务，Q1 与海外均 Enabled/Ready，XML 分别 `5ff1072dda88d24d18aae992a1c4fb50323b52ebbd8261971f215b9affc95e28`、`df2871141595af8eb11068d6802af231b4e3d10e19c51694b3f522f637cb3424`。实际手工禁止再起未证明，候选 guard 不代签 |
| 准入停止、页/provider 排空、同 conn 双 gate、main pause 与实际 loaded receipt | 未交可核实际证据，HOLD |
| translation 完整回退或批准 stop-only | 开发交接仍为旧包 406 枚举/0 可读、ACL拒读；本次未重复旧 ACL 扫描，无可核完整回退/生效 stop-only，HOLD |
| 生产 schema/config | 开发 18:25 READ ONLY metadata 原件 SHA `d94a6422b2287006e1bf5294035f7e8f3f35b4be62c9fcda0d8c45827032e64b` 已独立核哈希，未重新访问生产 DB：6 张新表全缺，intent 未配置/默认 disabled；四个 sync 可选列缺，兼容必须保留。新链路不能擅自启用，不推断这就是旧海外故障根因 |
| 上线后健康、实际加载、精确批准名单内受控功能 | 未执行：没有明确切换结果与精确批准名单 |
| 境外定时真实恢复、真实同步入库、生产通知约束 | 未执行，不能由本次 fake PASS 代签 |

缺失 6 表：`po_current_analysis_intents`、`po_current_analysis_repair_records`、`po_current_analysis_intent_audit`、`po_overseas_current_intent_proof_audit`、`po_current_translation_intents`、`po_current_translation_intent_audit`。readiness 为开发只读证据，QA 不把哈希核对表述成独立生产 SQL 实测。

经理随后消息转达六表及开关操作范围已确认、开发将执行；这属于待发生交付，不能覆盖上述 18:25 缺表证据，更不构成 QA 已核新 schema/config。QA 不执行 DDL/配置写入、不因该消息扩展业务操作；等待实际交付证据后，在用户原定只读接收范围内核准入影响。

本次候选验收完成；发布准入仍 HOLD，限定上线后 QA 尚待条件。heartbeat 保持静默等待新可执行证据；不复跑此 6 组，也不重复旧状态，全部限定 QA 完成或用户取消后再暂停。
