# v019 严格profile与callback-shaped adapter隔离交接

Status: DEV_TEST_EVIDENCE / QA_PENDING / REAL_MYSQL2_NOT_TESTED / REAL_ACTION_NOT_AUTHORIZED / CUTOVER_HOLD
Date: 2026-10-10 (Asia/Shanghai)
Owner: 开发负责人

2026-10-10补充：server/node_modules不存在不能推出整体未安装；v046确认项目根与现有release mysql2均3.23.2。此页模拟合同与旧冻结保留，后续真实驱动离线协议证据另见v046/v047，不借本页PASS替代其独立QA。

## 依赖闭包与测试方法

先按经理派单范围给出精确闭包及方法：新增 `scripts/overseas-v019-profile-adapter-contract.js`、`scripts/v019-profile-adapter-freeze.js`、`server/test/overseasV019ProfileAdapter.test.js`，加既有 `scripts/v019-offline-network-guard.cjs`，共四文件。module只node:crypto/node:perf_hooks，无mysql2/env/fs/secret store/HTTP导入；窄七SQL/校验私有复制自v042合同，不导出通用query/callback/factory。没有改v040/core/原窄driver及其冻结；本增量独立提测，不借旧PASS。

server/package.json声明mysql2 ^3.11.0，但本项目server/node_modules/mysql2不存在；仅源码/依赖路径检查，没有安装/升级/真实加载驱动。测试用内部固定mysql2 callback-shaped模拟连接；query传固定SQL+values，回调为(err, rows, fields)，字段元数据用自定义typeFamily，不是实际mysql2 columnType/field packet。模拟合同通过不证明真实mysql2包/version/schema/取消/TLS/锁/连接行为。

## 实现逻辑

`issueFixtureProfile`只接严格data-only descriptor及声明式fault/限额。固定source、127.0.0.1:3306/public_opinion/server_id1/MariaDB10.4.14、manifest、单条配置来源范围、opaque单次能力/单调总deadline。配置descriptor允许绑定已有项目.env准确路径和DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD五键、exact-db-fields-once；它只是模拟读取范围，不读取.env内容、不发现扫描文件、不声明现用用户名或grant。identityAlias为非秘密标识，grantStatus强制unverified；不要求新账号/ACL/新provider record。输入真实password/user/URI/连接对象/driver/provider/query/live或额外键拒绝。过期cap拒绝时也清私有auth和descriptor。

内部夹具provider持有synthetic DB user/password；createConnection配置绑定固定目标、dateStrings:true/timezone:Z/multipleStatements:false/connectTimeout。同步返回唯一句柄再connect，connect实际核私有品牌与合成认证值，不能仅传空句柄算消费。只一连接，无pool/现役回落/retry/reconnect。raw认证值不返回、不hash输出，provider错误原文被固定错误码替换。

CONNECT、SET RR、START READ ONLY、七SQL、ROLLBACK、END均单独callback计时，connect/query/控制/end≤1s，全批含配置能力签发等待≤5min，只能收紧；同步/重复/err后result/timeout后late回调只结算一次。late-result负测在超时后cleanup主动投递合成晚到回调并忽略，不声称真实网络晚回调已复现。超时destroy一次，之后无query/end/reconnect；END成功关闭后若候选自然到期，NO_GO且不发布discovery，此时已有CLOSED、无需再销毁关闭的连接。

SQL dateStrings以严格UTC SQL DATETIME转ISO，NULL保留；安全BIGINT十进制字符串可标准化，unsafe拒，TINYINT必须0/1整数，不truthy转型。先核字段名/数量/重复/类型family，未知config/url/secret列不删列绕过。原始rows与规范化rows分别计每行16KiB/每query32KiB/全批64KiB实际JSON UTF8字节，再沿窄七读业务校验候选/归属/期限/hash/默认账号。这里是已物化的模拟数组字节合同，不是实际mysql socket流/物理内存硬限。

