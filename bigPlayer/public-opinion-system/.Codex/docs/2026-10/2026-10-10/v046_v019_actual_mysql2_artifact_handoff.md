# v019 现有 mysql2 工件与默认禁用执行器

Status: DEV_TEST_EVIDENCE / QA_PENDING / REAL_EXECUTION_DISABLED / CUTOVER_HOLD

2026-10-10独立核收补记：HwrJ6f已获测试v039限定ISOLATED_ACTUAL_MYSQL2_PROTOCOL_PASS，10/10及自有10组；raw4T9bFL SHA7115523b7068c5b6e6d18dcb2e6167316b471373e0371bf10d0e73ae93892327，独立脚本SHAa2130d406b4c26fd4ba720b9a6a7c3b8e45a57ccb25d602334fed10a00454d8d均已核。原状态/过程保留，当前依赖不再待签。新受控入口另见v048/v049且另独立QA；真实env/DB/grant仍未验。v040六包v038亦已核收。
Owner: 开发负责人
Date: 2026-10-10
Retention: 新冻结及原件保留30天；历史原件不清理。

## 变更记录

已只读确认项目根 node_modules/mysql2 与 package-lock 为3.23.2；此前 server/node_modules 缺失不代表项目根/整体缺失。员工只读核对 release v019-lastnight-token-20261008 同版本，六份关键文件 hash 与项目根相同；不据此单独证明现役进程加载绑定。

新增 scripts/v019-mysql2-artifact-freeze.js、scripts/overseas-v019-mysql2-disabled.js、scripts/v019-mysql2-memory-peer.js 和 server/test/overseasV019Mysql2Artifact.test.js。冻结还包含既有 profile SQL/schema合同及网络guard，11包运行闭包和完整逐文件bytes/hash、项目lock。没有安装/升级依赖。

真实驱动使用私有 Duplex 内存流，合成握手与认证验证、真实 ColumnDefinition/文本行包；不是 callback-shaped 自制驱动。createConnection在构造时已连接，必须在调用前注入流并启动外层deadline。SELECT使用事件模式逐行检查字段/原始与规范化JSON UTF8预算，控制语句回调；另外实测三参SELECT回调。fields只投影name/columnType/flags/characterSet，不拷贝包含延迟getter与_buf的整个对象。query timeout不是SQL取消；destroy是stream.end别名，因此失败另调用底层stream.destroy。end回调在COM_QUIT前，成功须等待close。

配置读取器只接受仓库根.temp专属合成文件，整文件一次读取、只消费五DB键，不保存或输出无关字节；缺项/重复/错误固定目标无回落。生产reader和executor入口恒拒绝且不检查调用方参数。没有读取真实.env、认证材料或运行配置，没有真实网络/SQL/服务/DDL/ACL/国内操作。

初版冻结根仓库.temp/v019-mysql2-artifact-XboWMZ，manifest 6d905d28cf3006d741303b5929061b8b0d45ceb7150a477784908d1ac609ec8e，229文件；开发测试待执行。旧包保留，此记录不签PASS。

初版开发原件 .temp/v019-mysql2-evidence-qOq8pG/result.json，SHA fecb4013e11baabbe653a60c81a03e403479bfad0731581e97176f4cb88a2f33，7/8：字段拒绝销毁后夹具继续发包引发异步异常。已修夹具每包前停止检查与局部批引用；第二冻结xQRgNl manifest7574e454e7f7031f4df73847833466ff01d3ffd7fed415fec2dd854940672699，原件oB8hYu SHA0a5af237617b6d5d5716256b6cdfa1d45d3af0e4d047b2b484d5d4f79b3712e5为9/10：期限测试在END前已到期，调整为R4交付起算400ms、END关闭延迟600ms，未放宽执行器期限检查。两失败原件及冻结保留。新增准确字节边界、原生query timeout不关闭流的实测。

第三冻结b898nA manifest e6399c70a8ef13ad543380c40be1875f4469a33f4e86d73bae4d75411cb7332f，开发原件5eH0Yl SHA81c2d02852f697acab7d46dec8e5d2162e5dba3b15f9f35830b07958baffbca5通过10/10。员工只读复审后进一步补零行/零期限夹具、晚fields停止、成功交付与最终总deadline复核、parse局部引用释放和冻结require.resolve闭包复核，增加DNS拒绝guard。此后必须另冻另测，不借第三冻结PASS。

