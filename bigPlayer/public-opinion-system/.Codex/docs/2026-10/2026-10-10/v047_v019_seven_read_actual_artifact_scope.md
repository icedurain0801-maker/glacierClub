# v019 七读实际驱动工件与最后决定范围

Status: ARTIFACT_SCOPE_REVIEW_READY / INDEPENDENT_QA_PENDING / REAL_EXECUTOR_DISABLED / CUTOVER_HOLD

2026-10-10后续：HwrJ6f依赖独立v039、v040六包独立v038已正式核收；历史待回描述保留但不作为当前状态。最后受控签名许可/精确CLI/真实读取与TCP路径已备齐，见v048/v049新冻结；不是再留另需入口。本批新QA与最后具体用户决定/经理公钥登记签发仍未完成，不执行真实。
Owner: 开发负责人
Date: 2026-10-10
Retention: 新冻结与原件至少保留30天；原历史不清理。

## 当前具体工件

已有mysql2为3.23.2，可复用而无需安装/升级：来源、精确lock/package hash、11包闭包、230文件逐份SHA、唯一HwrJ6f manifest和开发原件见v046。固定七读执行流程实际加载mysql2，经私有Duplex合成MySQL握手/认证、ColumnDefinition/结果包验证，而非自制callback-shaped驱动。最终10/10是开发离线协议证据，独立QA待回，v040集成六包独立结果仍待回。

可复现命令仅v046的verify/test/verify。生产命令入口 `node scripts/overseas-v019-mysql2-disabled.js` 永久返回 REAL_MYSQL2_EXECUTOR_DISABLED；生产reader调用永久返回REAL_CONFIGURATION_READER_DISABLED。不存在环境变量开关、外部driver/provider注入或默认身份回落；不能拿manifest批准fixture冒充真实运行。当前完整七读执行器/解析器只接根.temp合成输入及内存流；指定真实.env读取和TCP绑定尚未启用，也不能通过参数把fixture入口转为真实入口。

这消除了“真实驱动依赖整体缺失”的错误判断，并提供可审驱动与字段/关闭语义工件；尚未消除真实激活工件的门禁。本包不宣称已具可运行真实七读命令。后续将已验七读执行器/解析器接固定来源与专属TCP的受控激活入口时，须另给确切命令/manifest并独立核禁用与边界，不能只改开关后借本包PASS运行；由开发负责准备，不要求用户手工建立账号/执行运维。

## 实际驱动差异及实测结果

createConnection构造即拨号/握手，外层计时先于创建；此次所有创建均预置内存流，guard拒TCP/DNS/TLS/HTTP、子进程与worker。connect(cb)不是拨号起点。SELECT三参回调及ColumnDefinition数字columnType已实际验证；正式七读使用query事件逐行计数与校验，避免callback默认累积全部rows。

query自身timeout只返回PROTOCOL_SEQUENCE_TIMEOUT，不关闭连接/保证SQL取消，已有原生timeout负测。适配器外层timeout立即毒化、调用driver.destroy并额外stream.destroy，禁止后续query/end/retry/reconnect；内存流已实际destroy不等证明真实服务器SQL已停止。driver.destroy本身只是stream.end；end回调早于COM_QUIT，不能作为成功关闭证据；成功额外等待底层close后复核总deadline和source/account/credential期限。关闭等待期自然到期，NO_GO、不发布清单，已有closed无需重复destroy。

仅读取fields的name/columnType/flags/characterSet，不复制_buf/getter载体；未知、重复、额外字段拒绝。dateStrings+timezoneZ、BIGINT字符串保真再safe整数、布尔只接受数值0/1。原始/规范化JSON UTF8分别row16KiB/query32KiB/batch64KiB，实际恰等/-1边界已测；SQL行数1/2/2/2/4/2/2。解析一行之后判预算，非原始socket字节/内存硬限；实际schema类型/charset未证，遇不支持类型停止而非悄悄放宽。

## 最后真实决定必须明确的影响

建议配置来源确定为已有指定文件 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/bigPlayer/public-opinion-system/.env` 的一次受控整文件读取，仅消费DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD五键。它会接触该文件全部字节，不能宣称物理上仅五键；其他键不消费/输出/存盘。当前严格解析器仅支持 KEY=value 或单/双引号包围的字面值，不插值、不接受重复五键、缺项/空值/非固定host/port/database，无DATABASE_URL或root/空密码回落。若真实文件格式不匹配，应HOLD并由开发给精确修复方案，不先读取真实文件补证或自动改配置。

此方案是未来决定范围，当前没有读取真实文件内容或认证secret。实际username/identity/grant仍未证；源码默认root不等实际身份。授权后只有既有DB身份私有消费，不要求新账号/ACL。引用释放仅覆盖模块持有record/config与可变Buffer，不承诺JS或第三方driver内部密码字符串物理擦除。

固定source081a16d2-5545-4afd-9c65-e04777e4540b；127.0.0.1:3306/public_opinion/server_id1/MariaDB10.4.14；独立单连接，无pool/retry/reconnect。R1实例/UTC时钟在事务外，R2-R7同短RR READ ONLY、ROLLBACK、等待close。七SQL逐字合同封在冻结profile模块：config仅boardId标量，credential仅元数据/cipher/ref存在布尔，registry仅存储url_hash等窄元数据，排除完整config/url/capabilities/cipher/ref/refresh正文。实际ID由获准窄读产生，fixture ID绝不用作真实许可清单。

最后具体决定应包含真实激活工件manifest与精确命令、独立QA报告、准确来源整文件影响、未知身份/grant口径、固定实例/source、最多7SELECT及控制语句、每操作≤1秒/全批含认证读≤5分钟、字节/行数、结果只写根.temp新唯一非秘密清单、owner开发与新证据30天保留。当前激活工件/独立报告未齐，不能提交“已经可执行”的决定。

R8业务secret/envelope/refresh、token exchange、真实HTTP24请求/三站、入库/AI/通知、服务切换/DDL/ACL、目录/readiness/排他/恢复均不在七读许可内。共享本机资源不承诺国内绝对零影响；不操作国内或探别源secret。proof停止、生产HOLD。

## 变更记录

新收口替代v045的驱动整体未安装判断，保留原文历史；补已有工件来源/hash、实际field与callback/cancel/destroy/end差异、开发离线证据、未来.env整文件一次读取建议、真实激活剩余门禁及30天保留。不修改经理v033，不push/发版，不连接或读取真实secret。
