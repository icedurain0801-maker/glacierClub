# 海外候选17 manual 阶段独立 QA 交接

Status: corrected-snapshot-developer-verifying / RUNTIME_NO_GO
Date: 2026-10-09

一句话需求：独立验证 manual 账本、绑定审计、持久计数、恢复断点及安全入口完整闭包；不是生产放行。

已拍板决策：经理及 QA 已确认 manual 与 scheduled 分阶段；scheduled 强制关闭/NOT_IMPLEMENTED，最终海外范围不缩减。只使用当前模型。无生产DDL、服务切换、真实HTTP、账号刷新、AI/翻译消费、push或发版。

## 冻结锚点与命令

此首快照离线1115通过/13失败，原始offline-raw-1791542862584.txt保留；缺迁移/正式辅助脚本/installer闭包，非业务失败但不能交为合格冻结。已修机械copy加入测试依赖，另新建快照，禁止在此快照补文件改hash。下列首快照锚点仅失败证据，正式新快照交接另追加。

### 正式修正快照（以本节为准）

- 根路径：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-candidate17-manual-M8rctf`。
- 清单SHA256：`2e9c95b6e59734d57f74acdceef72721da9943206fa601d5aae7323b7687f52a`；874文件，补迁移/辅助脚本/installer源依赖，不执行其生产入口。
- 在本快照CWD执行：`node scripts/freeze-overseas-manual-candidate.js --verify 2e9c95b6e59734d57f74acdceef72721da9943206fa601d5aae7323b7687f52a`。
- 离线：`node scripts/freeze-overseas-manual-candidate.js --test 2e9c95b6e59734d57f74acdceef72721da9943206fa601d5aae7323b7687f52a`。
- SQL：`node scripts/overseas-isolated-mariadb.js --isolated`。
- 额外startup：仅命令进程设置 `PO_ISOLATED_CANDIDATE_ROOT=本快照根` 后 `node --test server/test/v019CandidateStartup.test.js`，开发1/1通过，QA须重跑。
- 精确排除：`server/test/v019ReadCandidate.test.js`另release manifest不适用；`server/test/publicOpinionSourcesMultisite.contract.test.js`仅读项目外 sibling admin assets，在工作树全server用例已通过，runtime冻结不含该UI页，不能当本包业务PASS。startup虽从总集合排除，额外必跑。
- 新外部SHA参数强制校验，缺省/不符拒绝；QA另用独立文件hash在前后核外部锚，避免仅相信本地工具自证。

以下807项/首SHA与旧无参数命令仅失败首包历史，禁止按其作为当前QA目标。

- 快照：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-candidate17-manual-MzURrH`。
- 清单：快照内 `manual-freeze-manifest.json`；外部固定 SHA256：`80fd69138ded91200ab9a37b855a860aa6aee00ea2ca82829d5da92d3906d8ff`。
- 冻结文件 807 项，含全部 first-party 源码、当前已安装依赖、server/worker 测试及隔离SQL脚本；Node v22.22.0、MariaDB 10.4.14。无依赖升级。
- 在快照 CWD：`node scripts/freeze-overseas-manual-candidate.js --verify`；`node scripts/freeze-overseas-manual-candidate.js --test`；`node scripts/overseas-isolated-mariadb.js --isolated`。
- **先后独立核清单 SHA 必须等于上面外部锚点，再执行 inventory 核验**。`--verify` 自身读取本地清单，不构成防本地重签的外部封签。测试文件和命令以本交接及已锚定清单为准。
- 两个允许的内部 workspace junction 如清单实际存在仅指向快照自身 server/worker；其余 link 拒绝。不能泛称整个包无 reparse。

## 开发原始证据（不能代替独立 QA）

工作树最后 `根.temp/overseas-real-db-7fPYqw/result.json`：19主项局部PASS，ledger人工事务矩阵15项，reply自身页before/after、新Node恢复、历史memory/gap与非目标SQL；owned DB停止/13316释放。此前失败原件 rZn0Hb、cVjlol 保留，候选16不改、不转移PASS。冻结快照复跑仍在执行，结果收回后追加，不预写PASS。

