# 新响应验证与历史共享内容复用（离线方案）

Status: DESIGN / ISOLATED-VALIDATION-PENDING / production-NO_GO

## 不再混淆两种事实

历史raw缺scope不能证明历史站点；本次详情响应可证明当前run站点观察到某内容。两者必须分开保存。不能把本次site/URL反填旧raw并宣称历史归属，也不能因旧字段缺失永远禁止所有安全复用。

## 候选准入

1. 验证本次不可变run合同及source/account/game/community/board/siteURL/owner/epoch，详情请求和响应ID、内容类型、根/父ID/深度必须一致且来自受限transport；仅列表摘要或调用方自称verified不够。
2. 事务内锁现有source+externalId和fingerprint，行级source/account/game/community必须一致，所有已有board/站点冲突证据不能被忽略；不同ID同fp、跨scope或无法区分的跨站身份拒绝。
3. 完全相同内容可复用既有行ID，不新建重复历史行，不覆盖原raw。正文确有变更时需明确版本/AI翻译重排与原证据保留策略，不能先静默覆盖再补证明。
4. 当前站点观察由run_contents关联加外部不可变观察证据记录：绑定run/siteURL/board/请求响应哈希/内容ID/旧行快照哈希。本次站点观察不写成历史site归属。数据库关联和外部证据提交不具单一原子事务，必须设计intent/commit/reconcile协议；回执未知失败关闭。
5. 评论根/父链每节点均需要当前证据或已证明历史证据；不因根外部ID相同就假定回复跨站可混用。不完整图拒绝。

## 必须离线验证

旧raw不变+同ID同fp复用、当前观察记录；跨account/game/community拒绝；已有board冲突拒绝；详情ID/父链不符拒绝；同fp异ID拒绝；模糊跨站拒绝；外部观察证据丢失/篡改拒绝；DB提交回执未知不自动重试；变更正文队列版本保护。

## 当前最小缺口

当前PageStore历史验证回调只能补缺证，未实现基于新详情响应的受信证据加载/观察提交；现run表无JSON/board/siteURL快照，需外部不可变journal，不默认DDL。po_sync_run_contents仅run/content/change/scope关联，不能单独证明请求响应详情或历史URL。此方案尚未实现，不能凭本说明或旧合同缺证回调放行。

有限只读历史搜索和离线E2E继续；本阶段不发真实请求、不写库、不改现役、不删历史。
