# v019 最后受控七读入口准备

Status: ISOLATED_CONTROLLED_SEVEN_READ_ENTRY_PASS / USER_SEVEN_READ_DECISION_PENDING / TRUST_ANCHOR_UNENROLLED / REAL_ACTION_NOT_AUTHORIZED / CUTOVER_HOLD
Date: 2026-10-10
Owner: 开发负责人
Retention: 新证据30天，旧原件不删除。

## 方案与实现记录

依经理派单与已拍板隔离授权，一次完成受控入口而不留另需入口：新增许可验证器v019-seven-read-license.js、精确CLI v019-seven-read-cli.js、完整依赖freeze runner v019-seven-read-freeze.js、入口测试overseasV019SevenReadLicense.test.js。既有mysql2执行器复用同一七读/字段/字节/期限/close实现；旧无许可生产入口继续恒拒，新增真实路径只能消费签名校验后私有WeakMap单次cap。实际读取固定.env/创建TCP的代码已经备齐，但本次绝不调用。

生产公钥只从固定根.temp/v019-seven-read-manager-public-anchor.json非秘密经理决定锚取得，缺锚拒绝TRUST_ANCHOR_UNENROLLED；CLI/env不能提供公钥、路径、provider或live选项。开发不生成/读取生产私钥、不签生产许可。fixture验签入口单独lane，只能签根.temp假文件与私有内存流，绝不能切生产；测试临时Ed25519私钥仅内存使用，不写盘。真实审批的经理信任锚来自最后具体用户决定，不由开发自制。

许可严格绑定固定source/实例、冻结manifest全部代码依赖SHA、SQL digest、精确命令模板、配置整文件一次读及五键消费、七SELECT及行/字节/时限、禁R8/HTTP/token/AI/DDL/ACL/服务/国内、短期有效期和nonce、唯一根.temp输出、owner开发/保留30天。先做data-only schema/范围/期限、经理锚/Ed25519验签与manifest闭包复核，再原子mkdir独占输出目录和wx+fsync claim，最后才读取认证/创建连接。公钥锚及代码manifest属于非秘密审批/工件资料读取，不是认证配置读取。

重用/并发只一个mkdir赢家；失败/异常退出保留claim，不自动删除、不重试/退款/重放。全流程继续复核签名许可期限；许可失效不公布discovery。结果只保存固定错误码/非秘密候选/类型与计数，原config/username/password不输出。

## 依赖独立结果

HwrJ6f独立v039已核收为ISOLATED_ACTUAL_MYSQL2_PROTOCOL_PASS，10/10和自有10组，230文件/11包；真实数据库/config/grant不在签收范围。v040六包独立v038已核，不再待回；新修改/新增入口必须独立另冻另验，不能借两报告PASS。

## 首版冻结

仓库根.temp/v019-seven-read-executor-saZEkA，manifest ddf250e7400e9cd9ef93a3f5a54123b11358231e0412e4a71115e1a0425c6926，233文件。两测试文件共20顶层测试（driver10+入口10），开发原件待核；不签QA。

首版开发原件 .temp/v019-seven-read-dev-sOzY46/result.json SHA238ba4c1f009c04246b6469b4be53d89683af161397b9f417d481acf1d7435cf，18/20：测试错误把被篡改为已存在仓库根的output当作应不存在路径，以及读监控把生成假配置的w写入算成r读取。修测试为原批准输出路径未生成、只计认证r打开；没有放宽入口规则。失败冻结/原件保留，新版另冻另测。

员工只读审查发现签名cap直调驱动虽不绕过验签/claim却绕过result落盘。已将落盘纳入runAuthorizedMysql2本身，所有调用只返回status/output/hash；并在结果发布前再核许可期限。补生产格式但保留fixture签名的伪造尝试，在内存mock缺锚时验证TRUST_ANCHOR_UNENROLLED且零认证r打开/零createConnection，不签生产许可或写锚。新版21顶层测试，需另冻。

进一步将许可、cap消费、共享七读执行器与结果落盘收进同一私有core；不公开authorize/consume/finish或真实驱动cap入口，避免调用方从公共API取得cap绕过统一证据。旧mysql2模块成为兼容fixture wrapper，所有旧生产/原cap入口恒拒；fixture-only claim-abandon方法仅模型退出持久claim，不返回cap。新增假配置读取期间许可失效、连接创建前停止测试，共22项。此为本单必要闭包收口，旧HwrJ6f冻结未修改。

## 信任边界

