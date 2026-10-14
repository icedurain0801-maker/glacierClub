# 海外 metadata/collect 增量冻结

Status: QA_PENDING / NOT_DEPLOYED。

## 已落地变更

1. metadata/collect 增加冻结方法门面和五条精确 SELECT/参数白名单，底层 pool.query 同步保护，拒绝 execute/getConnection。启动前拒绝写入、锁、多语句、OUTFILE 探针；探针只在本地 guard 拒绝，不送到数据库。凭据权限不变，不能称数据库账号本身只读。
2. 独立 scope 常量替代旧日任务模块依赖，真实子阶段不加载 shared Worker/AI runner。
3. merged-list 发现集合复用既有 q1PageData，覆盖 data 数组、records/rows/posts、顶层 items/list。报告正文 enriched/fallback 与脱敏原因；存在 fallback 时不报子阶段 PASS。

## 未完成及边界

4. 清单按实际第一方相对 require 递归计算，强制包含 Repository 的完整依赖；同时冻结所有现有 node_modules 文件字节、package/lock 与 Node 版本。无升级。CLI 在读取 env 前验证完整集合，拒绝删项、重复、路径逃逸、任意外部文件、字节变化；不是给什么验什么。旧日任务模块不再出现在运行闭包。
5. CLI 仅放行 metadata/collect，store-ai 启动前拒绝。metadata 不要求采集窗口；经理 metadata 成功后根据已有实际帖子日期绑定 collect 一天内窗口，不固定 10/8，不自动重复探测。
6. 详情 code1/401/403 或授权拒绝记录 fatal 并中止全阶段，后续请求拒绝，正文诊断后再次校验 fatal，不可吞成摘要回退继续 Store。
7. 首轮增量测试 10/12，通过负例发现现有两个 workspace junction 与授权错误被 Connector 包装的问题：只允许精确 server/worker 两个既有链接及绑定目标、冻结链接目标摘要和 package；其余链接拒绝。报告优先保留 fatal 授权错误，避免包装后丢失游客原因。

独立 QA 未通过，不执行现场。国内 PASS 冻结；Store 补偿、持久日防重、真实 AI 完成、实际每日任务入口均未放行。无 DB/外部请求、任务改动、DDL、push。

## 新冻结与验证

候选根：仓库根 `.temp/bigplayer-recovery-20261009/lastnight-runtime-FEU5eP`，含完整 manifest、未批准 metadata plan 和候选 cmd。替代 AIkAwB，旧包不可继续用于现场。源码仍绑定当前绝对路径，任何字节变化需重新冻结，不是已部署 release。

| 文件 | SHA256 |
|---|---|
| scripts/lastnight-bounded-runtime.js | a3ab38a22b2353a4d9af6d1865936705a20daa56972a1b38be968cb2e51580e9 |
| scripts/lastnight-runtime-inventory.js | 6876c6d749c78825a1c238e3d19977b4348f6f497eafe2f89a868f4d90e3e7d4 |
| worker/src/lastNightReadonlyGuard.js | b7b561c40c2a59806f0d57ff3573de06753195c46be64d1236f7235d9a8fb342 |
| worker/src/lastNightBoundedRuntime.js | 040a1c053fb71feb2c852e43da1b26e1e677ef00a3780f7b277c17909cc44d50 |
| worker/src/lastNightRuntimeResolver.js | d28a6c284d7c8716d13458b5334264448b1c9b9f7396fdbb4a264c22d2907a0c |
| worker/src/lastNightScope.js | cc7abc37cd3b4337bf21e904ba1c656bbdf09dbde024187820ce2fef4578fae7 |
| server/src/connectors/bigPlayerH5Connector.js | 9545bdd406e75b5870176d932158cfda86f90687e9cbb744b264f7954e4e3da4 |

验证命令：`node --test worker/test/lastNightBoundedRuntime.test.js worker/test/lastNightReadonlyGuard.test.js server/test/lastNightRuntimeInventory.test.js server/test/lastNightAuthorizationCheck.test.js server/test/lastNightSiteSession.test.js`，18/18 PASS。语法检查和限定路径 diff --check 通过。仅 fixture，无实际 DB/外部请求；不能等同现场 GO。员工完成数据库边界只读审查，由负责人串行落地。

| 后续项 | 状态 |
|---|---|
| metadata/collect 独立 QA | 已交接待结论 |
| metadata→选样本日期→collect 经理串行现场 | 待 QA 放行 |
| Store 事务超时与提交后 queue 失败精准补偿 | 未交付 |
| 现有 AI 实际完成证据 | 未交付 |
| 三站全日采集与持久 slot 防重 | 未交付 |
| 02 真实独立入口及唯一调度接线 | 未交付，任务不动 |
