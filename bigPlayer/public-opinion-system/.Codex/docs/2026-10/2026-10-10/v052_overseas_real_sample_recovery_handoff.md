# 海外真实原件入库恢复与下游验收

Status: 真实认证上下文、原件入库、3 内容 AI/翻译已独立验收；实际定时未完成。

## 交付事实

- 继续使用 84 预算批次既有两份原件，不重新抓取统计、不覆盖原件。离线审计入口：`scripts/overseas-real-artifact-audit.js`。
- 60 个三站观察对应 20 个 externalId。修正统计为各站 20；旧执行脚本快照缺失，具体旧统计表达式待确认，撤回 Array.items 根因推断。
- 正式海外 session 默认社区 Token，使用 Bearer 请求真实授权上下文并校验板块；SDK 兑换仅显式 `overseasTokenKind=sdk`。保持来源、账号、站点 URL、板块校验及缓存隔离。
- 真实合同接受 `env=web`，保留原 URL 与哈希，不把线上 URL 改为测试的 `env=1`。
- 首次有限入库：9 个新增内容、11 个既有内容完整保留；60 个站点 feed membership、60 个 run_content 关联、3 个终态 partial 样本 Run。同事务落库，未暴露 queued 样本任务。
- 重放：新增内容、membership、run_content 均 0。11 个旧内容的正文、raw_payload、fingerprint 哈希全部不变。现有同版本 jobs 的成功、失败、退避和租约状态保持。
- 新建或更新版本任务使用生产已有的 `retryable` 状态、`next_retry_at=2099-01-01`、`OVERSEAS_BOUNDED_VERIFICATION_HOLD` 显式暂缓；不会自动放行 20 条。不能使用 CHECK 不允许的 held 状态。
- 样本 Run 使用既有合法 `manual` trigger、`partial` 终态，receipt 明确 operation=sample_import。三个站点均有后续页，且每站 18 enriched/2 fallback，本交付不代表完整回溯或全文完整。
- 前两次导入分别因 status CHECK 拒绝而完整回滚。mysql2 将 MariaDB errno=4025 映射成误导性 ER_INNODB_AUTOEXTEND_SIZE_OUT_OF_RANGE；依据 errno、sqlState、约束名定性，未修改库结构。

## 原件和实际收据

均位于仓库根 `.temp/`，原件 items 既有错误路径保留不动。

| 工件 | SHA256 |
|---|---|
| overseas-real-small-batch-fetch-84-raw.json | 06b1cd4a19f180ae8b906cbb7e88467b420c63376aae128249eba7b47ebab9d4 |
| bigPlayer/.temp/overseas-real-small-batch-items-1791599835385.json | b2f84e03b7c675b05843aa4bd8fe127730d58ca4ba7655c07ba7bb5aaba8acca |
| overseas-real-sample-import-1791602247059.json | 74ea03253954be84796995095509a96a831806a14f362dab29350971897752b1 |
| overseas-real-sample-import-1791602263429.json | b71ef8279b34fd1ff4e3f4c486d960e6b78c0aa8aad1d7103f87a3ce760c9790 |

样本 Run：94ade4d0-7e06-5748-a02c-99a917eb89a4、d439570f-787b-5a9f-a0bb-c30984367c53、56a73a2f-b067-5ac4-aa13-208f9051a91e。

## 精确下游验证口径

`scripts/overseas-verify-exact-ai.js --execute` 仅固定首导入收据选择 3 个新增、真实详情成功内容，精确认领各自 canonical light/zh-CN job。总计最多 6 HTTP、每内容最多 2、重试 0；不升级 deep、不执行全表 claim、不调用质量清理或通知。永久唯一执行 intent 防止重新跑同批预算。每次 HTTP 先记录 dispatch intent，结果保存本地哈希后再落库，COMMIT unknown 停止，不自动重发。费用无供应商单价，金额待确认；实际 usage 单独记账。

生产 AI job 租约用 NOW，与现役消费者保持一致；sync/source 租约用 UTC_TIMESTAMP。现场 session time_zone=SYSTEM，NOW 比 UTC 快 8 小时，二者不可混用。

## 定时链未完成的明确原因

现役 PublicOpinionWorker PID 19584 使用旧 v055-formal1 release，没有目标来源排除。它先全局 recoverExpiredRuns，再读取全部 runnable 叶子 Run；能领取海外 queued/过期 running 并改 epoch。新进程私有 GET_LOCK 无法约束它。SourceRouter 正式 scheduled 分支仍明确 implementation incomplete；隔离 factory、fixture_success_cursors 与 stage schema 测试不能视作生产消费者。

必须先完成目标来源在现役消费者全部入口的排除，再接海外独立持久调度。当前不改、不停、不重启国内 Worker；不做 DDL、migration、新库、删除、push 或发版。

## 测试请求

测试负责人独立运行纯离线原件审计、只读业务库核对 exact 20 IDs / 3 runs / 60 memberships / jobs；复核冻结源码与有意义测试。不要再次执行任何采集、入库或 AI 脚本。业务库只读脚本为 `scripts/overseas-sample-inventory.js`。整体状态 FULL_CHAIN_NOT_VERIFIED。

## 2026-10-10 最新收口（优先于上文测试请求）

独立 QA v045 已通过样本入库和无重复；v046 已通过 3 内容轻分析、3 翻译真实接口与持久结果，6 HTTP200、0 重试、6 jobs completed。实际 usage 为 input2819/output1375/total4194，费用金额待确认。余 6 新内容的 12 jobs 仍 HOLD，未扩大放行。三配置正式 context 均 200，只证明 token/board 上下文，不把它代称三语言 feed 已分别验收。

用户最新要求接口与功能通过即可：本阶段已收口，不再补 hash/矩阵或重复抓取、付费 AI。定时仅验最短真实触发→采集→入库→下游结果及实际消费者冲突。

新增定时断点：Windows `BigPlayer Last Night Overseas Daily 02` 指向的 `worker/last-night-overseas-daily.cmd` 不存在，最近执行返回 1；不能把任务 Ready 当成功。具体修复候选、共享切换影响与六社区交付见同目录 v054。