认证释放仅承诺本模块持有record/config引用释放与可变输入Buffer清零；不承诺mysql2握手内部全部密码字符串或JS字符串物理擦除。运行身份/grant未证。

## 来源与依赖闭包

来源：C:/Users/Administrator/AppData/Roaming/Code/User/project manage/bigPlayer/public-opinion-system/node_modules/mysql2；lock为项目根package-lock.json。现有release参考来源 C:/ProgramData/PublicOpinion/releases/v019-lastnight-token-20261008/node_modules/mysql2。

运行闭包：mysql2 3.23.2、aws-ssl-profiles 1.1.2、denque 2.1.0、generate-function 2.3.1、is-property 1.0.2、iconv-lite 0.7.3、safer-buffer 2.1.2、long 5.3.2、lru.min 1.1.4、named-placeholders 1.1.6、sql-escaper 1.5.1。包package.json精确SHA和全部文件SHA见manifest。@types/node26.2.0/undici-types8.3.0为类型peer，不属于JS运行依赖。本包不是npm install工件，没有声称重新安装已验。

项目根及上述release的mysql2/package.json SHA均为4a2eb4119dc1ab79d85c5a033ce9f8f12e003a8453dfbac9d9e912860b86e914；两处package-lock.json SHA均为4cf97a1f34d59657664a262108b3909e7811b2128b56034f558ca51ea14977ab。server/package.json的^3.11.0允许3.23.2，不以声明下限作为安装版本。此次实际加载冻结目录mysql2及11包闭包，verify另核require.resolve位置，拒绝祖先回落。

## 最终唯一交接

仓库根：C:/Users/Administrator/AppData/Roaming/Code/User/project manage。

| 项目 | 精确值 |
|---|---|
| QA冻结cwd | 仓库根.temp/v019-mysql2-artifact-HwrJ6f |
| manifest SHA256 | fcfb24e30db81214c201fb38de11337759189d84e2919f834f58c2829eea9080 |
| 文件数 | 230；7份自有文件、1份lock、11包完整文件 |
| 开发原件 | 仓库根.temp/v019-mysql2-evidence-ep2CMO/result.json |
| 原件 SHA256 | 9f219f77835a8f76bb4092724810eca39a5744bcc2c2bb49467fc891cfb6612e |
| 开发验证 | 10/10、exit0、unchanged=true、stderr空；五份新JS语法检查及最小diff空白检查通过 |

最终运行guard为新增v019-mysql2-offline-guard.cjs：沿用既有网络/子进程/worker拒绝，再拒DNS函数，不改旧guard或旧冻结。中间397c3F仅为复审加固阶段冻结，未测试，不复用为最终。开发原件kind=DEV_TEST_EVIDENCE，不代独立QA签收。

在上述精确cwd独立执行：

```text
node scripts/v019-mysql2-artifact-freeze.js --verify fcfb24e30db81214c201fb38de11337759189d84e2919f834f58c2829eea9080
node scripts/v019-mysql2-artifact-freeze.js --test fcfb24e30db81214c201fb38de11337759189d84e2919f834f58c2829eea9080
node scripts/v019-mysql2-artifact-freeze.js --verify fcfb24e30db81214c201fb38de11337759189d84e2919f834f58c2829eea9080
```

请QA自行建立独立原件/hash/报告，追加自有fields、零行/立即过期、close期限、错误脱敏、配置重复/错目标、限额/晚包与禁用入口负测；仅签ISOLATED_ACTUAL_MYSQL2_PROTOCOL_PASS，不签真实数据库、配置/grant、集成或生产。v040六包独立验收仍待其正式报告，本单不能替代。

测试假配置文件全部根.temp/v019-mysql2-config-fixture-*/synthetic-config.txt，新建且保留；仅合成认证与无关secret哨兵。证据owner开发，新冻结/原件保留30天，不实施自动删除，历史不清理。

## 尚未证明的边界

真实网络/数据库握手、grant、MariaDB实际字段类型/charset、TLS、服务器端SQL停止仍未验证。JSON行限额在驱动解析一行后实施，不是socket原始字节/物理内存硬限。拒绝未知字段类型的实际schema可能HOLD，不为适配未知生产schema放宽。生产入口永久关闭，本包实际可运行命令仅为离线验证；未来真实激活须另具体工件决定。
