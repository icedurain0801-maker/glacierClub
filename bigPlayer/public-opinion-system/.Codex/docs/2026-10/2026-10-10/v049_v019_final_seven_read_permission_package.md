# v019 最终受控七读工件与许可决定包

Status: CONCRETE_EXECUTOR_PREPARED / ISOLATED_CONTROLLED_SEVEN_READ_ENTRY_PASS / USER_SEVEN_READ_DECISION_PENDING / TRUST_ANCHOR_UNENROLLED / REAL_ACTION_NOT_AUTHORIZED / CUTOVER_HOLD
Date: 2026-10-10
Owner: 开发负责人
Retention: 新冻结/原件/claim/结果30天，历史不清理；不自动删除。

## 最终工件与精确命令

完整受控入口、许可验证、固定配置读取器、专属真实mysql2单连接、七读与结果落盘均已实现。真实路径只能通过经理最终具体决定签出的生产许可，fixture与旧生产入口不可激活。新工件不会再留“另需入口”；公钥登记与签发是最终批准凭据交付，不修改执行代码、不新增服务或依赖/账号。

唯一cwd：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/v019-seven-read-executor-bQFR4k`。

manifest SHA256：`e87d08d5061abc456a670154ac36ad8d2ae031a4a1ddce9ca1c21ebc964a9f49`，233份代码/测试/lock/11包完整文件。依赖mysql2 3.23.2，全部准确来源/版本/逐hash由manifest锚定，verify重新核依赖解析不回落。开发22/22与原件/hash见v048。本批独立v040已核收22/22+自有8组的限定入口PASS，准确原件/脚本hash见v048核收记录。HwrJ6f独立v039、六包集成独立v038为另两份依赖报告，未替代本包签收。

未来获准后唯一实际CLI（当前不执行）：

```text
node scripts/v019-seven-read-cli.js --execute --permit-base64 <BASE64_UTF8_JSON_ENVELOPE>
```

`<BASE64_UTF8_JSON_ENVELOPE>`是经理批准后签出的非秘密envelope完整JSON的标准base64编码，只有这个参数。不接受许可文件路径、公钥/锚路径、env、live、target、source、config、driver、provider、额外参数；执行cwd及entrypoint已绑定许可。CLI默认无许可返回HOLD/PERMIT_CLI_REJECTED；生产公钥锚缺失返回TRUST_ANCHOR_UNENROLLED，均不认证读取或拨号。旧生产入口仍永久拒绝。

本次仅执行v048的guarded verify/test/verify。已只检查生产公钥锚路径存在性，结果不存在；没有建立锚、读取生产私钥、签生产许可或读取真实.env。

## 签名envelope合同

envelope准确三个键：`payload`、`signature`、`keyId`。payload为严格data-only对象，不接getter/function/symbol/prototype；signature为64字节Ed25519签名的base64。签名消息是`Buffer.from(canonical(payload),'utf8')`；canonical对所有对象键按字典顺序排序，数组顺序保留。canonical/hash函数由冻结许可模块提供；公钥仅受信锚取得，envelope不含公钥。

| payload字段 | 精确批准范围 |
|---|---|
| version/lane/scope | 1 / production-seven-read / overseas-seven-select-readonly |
| sourceId | 081a16d2-5545-4afd-9c65-e04777e4540b |
| target | host127.0.0.1、port3306、database public_opinion、serverId1、version10.4.14-MariaDB |
| artifactDirectory | 上述唯一cwd，使用正斜线绝对路径 |
| artifactManifestSha256 | e87d08d5061abc456a670154ac36ad8d2ae031a4a1ddce9ca1c21ebc964a9f49 |
| sqlSha256 | 1b8b3f525a2d05e2be89d911c2f952aed888227c57cf89c6abd66212e4a7e6e9 |
| command | program=node、entrypoint=scripts/v019-seven-read-cli.js、mode=--execute、argument=--permit-base64 |
| configuration | 下述固定文件；physicalRead=whole-specified-file、readCount=1、selectedFields固定有序五DB键、identityGrantStatus=unverified |
| budget | selects7、rowLimits[1,2,2,2,4,2,2]、perRowBytes16384、perQueryBytes32768、batchBytes65536、operationTimeoutMs1000、totalTimeoutMs300000、connectionCount1、retryCount0、reconnectCount0 |
| forbidden | r8/http/token/ai/ddl/acl/services/domestic全部false |
| issuedAt/expiresAt | UTC ISO毫秒格式；签发起最多5分钟，issuedAt不能未来，执行起/各步骤/结果发布前期限都有效；过期不续签自动重放 |
| nonce/outputDirectory | 经理本次决定的32hex单次nonce；仓库根.temp/v019-seven-read-output-<nonce>正斜线绝对路径 |
| owner/retentionDays | development-lead / 30 |
| decisionId | 本次具体用户决定可核对ID（1–100字符A-Z/a-z/数字/._-） |
| authorityFingerprint | 经理批准公钥SPKI DER字节SHA256（64hex），不是密码或业务认证摘要 |

配置固定为 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/bigPlayer/public-opinion-system/.env`，五键有序DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD。一次受控整文件读取会接触全部字节，只消费五键、不输出/存盘其他字节；不是物理五键窄读。最多64KiB，缺/重复/空五键、非固定host/port/database、严格字面格式不支持即HOLD；无DATABASE_URL或root/空密码回落。实际username/grant/schema尚未证，拒绝不扩大权限/新建账号/ACL。JS/驱动内部密码字符串物理擦除不承诺。

