# 海外独立 runtime TLS 与 transport 诊断

Status: QA_PENDING / NOT_DEPLOYED。

现场旧 FEU5eP metadata 报告只有一个 context 请求（2026-10-09T02:27:49.336Z–02:27:49.521Z），无 HTTP/providerCode，结果 CONNECTOR_PAGE_FAILED。旧报告未保留网络 cause，不能追溯认定具体 TLS 原因或 token 失效，不能补造原因。

CLI 进入与读取 env 后均把本进程 NODE_TLS_REJECT_UNAUTHORIZED 固定为 1；不写现役 env 文件、系统环境，不跳过证书验证。导入模块不修改环境。报告记录 strict 与是否纠正继承的 0。

guarded transport 只记录固定白名单 code/name/causeCode，不记录 message/stack/URL/header/token/正文，未知值 UNCLASSIFIED。请求响应后立即记 HTTP，JSON 解码失败仍保留状态。网络或解码失败记录原 transport 诊断并 abort 全阶段，报告保留 LAST_NIGHT_HTTP_FAILED，不被 Connector 包装吞掉，不后续请求或 Store。

仅海外独立路径变更；国内 Connector/现役生产包不修改。无现场 DB/外部请求。新冻结 QA 后经理才可有界一次 metadata 获取真实失败 cause；不反复盲探测。Store/真实 AI/三站全日采集/持久日防重/02 入口仍未交付。

## 冻结与验证

新候选：仓库根 `.temp/bigplayer-recovery-20261009/lastnight-runtime-iYBvhz`，完整 manifest/未批准 metadata plan/candidate.cmd；取代 FEU5eP。旧现场证据保留，不覆盖。

| 文件 | SHA256 |
|---|---|
| scripts/lastnight-bounded-runtime.js | 14f2986254c0441d2bdf5cb0c654bdea3de102a60ca50ff157e5592628cac133 |
| worker/src/lastNightBoundedRuntime.js | 84078e82c8f3a2d336fb7b4df953b358af6280fbbaf938b58951d2c3dc9eba36 |
| worker/src/lastNightTransportSafety.js | e1752b82c792b4f475451c490ad634e325d6fbd3f6503276545413fbd81fdef0 |

`node --test worker/test/lastNightBoundedRuntime.test.js worker/test/lastNightTransportSafety.test.js worker/test/lastNightReadonlyGuard.test.js server/test/lastNightRuntimeInventory.test.js server/test/lastNightAuthorizationCheck.test.js server/test/lastNightSiteSession.test.js`：21/21 PASS。node --check 与限定路径 git diff --check 通过。fixture 覆盖 env0 入口纠正/二次纠正、unknown 错误脱敏、TLS cause/ECONNRESET、失败只有一次 transport/零 writes/abort、既有只读与依赖门禁。

| 后续工作 | 状态 |
|---|---|
| TLS/诊断独立 QA | 已流转待结论 |
| 经理有界一次严格 TLS metadata，取得真实 cause | 待 QA GO |
| collect 样本 | 待 metadata 结果 |
| Store 补偿、真实 AI 完成 | 未交付 |
| 三站全日采集、持久 slot、防重、02 正式入口 | 未交付 |
