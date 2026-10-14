# v022 真实交付待决定清单

Status: READONLY_DECISION_GATE_FULL_RUNTIME_NO_GO
Date: 2026-10-10 (Asia/Shanghai)
Owner: 开发负责人

本清单承接 v018–v021 和 04:00 下一槽独立 QA。合成下一槽局部 PASS 只证明隔离账本/时钟/游标行为，不能替代真实三站、生产持久、AI 费用或现役加载证据。生产、国内、3306、受限 proof、旧夜巡继续保持 HOLD。

## 一、必须由经理收口的精确决策

| 编号 | 待决定项 | 必须提供的具体值/证据 | 当前状态 | 未收口前动作 |
|---|---|---|---|---|
| D1 | 每个 source 的自身身份 | sourceId、accountId、gameId、communityId、platform、授权状态、配置版本/hash | 待确认；不得沿用历史 v104 或 fixture | 只做配置只读核对；不登录、不刷新 |
| D2 | 每个 source 的站点合同 | 自身 siteId、完整 siteUrl、siteUrlHash、`env/gameId/gameVersion/languageId`、boardId、contractVersion | 待确认；三站不是硬编码 | 不执行 v019 请求；不借用第一源 board/凭据 |
| D3 | board/schema 兼容 | 是否只接受 board v2；若允许 v1 fallback，是否替代 24 请求中的明确 slot | 本单已按 fallback=0 设计 | 不调用 discoverFeeds，不发真实请求 |
| D4 | 真实侦察授权 | 每站≤8、全批≤24、单并发、10 秒/请求、5 分钟、0 retry；token exchange 外部状态影响是否批准 | 计划已写，真实授权未给 | 只保留设计和离线 guard |
| D5 | 精确分析清单 | manifestSha、每个 jobId/contentId/fingerprint、仅 light 或另批 deep、analysisVersion | 待确认 | 不启动 analysis consumer |
| D6 | 精确翻译清单 | jobId→contentId、targetLanguage、translationVersion、fingerprint | 待确认 | 不启动 translation consumer |
| D7 | 预算与费用 | 现役 global cap、海外 scope cap、provider/model/version、token cap、金额上限、UTC billing day、失败/重试计费 | 未实现、数值待确认 | 不能把 fixture cap 或默认重试当生产值 |
| D8 | 排他加载方案 | 是否允许共享 Worker 短暂停机；唯一 consumer owner、analysis/translation lease gate、停止/启动/首 scan/回退证据 | 未确认；不能新增第二 consumer | 不重启、不改现役、不创建旁路锁 |
| D9 | 通知与 deep 策略 | 本批是否永久禁止 deep、quality、alert、DingTalk；若开放，另发 manifest/scope/QA | 当前默认全部禁止 | 不实例化 AlertEngine/notifier |
| D10 | 生产持久与恢复 | schema/DDL、目录/ACL/fsync、备份恢复、真实 SQL drain、断电/重启证据 | 未交付 | 受限 proof 不重试，不用新目录替代 |

## 二、本窗口可安全完成的范围

- 审阅并修正 v019/v020/v021 文档和 QA 原件路径/hash。
- 对 v021 runnable 包做独立离线 QA；只运行冻结根目录命令，结论限 `ISOLATED_PASS`。
- 继续做纯内存的 manifest/job/预算负例审查，但不新增重复 mock 来扩大进度。
- 整理 D1–D10 的输入模板、脱敏字段和停止条件，供经理一次性收口。

## 三、当前必须停止的分支

- 真实三站 HTTP、token exchange、账号刷新、board/feeds/评论探针。
- 生产 SQL、DDL、迁移、ACL、目录恢复、3306 或共享 Worker 重启。
- 真实 provider、AI/翻译计费、通知、deep、backfill、第二 consumer。
- 用 9io1Ti 合成下一槽或 v021 开发自测证明真实交付；不得把 `realNextSlotExecutedSynthetic=true` 改写为 `realNextSlotExecuted=true`。

## 四、当前证据口径

9io1Ti 独立 QA 已报告 session exit0、UTC20:00 越槽、118 polls、六漂移零写、两站合成 8/8 认证 cursor、HTTP/AI=false；该结果只计局部隔离 PASS。v021 开发侧 6/6、worker 615/615 仅为开发验证，须等待 runnable 冻结包独立 QA，不能提前宣 PASS。

## 交叉复核与变更记录

本稿由开发负责人依据 v018–v021、v019/v020 待确认项和 04:00 QA 转交整理。未执行任何外部操作，未修改现役代码、生产配置或历史冻结包。