## 经理批准凭据建立与核验流程

这是一项最终具体用户决定后的单次经理操作；当前仅说明，绝不代经理签发或提前生成生产密钥。签发仅用现有Node内置`node:crypto`的Ed25519，无新增包、服务、账号或凭据provider。

1. 经理核本工件唯一manifest、完整CLI、独立QA报告、上述scope/整文件影响/输出nonce与30天保留，将这一个具体执行决定交用户。决定须明确允许建立一次经理公钥锚并签该七读许可；此前隔离授权不包含此步骤。
2. 经理根据该决定确认其既有受控Ed25519签发公钥；若无既有签发密钥，该同一具体决定可明确授权经理在其签发进程中生成一次性Ed25519 keypair，只在内存持有生产私钥、不写盘/不交开发，签后释放。不能复用任何fixture密钥。公钥SPKI DER/base64、SHA256指纹与经理决定ID在经理受控交付记录中核对；不是从CLI自带公钥取信任。
3. 经理用决定批准的nonce/输出、固定工件与范围，以及批准后不超过5分钟的签发有效窗口组装payload；将公钥指纹绑定payload。`crypto.sign(null,Buffer.from(canonical(payload)),privateKey)`产生signature；keyId为经理签发标识。此步只是签非秘密许可，不读取DB认证材料。
4. 固定非秘密锚路径：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/v019-seven-read-manager-public-anchor.json`。锚准确键：kind=MANAGER_USER_DECISION_PUBLIC_ANCHOR、issuer=project-manager、keyId、publicKeySpkiBase64、fingerprint、decisionId、artifactManifestSha256、approvedEnvelopeSha256、expiresAt。approvedEnvelopeSha256是canonical(envelope) UTF8 SHA256，其他值必须与该许可逐项相同。
5. 经理先核固定路径和父目录无重解析、锚未存在；存在则停止，不覆盖或删除旧锚。登记用wx新建并保存非秘密公钥/决定记录，不保存私钥。登记时依该最终决定核对owner/可写主体与外部确认的公钥指纹；只读角色可读公钥，写锚仅经理批准的可信操作者。若现有目录权限不满足，HOLD并给准确权限影响，不能在本次隔离阶段擅改ACL。
6. 经理核锚文件SHA、fingerprint、envelope SHA/Ed25519验签、具体用户决定记录、工件前verify全部一致后交开发执行该唯一CLI。开发不自行签生产许可、不用fixture许可升级生产。执行器不接私钥，不提供公钥覆盖参数；本轮缺锚状态保持默认拒绝。

文件中的issuer/fingerprint不是身份自证。这个设计依赖经理最终决定登记的可信锚和受控写权限；可改锚/执行器或删除claim的同机管理员处于信任边界之外。执行器未主动验证Windows ACL，登记核验由经理最后具体决定流程完成，当前不存在“已经设置经理专属ACL”的证据。没有暗藏未定义服务/签名provider依赖。

许可、公钥锚、输出都不进执行器manifest：签名许可绑定不变代码manifest；随后锚绑定具体envelope digest、公钥指纹/决定/期限，避免hash循环。登记不修改冻结代码，无需新增入口或重新改业务实现。

## 验证、claim与执行顺序

schema/范围/期限 → 固定经理公钥锚元数据与Ed25519验签 → 完整冻结hash/文件集/依赖解析复核 → 原子mkdir唯一输出/wx+fsync claim → 私有单次cap → 固定.env一次读取 → 固定IP专属createConnection → R1目标/时钟 → RR READ ONLY的R2-R7 → ROLLBACK → 等待底层close → 再核许可与候选期限 → wx+fsync非秘密result。

审批公钥锚/工件文件读取是非秘密审批元数据，不是认证配置读取。无有效许可不会读取真实.env、解析认证或创建连接。许可只有fixture lane时执行器始终使用假文件与私有内存流。

原子mkdir失败即已claim，重复、并发、重新进程均不能执行；任何异常/退出留claim，result不齐也不自动重放。claim/result路径只在仓库根.temp，owner开发、30天保留，不清理旧历史。最多一个成功claim；可变cap不公开，真实授权/消费/七读/落盘均私有，公共调用不能绕过落盘。

超时自毒化并额外底层stream.destroy；mysql2 destroy只是end别名，native query timeout也不保证SQL停止。成功必须等close而非早期END callback；真实服务器SQL取消与资源影响仍未证，短连接/查询会占共享本机资源，不宣称国内绝对零影响。任何目标/schema/type/行/字节/归属/期限/默认账号冲突则停止，不重连/重试/修ACL。

## 最后门禁

新独立v040已限定入口PASS并由经理核收，最终具体七读决定弹窗已发、尚无答复。当前等待该决定，不再待QA或重复测试。真实MariaDB/schema/grant/env读取与服务器SQL取消没有签收。本单准备完成不等实际执行已授权；没有生成生产key/锚/许可，也没有真实读取或连接。

R8业务secret/envelope/refresh、HTTP/token交换/三站采集、入库/AI/通知、DDL/ACL/服务切换、国内、proof恢复、readiness/目录/排他/发版不在许可内。proof停止、生产HOLD。本包不创建生产锚/密钥、不给测试签名生产身份、不push/发版。
