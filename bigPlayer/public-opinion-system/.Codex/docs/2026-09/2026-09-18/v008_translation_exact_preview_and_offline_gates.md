# 翻译精确清理预览与离线门禁

Status: 只读预览完成；启动门禁FAIL；**不可启动**。

## 当前精确预览

- 捕获时间：2026-09-18T06:47:08.110Z（北京时间14:47:08）。
- 精确条件：JOIN po_contents，c.published_at < '2026-09-10 16:00:00'（UTC，即北京时间09-11 00:00:00），且j.status <> 'completed'。
- 数量9404，关联distinct content_id=9404；pending5631、retryable3730、failed36、running7。running状态不代表当前有进程，租约可为停机残留；执行前仍须再次验证。
- 精确ID及每条状态、时间、内容关联、租约记录：`.tests/2026-09/2026-09-18/v008_translation_cleanup_manifest.json` 的rows[].id，不按UUID范围执行。
- 文件SHA256：da5cc805838f80193e1cf998e2c210bfafbf544757c6769eb4ee60596dfdf54a。
- UUID词典序摘要：00042a13-89dd-42d0-adbb-70f01bbb481f 至 fffe91c9-e53a-4f2e-8def-68ccbe546830，仅摘要，不是连续范围。
- 预览脚本：`.tests/2026-09/2026-09-18/translation-cleanup-repreview.js`，单次SELECT后导出，未FOR UPDATE、未DELETE、未改状态。
- 9404与旧备份9409及旧授权9185不同；这些是不同时间快照，原因未经进一步审计，不做推断。新manifest只用于重新确认，不扩大旧删除授权。
- 本轮服务只读状态：PublicOpinionTranslationWorker Stopped/PID0。未启动、补译、删除或push/发版。

## 已通过与未通过

| 项目 | 证据 | 结论 |
|---|---|---|
|parser兼容性|translator/translationWorker测试25/25 PASS；纯parse测试含string、text parts、Responses message、Anthropic、两组usage；refusal/image/tool/自然语言/数组拒绝|离线PASS，非已证实根因修复|
|priority状态机|专项2/2 PASS（含预算用例）；mock验证retryable始终精确领取、completed/failed仅下一轮可普通领取|离线PASS，未部署|
|quota attempts|预算错误保持retryable，次UTC日重试，回写decrementAttempts=true断言通过|worker离线PASS；Repository参数/真正扣回与换日边界专测仍待补|
|持久化guard|对象重建不清零预算测试PASS；每次HTTP前预留逻辑保留|部分PASS，最后额度/UTC日切Repository专项未齐|
|服务/包存在性|wrapper、实际XML、release入口、manifest存在|仅存在性PASS|
|小批量契约|源XMLbatch5/backfill1；实际XMLbatch5/backfill缺失（代码默认100）|FAIL，不能称batch1/backfill1已生效|
|运行包哈希/manifest|工作树入口SHA256=7D5B859BFB0FEE118DB4C271CE536008C983115EF150E0D8F4B0FFD1EBDF1B59；读取release入口/manifest Access denied；无写verify-worker-release在node_modules/.package-lock.json处EPERM|FAIL，无法宣称一致或完整；本轮未调整ACL|
|显式安装链路|install-services无TranslationWorker目标；prepare-worker-preflight仅Worker；prepare-services仅API；validate-artifacts目标Api/Worker/All|FAIL|
|安装就绪检查|worker-readiness只SELECT/SHOW（安全边界PASS），但只验unified scheduler，无028 budget及translation表/索引预检|翻译readiness FAIL|
|心跳/有效队列/最后成功告警|countTranslationJobs仍旧合同，未交独立翻译heartbeat及active/delayed队列隔离专项|未通过|
|源/实际配置同步|源XMLSHA256 d9dae9453651e4878549e9e7cdbcd4bac1864e315e32ec8bf6075b9e2d4c4b04；实际XML 81debb9379b33e0f4bb36523c096e645cb3cc3a01671e9b216d3c52e6428dbcd，配置内容也不一致|FAIL（render本身会替换路径，hash不等单独不能证明错误；backfill差异是实证）|

测试使用mock fetch或纯parser，不调用provider，不改数据库。定向diff whitespace检查PASS，仅CRLF提示。本轮仅增加离线解析兼容和测试，不泛化开发、不生成或部署新包。

## 后续需派单

项目经理先基于本manifest重新确认精确清理ID/数量。启动必须另有明确授权，并先完成显式安装/翻译readiness、配置对齐、可读部署账户的无写包校验与缺失专项；当前无可部署且可验收的包，保持不可启动。1491625已completed，不再领取或重置；分析孤儿与本清理无关。

## 已确认执行结果

用户随后以本manifest及同一SHA授权执行。执行前SCM为Stopped/PID0。临时manifest表逐批导入9404个精确ID，事务中只锁定和删除`status<>'completed'`的manifest成员：lockedCount=9404、affectedRows=9404，均与授权严格相等，已COMMIT。

备份：`C:/ProgramData/PublicOpinion/config/backups/translation-20260918/translation-cleanup-2026-09-18T065013267Z-manifest.json`，SHA与授权manifest相同；事务锁定原始job行：`translation-cleanup-2026-09-18T065013267Z-locked-rows.json`，SHA256=`2d06518df33654f44f84f6aca50fd73dc27ecd93926dc6a46b57be8b27083b26`。执行后只读复核manifestIdsRemaining=0；剩余jobs：completed855、pending6269。未启动翻译服务、未执行6270补译、未删除po_content_translations或completed任务。