全量worker工作树561/561通过；Server默认603通过/3失败，其中2个v019候选根未设置，另1项旧repo测试固定调用序号误选COUNT。仅修后者测试为识别真实projection/count，两者仍必断言，单测通过；冻结完整离线复跑待收。

`server/test/v019CandidateStartup.test.js`虽清单命令排除但额外设置 `PO_ISOLATED_CANDIDATE_ROOT=快照根` 后独立执行1/1通过，证明 require(app) 不DB查询、HTTP、listen、timer或消费；需 QA 额外复跑。

`server/test/v019ReadCandidate.test.js`绑定另一 v019 两文件发布包、395文件manifest及其生产baseline，非本manual包的release等价用例；未为本包执行，单列 NOT_APPLICABLE_TO_THIS_RELEASE，不把它当安全PASS，不执行其build脚本或替换生产baseline。

## 逐行证据及适用边界

| manual 项目 | 开发覆盖 | 独立 QA 要求/边界 |
|---|---|---|
| canonical源/初次claim/恢复入口 | 真实DB分类读；精确queued0 CAS；私有recovery repo/proof/Journal | 伪domestic/其他platform拒，expired不普通claim；strict stage-covered factory才属本阶段 |
| 同页评论/内嵌/动态回复 | actual runSource/Connector/PageStore SQL，links4、jobs各4pending | pending不是AI/翻译完成 |
| 评论及回复页 before/after | 自有child物理commit断点，exactIntent/newNodeepoch2 | after不重取已提交回复、completed_epoch1不改；不是DB断电 |
| register/commitPage 与seal竞争 | 不同SQL连接、锁等待timeout、提交后partial/禁止追加 | 人工CP和ledger.commitPage派生，无provider内容页；并发吞吐/完整PageStore竞争仍未证明 |
| audit创建/terminal/source故障 | 原子rollback、无孤儿、精确重试、ACKunknown只读accepted | 创建commit ACKloss未测，不能借terminal ACKloss覆盖 |
| 历史预算/缺证据 | 100/1000sealed，10k/10001时间到限rollback+partial；gap缺provenance拒 | 10001不代表实际碰到数量限，可能先触时限；RR枚举+逐root current-read FOR UPDATE复验，不是全行同一快照 |
| 内存 | 固定RSS256MiB/heap96MiB；隔离进程usage注入后真实SQL rollback+partial | 非物理内存压力；协作式判限非OS硬上限，不包含MariaDB；SQL/GC间可能超采样值 |
| checkpoint及计数 | 外run descriptor/错窗口CP拒；本run账本完成/links唯一计数hash/Progress | CP无run_id不证明同身份CP原始producer run；主链无本run账本proof拒completed短路；变化/全部context组合仍需逐测 |
| 非目标 | 国内bigplayer/Discord/TapTap/Facebook真实bulk恢复+路由；原海外/未知行与候选表hash不变 | fixture rollback、零transport；完整provider采集未测 |
| scheduled | 构造enabled拒、构造后mutation仍off、scheduled run身份拒 | 全链NOT_IMPLEMENTED/NO_GO，另批继续 |

首次queued0 claim commit成功但ACK丢失或Journal前中断可留epoch1 running缺Journal，已知失败关闭、不自动领新epoch或制造Journal；不能宣称此缝隙可无损恢复。旧普通factory接口存在作兼容，不转移新ledger/audit结论。

## 请测试负责人执行

先审脚本身份/owned SHUTDOWN和外部锚点；只读记录生产PID5900/19584/19768及启动时间。核清单锚→807前hash→全量离线及额外startup→全新自有13316 SQL→807后hash及清单锚→owned DB退出/端口释放/生产连续性。逐行PASS/FAIL/NOT_TESTED，安全必项缺证据不得manual放行。只对自有13316/serverId20261036/新datadir建表和SHUTDOWN，不生产操作。

原始结果及快照测试日志另外SHA记录；QA不修改快照/业务代码，失败消息退回开发，报告同时交经理。本交接完成后经理待办仍由经理唯一维护。
