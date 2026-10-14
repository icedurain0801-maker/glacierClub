---
last_updated: 2026-10-10
status: schema-config-partial-pass-runtime-base-drift-hold
owner: 独立QA
---

# v099 六表与关闭配置独立只读验收

结论：六表/索引/空表、两个 disabled 配置与 33 张原有表结构独立只读 3 组 PASS；运行身份组 FAIL，前端基底发生真实漂移。v097/v067 的候选隔离 PASS 保留，不能据此继续沿旧前端 v214 身份签发布准入。上线后验收未执行，未启用新链路。

## 权限与执行范围

用户 heartbeat 要求继续独立 QA。本次先核经理 chat `01a083d6-a4ad-7543-9050-783a06307f66` 原始用户 turn `01a1255c-a07b-72d3-8e04-7063fe543354` 的“确认”，其前一确认请求及转达范围为六表及对应开关，执行后只读核验。QA不接受额外业务操作派单，不执行已由开发实施的 DDL，不运行 `execute.cjs`，不写生产 env、不重启服务。

独立 SQL 明确设置 `SET SESSION TRANSACTION READ ONLY`、`START TRANSACTION READ ONLY`，读取 `@@tx_read_only=1`。只用 information_schema、SHOW CREATE、SHOW INDEX 和六张新表的 COUNT(*)；结束 ROLLBACK/关闭连接。没有读取业务行内容，无生产 DDL、DML、回填、认证、抓取、AI 或通知。凭据仅供连接使用，不输出 env/凭据；报告与原件无 secret 值。

## 独立结果

| 组 | 核验方式 | 结果 |
|---|---|---|
| 1 | production env 与 staged 原字节相同；before 前缀完整保留；后缀精确只有两行指定 JSON，每个开关仅出现一次且严格 `{ "enabled": false }` | PASS |
| 2 | migration 六条 CREATE 的定义语义与 v097 冻结三个 schema 一致；独立解析列与索引并读取生产元数据逐项匹配类型/长度/unsigned/nullable/精度/默认值/JSON CHECK/主键/唯一及普通索引、InnoDB/utf8mb4；六表 COUNT 均 0 | PASS |
| 3 | 当前 po_ BASE TABLE 完整集合恰为开发 DDL 前 33 表 + 指定 6 表；逐个独立 SHOW CREATE 的结构 hash 匹配 preDDL 快照，排除 AUTO_INCREMENT 当前计数 | PASS |
| 4 | 当前六个常驻服务 wrapper PID、直接 Node PID/parent/createTime、XML 与 v097 归档前采样比较 | FAIL：前端身份漂移，其余五服务一致 |

六表为 `po_current_analysis_intents`、`po_current_analysis_repair_records`、`po_current_analysis_intent_audit`、`po_overseas_current_intent_proof_audit`、`po_current_translation_intents`、`po_current_translation_intent_audit`。只读时点为空，不代表未来不会有写入。原有 33 表的“前”来自开发迁移前快照，本次独立读取“后”并比较，未虚构 QA 曾独立采集 DDL 前状态；结构匹配不等于检查原有业务数据完全不变。

环境前 SHA `a1d8ed681765d989a8c7a14e312dd1caa74c8f8a9d96298e30f102227d5c5952`；当前及 staged SHA `56182482ead213d48231cf7c24db8b64e2db512243f772a9fd6d9426e749e9c7`。仅确认磁盘配置 disabled，进程实际配置加载未知，不把未重启服务推定为已加载这两项。

## 真实漂移

18:35:23 QA 独立运行身份采样：`PublicOpinionFrontend3001` wrapper 从19104变11268；旧 Node18460不存在；XML SHA从 `cd342327dc709b28129f5de06d9af4c888efec377ed6816d5627fd79f7b60021` 变为 `f5ef0b3e3e5fa2a5f503d5843c1f36661557588ad7c56781a5f92ea518a99480`。补充只读采样确认新 Node23356，XML workingDirectory 指向 `release-20261010-overview-risk-order-v155`，已不是 v097 保护的 v214。

API仍wrapper22852/Node47628/XML `5789239411f27a2c6f0bbccf660bbfb96a6cfe04829078d62f93b958b697b062`。其余 analysis、translation、collection、login-session 的原 wrapper/Node/createTime/XML亦一致。该检查不能证明实际 loaded 模块、历史窗口无全部副作用；只能指出前端已变、其他五个受查身份匹配。前端变化原因及其授权切换、完整来源和 v214 功能保留待新证据，不直接推断功能回退。

漂移 FAIL 原件保留，已立即回传开发和经理。不得沿旧前端 PID/XML 签切换；不因服务 Running 解除漂移。不复跑已通过 v067 或本次 3 组，只待更新冻结基底及实际控制证据。

## 工件与验证

正式 QA 脚本：`v068_six_intents_independent_readonly.cjs`，运行参数 `--read-only-six-intents`。只读 SQL 命令 exit 0，3 组一次 PASS；运行身份命令 exit 1，为真实前端漂移。

仓库根原件：

- `.temp/qa-v068-readonly/result.json`，SHA `c525c833ee36b54a05d6e7794482836935df9b67cc74240ddc48ed6bb361110d`，含独立 SHOW CREATE/列/索引/空表记录，无 env 值。
- `.temp/qa-v068-readonly/runtime.json`，SHA `bf411d001142d9d7ffea85e5b576ac84d445dc5f47f51f791ba37dba4cb7d373`，保留 FAIL。
- `.temp/qa-v068-readonly/frontend-observation.json`，新前端只读身份与 workingDirectory，loadedProof=false。
- `.temp/qa-v068-harness/runtime.ps1`、`frontend-observation.ps1`；`readonly-r1.cjs` 保留 QA 初版正则语法错误，`node --check` 拒绝后、任何连接/执行前修正，正式脚本语法通过。SQL未因该语法错误运行，不计一次生产SQL失败，不重跑通过组。

正式脚本语法检查通过；新增文件空白检查未报告空白错误（Git仅换行转换提示）。未改业务文件。

## 尚待条件

旧入口实际禁止再起、准入停止/排空/双 gate、main pause/actual loaded、translation 完整回退或批准且生效的 stop-only仍未具备完整原件，本次未重复旧扫描。新表存在与磁盘关闭配置只解除“缺表/无开关”的相应结构缺口，不提供启用权限或精确 scope，不解运行控制 HOLD。

上线后健康、实际加载、受控功能，仍需明确切换结果及用户批准精确名单。heartbeat继续静默等待新可执行证据，未满足全部限定 QA 完成条件，不暂停、不重复旧 PASS。
