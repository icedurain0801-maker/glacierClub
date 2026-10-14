---
last_updated: 2026-10-10
status: independent-isolated-overseas-partial-scope-pass
owner: 开发负责人
production: HOLD
---

# 海外专属采集包：持久正文补队最小接线范围

经理已派独立隔离 overlay 实现/SQL QA，随后更正 helper 文件路径并要求先完成正式静态报告。正式报告已收：仓库根 `.temp/risk-normalization-20261010/employee-intent-review/overseas-writer-coverage.md`，状态 `READONLY_WIRING_GAP_CONFIRMED_OVERLAY_NOT_IMPLEMENTED`。不 wholecopy v069 Repository，不修改安装文件、服务、任务、生产DB或真实抓取。

## 准确基底与实际问题

安装磁盘基底：`C:/ProgramData/PublicOpinion/overseas-daily/releases/overseas-daily-release-handoff-1791605997752`。静态安装文件身份不等于进程 loaded 证据。

| 文件 | 已核 SHA256 | 具体问题 |
|---|---|---|
| `worker/src/overseasProductionDaily.js` | `40e535dfc34c3b8234f45e4309b851964fb0f648bfaca792758112848ddb6010` | :267 pinned query 对内容 SELECT 无条件追加 FOR UPDATE；新 page 查询自带 suffix 时会重复；:283 借 facade 进入原 page，:284 jobs 与 :287–300 receipt 同外层事务 |
| `server/src/db/repository.js` | `8cd119987d3b9aec4ee28b3e3f3a92253254388ea073d44363151614e6cb0d26` | :1653–1728 有 board/source/祖先字段和兼容逻辑，通用 v069 不包含，禁止整段覆盖 |
| `worker/src/overseasBigPlayerPageJobs.js` | `14f304a83bd486a95174540b02ad86a57dca7e3007e296528b56ca2c78f69dc5` | :26 分析与 :38 翻译遇旧 fp active 均抛 OVERSEAS_QUEUE_ACTIVE_VERSION_CONFLICT，整页正文/intent 一起回滚 |
| `worker/src/overseasBigPlayerPageStore.js` | `501c626a45e646ccaa0e2ba49da6dfa20f47c719aea1777b797500c9e5668efd` | daily 只用 stripBoardInsert，先保持原件，不无关改入口 |

之前消息中 `server/src/services/overseasProductionPageJobs.js` 不存在，已纠正；必须使用上述 worker helper。

## 派员工执行

| 子任务 | 交付目录（仓库根） | 当前状态 |
|---|---|---|
| 基海外安装版最小融合、受控分析延期、manifest/依赖/schema及开发方法验证 | `.temp/risk-normalization-20261010/employee-overseas-intent-implementation/` | 已派，进行中 |
| 两种 board schema 的 actual commitPage fresh合成 SQL与故障对抗 | `.temp/risk-normalization-20261010/employee-overseas-intent-sql/` | 已派，稳定源码后执行 |
| 具体差异/事务/scope与翻译边界只读审查 | `.temp/risk-normalization-20261010/employee-intent-review/` | 已派 |
| 主代理串行整合、逐文件冻结、交独立QA | 新正式索引待生成 | 未完成 |
| v069独立非历史intent/repair QA | 独立测试负责人 | 正在执行，与海外overlay分开 |
| 海外/共享生产切换、DDL、定时真实采集 | 经理控制门禁 | HOLD，未执行 |

上表是开发派工记录，经理唯一正式待办不由本文件代写。

## 必须保留的合同

仅在同外层真实页事务已捕获**精确匹配当前内容/profile/version/scope 的持久分析 intent**后允许普通分析延期；保留旧 F1 owner/lease，不删除守卫或把scope外、历史、force、缺意图当成功。默认禁用、最多10条；证据 ID 只作引用，不能当真实批准/writer drain。原 board/site/window/祖先、TLS、receipt及COMMIT_UNKNOWN处理不放宽。

翻译旧 F1 active 分支继续拒绝并整体回滚，必须实际测出该边界、明确未解决，不以分析 intent 假称翻译恢复。如果必须支持翻译延期，需要另审持久翻译意图与其consumer完整事务fence；当前不能只删翻译保护或改现役ACL。

隔离SQL使用自己的 fresh datadir、loopback、合成最小权限fixture，无生产配置/真实HTTP/AI；经理“SQL QA”和“不启动真实DB”的口径按允许隔离合成MariaDB、禁止生产数据库解释。若明确禁止隔离实例则保留脚本等待，不冒称通过。每轮核真实实例身份再shutdown/释放端口，保留失败原件。

验证 actual fused Repository + daily.commitPage + PageJobs：modern与legacy strip、锁suffix一次、同conn唯一外层提交、正文/intent/任务/关联/receipt失败完整回滚；精确scope/board/window/祖先与历史保护；F2/F3 ACK、租约冲突、同页有界锁重试不重HTTP。旧v069开发30PASS、独立QA和之前三站生产记录均不自动覆盖此新锁图。

## 实现期间合同补充

同一F2重复观察时意图仍应保留原previous=F1，不以本次观察前态F2误判。旧F1活跃且同owner续租会使捕获expectedJob的lease_until/updated_at过期；只允许这两项刷新，其他完整job身份必须一致，刷新前后在同页外层事务审计，不抢owner、不ACK分析。为了不占用v069 unique(intent,generation)成功ACK审计，新增隔离 `po_overseas_current_intent_proof_audit` 第四张additive表，属于明确新增schema影响；主代理在已有隔离实现授权内核收，未执行生产DDL。审计不存正文/凭据，失败须整页回滚；schema与回退保留策略要在候选manifest/README逐项列出。经理已收到此影响说明。

v069独立24项已正式收件 PASS_INDEPENDENT_ISOLATED_PARTIAL_SCOPE；海外overlay仍在实现/SQL阶段，不能沿用其结果。

## 开发最终收件

海外完整 v072 已冻结，manifest SHA `da01a9d8779ac8f3d9999a977c295cd6a976d55e40c1083286fa040768121c19`。实际安装404文件逐SHA基底+3改/5增=409文件；2schema共4表，仅root.temp。开发actual页事务17项+retry/ACK补验2项=19部分范围PASS，完整原件与模拟ACK边界在 `v073_overseas_current_intent_development_handoff.md`。只读审查通过受影响代码范围，已交独立QA执行；不沿用v069或旧三站PASS。实现/SQL/主代理冻结完成，独立QA进行中；生产仍HOLD。

最终独立QA收件：v060海外独立16/16直接受影响场景PASS，PASS_INDEPENDENT_ISOLATED_OVERSEAS_PARTIAL_SCOPE。以v073最终收件及`.tests/2026-10/2026-10-10/v060_overseas_intent_independent_qa.md`为当前状态；候选收口、不加测试，生产和翻译/no consumer未完成项保留。