固定公钥锚是经理控制、最后用户具体决定建立的可信外部输入；签名验证不证明经理口头身份，不能防御能改锚/执行器或删除claim的本机管理员。锚登记、目录写入及读取权限的具体影响由最终包列明，不能伪称本次已经建立ACL或已登记经理key。许可/公钥锚不进代码manifest，避免permit签含自身文件的循环；签名payload单向绑定完整不可变执行工件manifest，经理锚另绑定具体envelope digest/公钥fingerprint/决定/期限。

## 最终唯一冻结与交接

仓库根 C:/Users/Administrator/AppData/Roaming/Code/User/project manage。

| 项目 | 精确结果 |
|---|---|
| QA cwd | 仓库根.temp/v019-seven-read-executor-bQFR4k |
| manifest SHA256 | e87d08d5061abc456a670154ac36ad8d2ae031a4a1ddce9ca1c21ebc964a9f49 |
| 完整文件数 | 233；10份自有文件、source lock与既有11包闭包 |
| 开发原件 | 仓库根.temp/v019-seven-read-dev-dYfDvz/result.json |
| 原件 SHA256 | 5b1661b144a4cadbb695c3940b96e73bdb5933e2e0b7c0b180873a2f90ad219e |
| 验证 | 22/22（driver10+入口12）、exit0、unchanged=true、stderr空、前后完整SHA/bytes/require.resolve闭包一致；五份新/变更JS语法及最小diff空白检查通过 |

员工复审活动/冻结三关键文件逐SHA一致，确认cap授权/消费/执行/落盘均私有，未见新增实质阻断。JOoYJm/DQVcyc是中间冻结未执行，保留但不代最终证据。此前saZEkA失败原件保留，HwrJ6f及旧包均未修改。

```text
node scripts/v019-seven-read-freeze.js --verify e87d08d5061abc456a670154ac36ad8d2ae031a4a1ddce9ca1c21ebc964a9f49
node scripts/v019-seven-read-freeze.js --test e87d08d5061abc456a670154ac36ad8d2ae031a4a1ddce9ca1c21ebc964a9f49
node scripts/v019-seven-read-freeze.js --verify e87d08d5061abc456a670154ac36ad8d2ae031a4a1ddce9ca1c21ebc964a9f49
```

QA需保存独立新原件/hash/报告及自有错签名/错锚/范围篡改/过期/重用/并发claim/退出claim、拒绝前零认证r打开和createConnection、读中期限/唯一输出和无公共cap旁路负测。fixture签名仅内存临时密钥，不生成/读取生产私钥或签生产许可，不登记经理锚。最多签ISOLATED_CONTROLLED_SEVEN_READ_ENTRY_PASS，不能签真实env/DB/schema/grant/服务器取消。

HwrJ6f依赖报告v039原件4T9bFL SHA7115523b7068c5b6e6d18dcb2e6167316b471373e0371bf10d0e73ae93892327与独立脚本SHAa2130d406b4c26fd4ba720b9a6a7c3b8e45a57ccb25d602334fed10a00454d8d已复核；v038六包已核收，两者不是本批独立签收。

精确生产CLI/许可内容/经理登记签发流程/文件权限影响与最后决定见v049。现已完整准备入口，无需再新增执行代码；此批独立QA已核收，等待项目经理会话中已发出、尚无答复的具体七读决定。不得登记生产锚或签许可。

## 07:30独立QA核收与待决定

测试正式报告 `.tests/2026-10/2026-10-10/v040_v019_controlled_seven_read_entry_independent_qa.md` 限定签收同一bQFR4k/233文件/11包；22/22及自有8组。独立raw仓库根.temp/v019-seven-read-dev-RmCby9/result.json SHA04b769c1ee4fc0546bca0c4122107cbcb5cf6d058a5217d926e2662501646cbb；独立脚本根.temp/v019-seven-read-qa-independent.cjs SHA01b74d6a90d6f7549bf60e62a76895b084233cc449b1220559f6a9daf1fbb142，负责人已逐hash复核与报告相符。manifest e87d08d5061abc456a670154ac36ad8d2ae031a4a1ddce9ca1c21ebc964a9f49亦复核一致。

本次仅核报告/原件hash并更新文档，未重跑旧测试、未改冻结/执行代码或命令。真实env/DB/schema/grant/server取消及经理锚身份/ACL不在签收范围。项目经理已发最终具体决定弹窗，未获答复；本次派单不是批准。等待正式批准及其准确许可交付，再按原唯一CLI单次执行；失败claim保留、不重放。没有确定的新隔离实施缺陷，不开启新模拟循环。
