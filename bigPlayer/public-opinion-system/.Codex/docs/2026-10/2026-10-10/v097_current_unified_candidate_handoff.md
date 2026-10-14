# v097 当前统一候选与独立验收交接

Status: CANDIDATE_FROZEN_DEVELOPMENT_6_PASS_QA_PENDING_PRODUCTION_HOLD

## 本次结果

以现役 `release-20261010-sync-status-scope` API 和前端 v214 为基底，保留同步授权持久化、过期时间替换、探测复用、同步记录可选列兼容、latest scope；合入已验风险、current intent 和 writer 保护。v095 已冻结但不是当前发布基底，保留原件，使用 v097 交 QA。

完整 manifest 位于仓库根 `.temp/risk-normalization-20261010/candidate-current-unified-release-v097/manifest.json`，SHA256 为 `2c545b245303aa7e726123ddbf6a52ffcd7df5e4f4539194f29ba9852380d6cc`。2053 文件：API 402，collection 413，analysis 413，overseas 412，translation 413。四棵非 API 树来自 v089/v078 原字节，script 1、schema 3 原字节；不执行生产 DDL。前端 v214 保留，不复制或重启。

API 396 基底中 391 文件原字节保留。修改 app/repository/aiAnalyzer/alertEngine/riskSeverityNormalizer，增加 6 个已验 helper。repository 仅融合 16 个已验方法、4 个已验方法入口和必要初始化；`upsertAccountCredential`、`startSourceSync`、connector、credentialContext 保留当前版本。app 仅增加安全入队冲突处理和错误映射，latest scope 与授权文案保持。

## 开发验证

使用新建、仅 loopback 的 owned MariaDB，`serverId=20261097`、端口 57051；生产环境未加载，网络请求毒化，分析/翻译 provider 为合成替身。6 组一次 PASS：

| 场景 | 证据 |
|---|---|
| API → 实际分析 Worker | 内存 handler 202，fake AI 1 次，结果/cache/job 同步提交，通知 0 |
| API → 实际翻译 Worker | fake translator 1 次，job 与翻译结果提交 |
| 当前授权持久化 | 实际加密 SQL 写入、旧 expiry 清除、真实解密一致、错误 scope/过期结果拒绝 |
| 探测凭据复用/刷新 | fake 网络 401 后刷新 1 次、登录和持久化各 2 次，后续请求使用新凭据 |
| 当前正文事务 | 实际 page writer 同事务写 intent；合成 intent 写失败时正文回滚，intent 0 条 |
| 最新接口保护 | latest 正确 source 200、错误 source 404、未知参数 400；capability detector 1 次，重复 health 0 次，未探测评论保持 configured |

复现脚本在仓库根 `.temp/risk-normalization-20261010/current-v097-validation/{lifecycle.cjs,combination.cjs,current-seams.cjs}`。结果原件 `run-dXcutg/result.json` SHA256 `06879738fbca42a811bd38623fd92f6d8640ddb3749b10ee92a02c5340e4396e`。404 个隔离 require.cache 文件匹配候选；2053 文件前后 SHA 一致；owned 实例核身份关闭、端口释放、exit 0。该 require.cache 只证明隔离测试加载，不能证明生产加载。446 个相对依赖解析、候选改动 JS 语法检查通过。

复现命令：

```powershell
node 'C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/risk-normalization-20261010/current-v097-validation/combination.cjs' --isolated --candidate 'C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/risk-normalization-20261010/candidate-current-unified-release-v097/manifest.json' 2c545b245303aa7e726123ddbf6a52ffcd7df5e4f4539194f29ba9852380d6cc
```

## 现役保护与立即复核

18:20:43、18:21:02、18:23:13 只读样本记录 API `sync-status-scope`、前端 v214。API Node 47628/wrapper 22852，XML SHA256 `5789239411f27a2c6f0bbccf660bbfb96a6cfe04829078d62f93b958b697b062`。完整只读归档 API 396 + 前端 34，XML 原字节，ZIP 读回与源前后字节通过。

归档 manifest `current-v097-validation/archive-status-scope/archive-manifest.json` SHA256 `308d1aabfb5754707e34f770d044d1f3ead49d61b915fd185bde9bc530b13012`。18:23:50 `base-guard-pre-qa-r2.json` 对 service PID、Node PID/createTime、XML、完整基底 SHA/文件数立即复核 PASS。`base-guard.ps1` 若任一变化，返回非零、标记 BLOCKED，不做任何变更。切换前必须重新执行并保存新 receipt；这个只读检查不是部署锁或生产 loaded/pause 证据。

第一版 guard 使用时间字符串比较，因 JSON 日期类型格式差异误报 Node 身份变化。已保留失败原件 `base-guard-pre-qa.json`，修为 UTC ticks 比较后复核通过；未据误报重启服务。

## 独立 QA 请求

核冻结包、最新基底及最小 diff，独立验证上述受影响接缝。风险 helper/非 API 四树沿已验字节证据，不重旧矩阵/三站。`startSourceSync` 可选字段兼容方法须与当前归档保持原字节；不把合成场景作为真实采集。沿 v066 intake 单独签候选部分结果。

## 尚未完成的生产条件

| 对象 | 精确缺口 |
|---|---|
| Q1/旧手工脚本 | 两个任务仍 Enabled；旧入口技术禁止再起未生效，禁 task 也不能代替手工阻断 |
| API/shared/Analysis | 实际准入停止、页/provider 排空、同 conn 双 gate、main 启动暂停与加载 receipt 未实现 |
| PublicOpinionTranslation | 旧 release 406 个文件枚举、0 可读；完整回退包不存在，stop-only 安全控制尚未完成 |
| current intent | 默认 disabled；生产 schema/config 只读 readiness 尚未核，不允许 DDL 或擅自启用 |
| 境外定时恢复 | 尚未切换或验收真实调度 → 入库，不能宣告恢复 |

本次不变更生产服务、任务、ACL、配置或数据，不真实抓取、付费 AI、通知。若上述条件无法成立，不切换，交付具体阻断对象。
