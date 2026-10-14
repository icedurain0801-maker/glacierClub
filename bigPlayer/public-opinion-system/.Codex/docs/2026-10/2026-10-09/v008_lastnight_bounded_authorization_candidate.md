# Last Night 有界授权核查候选及调度恢复方案

Status: OFFLINE_QA_PENDING / REAL_EXECUTION_DISABLED。国内已由项目经理串行处理，本单不连接生产DB、不发外部请求、不改国内Worker/任务。

## 单独入口

正式源码 `scripts/lastnight-authorization-check.js`；`node scripts/lastnight-authorization-check.js --dry-run` 仅显示固定source/board/三language/request/window，不读env或DB；默认或--execute均退出1。可执行验证函数runAuthorizationCheck只接受mode=isolated与显式注入transport，拒绝global fetch；不是可直接运行真实授权的上线工具。

当前完整SHA256为 `f6ad4623f14aa88740cc5022f41d95a17ba87848794b748e3bc2492a8a15476d`。

复用createIsolatedLastNightSiteSession及BigPlayerH5Connector.discoverFeeds，未另写采集框架。固定source081a16d2-5545-4afd-9c65-e04777e4540b、account必须与expectedAccountId精确相等并归该source（真实account值由经理现有材料绑定，不猜）；URL HTTPS club-en /，game2177/version2177-US-ZS，language2/9/16各唯一一次，board100017。URL只容许env/gameId/gameVersion/languageId/lang键，不允许携带token/未知键。

三站串行，每站交换→context→v2board一次，最多9请求/90秒软窗口；各请求复用session超时10秒；无retry、v1 fallback、feed、comment、Store、AI、consumer。游客态/code非数字0/401/403或board不符立即终止整个阶段，不处理后续站点。token只内存，finally清session，既有账号凭据不改写。真实交换可在上游产生会话，此候选测试未交换。

每请求记录languageId、真实工具起止时间、method/origin/path、非敏感query键值/Authorization占位、签名SHA256、HTTP/providerCode；token/sdkToken值均REDACTED，不记录response正文/个人信息。成功仅记录board100017，复用既有board parser判断feeds归属但不发feed请求。transport抛错仅保留固定code；挂起transport的超时fixture不重试。外层transport拦截实际response code1，以保留providerCode和STOP原因，session错误包装不作为授权成功。

3/3隔离测试：三站9请求/timestamp/signature/无秘密，游客1请求后全停、错account/live transport拒绝、挂起超时、--execute退出1。命令 `node --test server/test/lastNightAuthorizationCheck.test.js`，原日志仓库根 `.temp/bigplayer-recovery-20261009/lastnight-authorization-check-isolated.log`。不宣称真实授权/采集通过。

## 缺失.cmd入口恢复方案（尚未制作/上线）

已核现有TaskPath\\ / BigPlayer Last Night Overseas Daily 02，Ready，action指worker/last-night-overseas-daily.cmd，文件缺失，任务定义hash4b882d...；LastResult1不证明唯一根因。既有正式worker/package.json指lastNightOverseasDailyJob.js，但它--execute依赖shared Worker/buildDeps/runSource/analysis，不允许直接补cmd调用它。

最小安全恢复顺序：先完成独立海外真实执行器与固定source/account/board/预算/lease/run identity接线，离线启动链与Store/AI测试交QA；再制作cmd候选明确node绝对路径、项目工作目录、唯一执行器参数，退出码原样传播，不开共享消费者。真实executor尚未就绪，不能猜cmd参数或把--dry-run当采集成功；当前不将缺失cmd落到实际任务路径，防止Ready任务次日自动触发新行为。

候选仅可先置仓库根.temp并默认拒--execute，正式任务更新/入口恢复由经理批准后串行操作。部署时只保留既有一个02点任务，不再新增第二调度，不触发现场试跑；task定义/原入口存在性备份，恢复失败时恢复原任务XML/原文件存在性（若原缺失不虚构旧文件），保持历史run/site不删除。停止条件为命令非0、错误scope、active lease或重复run；不能为回退重启国内Worker。现阶段Store/AI/真实executor未就绪，仍NO_GO，国内不以此为前置。