成功/失败/能力过期清模块私有认证/句柄/结果引用，输出只有候选非秘密ID/alias/状态/hash/计数/固定错误码；JS内存或调用方原descriptor不承诺物理擦除。所有生产入口恒抛REAL_PROFILE_ADAPTER_DISABLED，不读取任何真实配置或连接。

## 最终唯一冻结与开发验证

所有.temp路径相对仓库根 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage`。

| 项目 | 当前原件 |
|---|---|
| 冻结根 | `.temp/v019-profile-adapter-fixture-2iawkB/` |
| manifest SHA256 | `2e885df323cdcc262624e2457cb19d18733abc6f5bf261e8f0540bba0ea47580` |
| adapter SHA256 | `a51f7645777a3521377bb1b72d0fb8d821c82105864d2b317ecf22e18c7a80b9` |
| 开发原件 | `.temp/v019-profile-adapter-dev-0CcVts/result.json` |
| 原件 SHA256 | `f12989b87e9cc3c6800849770de091a7a989b28172bc6fd17dc5b4a3b2db4731` |

10/10、exit0、passed/unchanged=true、stderr空，前后四文件bytes/hash一致，实际kind DEV_TEST_EVIDENCE。覆盖认证私有消费、descriptor/target/source/字段范围、cap复制/跨输入/过期/重用、connect/controls/R1-R7/rollback/end逐项挂起超时后0、同步/重复/先err/晚到callback、DateStrings/date/BIGINT/TINYINT/字段缺额外重复错型、raw/norm字节恰等/+1、目标/归属/候选冲突/unknown、END期间自然到期、getter/symbol/function/绕过输入与脱敏/生产关闭。

## 实际独立QA命令

活动项目新冻结命令已实现：`node scripts/v019-profile-adapter-freeze.js --freeze`。

唯一QA cwd：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/v019-profile-adapter-fixture-2iawkB`。

```text
node scripts/v019-profile-adapter-freeze.js --verify 2e885df323cdcc262624e2457cb19d18733abc6f5bf261e8f0540bba0ea47580
node scripts/v019-profile-adapter-freeze.js --test 2e885df323cdcc262624e2457cb19d18733abc6f5bf261e8f0540bba0ea47580
node scripts/v019-profile-adapter-freeze.js --verify 2e885df323cdcc262624e2457cb19d18733abc6f5bf261e8f0540bba0ea47580
```

runner精确四文件/单test/十断言、OS env白名单/guard/60s编排timeout，前后verify。请独立审私有认证消费/不泄露、callback竞争、connect/end期限、日期字段/bytes、固定SQL/目标及异常零操作，加自有负测。最多签ISOLATED_PROFILE_ADAPTER_CONTRACT_PASS；不签实际mysql2/配置存在可用性/grant/真实DB目标或七读结果。真实七读影响收口见v045，生产仍不可运行。

## 变更记录

负责人先完成隔离依赖/测试方法说明，再落专属模块/测试/runner。首版bDTRuG开发p60Gbr SHA37c2612a33ec79fd45977825fc92eb1680da865b122aa0ddce9ed0463cf44712通过10/10；后主动补过期cap释放/晚回调模拟，NvQTrg开发Tbq7NA SHAd4b1ba651ecc9449f4c9a2239af1ad79036a7239e6cda9e90a964f084d5f2dcc通过10/10。员工只读复审提出END期间自然过期缺口，负责人补END后期限核验并改三参callback形状，最终2iawkB10/10。全部旧冻结/原件保留，不复用历史PASS覆盖最终版本。

v042已独立报告 `.tests/2026-10/2026-10-10/v036_v019_narrow_metadata_driver_independent_qa.md` 限定签收T5dkfA；本增量待独立QA。没有修改业务/shared/国内/经理待办、没有真实认证材料读取/连接/SQL/HTTP/token/AI/DDL/ACL/服务/push/发版，proof停止。
