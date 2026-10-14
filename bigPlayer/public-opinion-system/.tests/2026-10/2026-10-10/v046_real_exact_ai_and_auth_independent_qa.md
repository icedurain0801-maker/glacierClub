# 三内容真实AI/翻译与正式session独立QA

- 日期：2026-10-10（Asia/Shanghai）；角色：测试总监。
- 结论：`BOUNDED_REAL_AI_TRANSLATION_PASS`；`FORMAL_SESSION_CONTEXT_RECEIPT_PASS`。仅本批3内容及正式上下文验证范围，`SCHEDULED_TAKEOVER_NOT_VERIFIED` / `FULL_CHAIN_NOT_VERIFIED`。
- QA执行本地原件审计、两次只读精确业务库snapshot及guard下离线负例；未执行任何provider HTTP/AI/导入/--execute，未修改业务代码或现役服务。

## 冻结与独立证据

下列.temp相对仓库根 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/`。

| 原件/产物 | SHA256 |
|---|---|
| 项目`.Codex/docs/2026-10/2026-10-10/v053_real_recovery_frozen_manifest.json` | `6f64e566460313792bba2c80ec62b299ea1f81f0c39ec6be9bd1f77f8b1d47b5` |
| `.temp/overseas-exact-ai-84-originals-20261010.json`（intent） | `ac1ebe3f470ccb65e11089c1ce6538c93eda932ba6a79e1b44a56668f2d25826` |
| `.temp/overseas-exact-ai-84-originals-20261010.result.json` | `1fc87d426a38a2731df8f050c6eba0246293aede43eb30bc54873a7bb4e666ac` |
| `.temp/overseas-formal-auth-readonly-1791602990594.json` | `bf9169b698dc8d73c31ea9b6fae73268485b3110ec30210e0744ddb02977078c` |
| `.temp/qa-v046-exact-ai-readonly-1791603058826.json`（初次精确只读核验） | `a17bd02c50e2cfcd2b9312e6aaffc84ce3e63a76906f7102fd9b3c914ffe9264` |
| `.temp/qa-v046-exact-ai-readonly-1791603120190.json`（加入正式冻结/auth/翻译账本复核） | `6efeaa19133f1fb3d9db00ef92b1aad778ea64faa4731f3579af7cabbea3ea7c` |
| `.temp/qa-v046-bounded-ai-offline-tests-20261010.txt`（4/4） | `39525b25cf4203af4e606016b29294634f2bfbc04921d8c5dd3430c2a933ea34` |

独立reader `.tests/2026-10/2026-10-10/v046_exact_ai_readonly_qa.cjs` SHA `e12cc970b2094f9cd89317c47e4e9c87d41d4af8190d47fcc8351ec02ce15281`。第二次新增只读核验是收到v053正式交接后增加manifest/auth与translation budget字段，没有重复HTTP/AI。

17源码/测试文件和4原件均在独立只读核验前后逐项核hash通过。AI脚本SHA `7063a9bd6065879c7ee2e564eac9ee9b79543145555b7ca5adff67a152ff12af` 与intent/result implementation hash一致。本清单没有包括所有递归运行依赖，因此不是整个生产release的冻结验收。

## 实际结果与预算

| contentId | externalId | 轻分析tokens | 翻译tokens | 独立状态 |
|---|---|---|---|---|
| `135837d9-5f71-4cc4-9fc1-feaf27b5be04` | `1561575` | 737 | 1247 | 两job completed，字段/hash匹配 |
| `6c2c6768-c96f-43b6-8307-a85e9ac02b4f` | `1590103` | 726 | 343 | 两job completed，字段/hash匹配 |
| `73a3b356-ade5-4c54-b6a0-923a61082584` | `1590104` | 726 | 415 | 两job completed，字段/hash匹配 |

三内容均由已核首次导入收据选择的new/detail_enriched内容组成，精确source/account/game/community/fingerprint一致。结果原件记录6次HTTP RETURNED/200，每内容analysis/translation各一次，maxRetries=0，无deep或额外本批dispatch。QA不重复请求供应商。

26份progress revision编号连续、owner与selected/policy绑定一致、调用数单调不超过6；每个call index都在前置revision出现DISPATCH_INTENT，末revision与final result一致。6个analysis/translation本地结果文件的hash逐一核验；详细路径/hash列表保存在独立raw，不覆盖任何旧intent或结果。源码使用wx/fsync写intent、progress和单结果，并在原intent存在时拒绝重复执行。文件和源码支持这些持久化语义，未额外进行断电/崩溃实测；revision不是带前向hash链的防篡改账本。

## 数据库独立核验

使用固定单连接REPEATABLE READ / CONSISTENT SNAPSHOT / READ ONLY，仅SELECT精确3内容、6jobs、对应分析/翻译与本批余下jobs；记录SQL trace，结束ROLLBACK和关闭pool。

- 3内容及6jobs身份精确匹配：content、analysis job、analysis result、translation job、translation result的fingerprint都相同。
- 6jobs均completed、attempts=1、completed_at存在，owner/lease/error/next_retry_at全部清空。
- 分析版本sentiment-v1/light，翻译版本translation-v1/zh-CN，模型gpt-4.1-mini；每项input/output/total tokens与本地结果一致。
- 分析summary SHA与本地文件一致；翻译title/body SHA与本地文件一致，证明实际字段持久化，不只查job状态。未对所有译文进行人工语义质量评分。
- 本批余下6个新增内容的12jobs均retryable/HOLD/2099，owner/lease为空。未扩大为“其余17内容所有状态在AI前后完全不变”，也不宣称20内容均已分析。

## usage与金额边界

| 分项 | input | output | total |
|---|---|---|---|
| 3次轻分析 | 1761 | 428 | 2189 |
| 3次翻译 | 1058 | 947 | 2005 |
| 合计 | 2819 | 1375 | 4194 |

分析原件usageEstimated=false。独立SELECT当日light usage账为call_count3、1761/428/2189，恰与分析原件及持久结果一致。翻译call budget当日累计2629，属于全局累计，不能当本批3次或本批tokens；单条translation结果与持久行usage支持本批2005 tokens。未取得两账本执行前独立snapshot，不证明全局精确增量或全供应商账单对账。未提供单价，fee=null/金额待确认，tokens不是费用金额。

## 正式session上下文

auth原件hash及session源码hash与manifest一致；3次均为`/api/club/v1/auth/user/context` HTTP200，attempt3/sent3/blocked0、contentRequests0。源码实际调用正式session.tokenFor并验目标board，社区token默认Bearer、不二次login交换。

三次请求调用同一origin/path，上下文响应body hash相同；结论限定为三份站点配置下正式token/board上下文通过，不独立证明语言站点专属feed grant或新的内容抓取。站点registry状态原件为authorized/unknown/unknown，后两站不伪标已持久authorized。本轮QA没有重新发HTTP；源码负例与session6测试见v045。

## 并发安全、负例与剩余风险

领取只增加lease与attempts，保持retryable/2099/HOLD，不转running；现役消费者pending/retryable到期/running过期分支不能从该future hold状态认领。这是源码与原件路径支持的保护，未连续观测整个执行期间或制造实际崩溃。完成落库仍在owner、版本、租约、内容身份fence事务内；COMMIT unknown销毁连接、无rollback/release，main遇unknown不cleanup写库或重新dispatch。

guard下独立4/4通过：unknown commit销毁连接不rollback/release、错误source在任何job写入前拒绝、provider数组计数、预算越界在网络前阻断。与v045的9+10测试合计23项独立局部验证，不能据此覆盖未测试的全部失ACK/并发/崩溃矩阵。

现役release的全局recover和leaf领取竞争仍见v045；全局翻译消费者也不靠新source私有锁隔离，未来解除hold前仍须完整排他证据。不得用新GET_LOCK、isolated scheduled PASS或本批6job完成签定时接管。独立schedule持久化、全入口排除、恢复/排空/回退与实际slot未交付，全链继续未验收。

## 用户最新验收口径（优先于上文流程要求）

用户已弹窗拍板：真实接口与功能通过即可，已PASS不复跑，不以额外manifest/hash审计、隔离矩阵、极端故障或无关fixture覆盖作为交付门槛。本阶段3内容真实AI/翻译接口成功、结果已保存可读、6任务完成，独立功能验收通过；registry未知或额外清单不足不阻塞已可用功能。旧证据与边界说明保留，不继续补形式材料。

定时后续仅聚焦一次最短真实流程：实际触发、抓取/入库/下游可读结果及必要消费者冲突检查。只对实际接口/功能错误、数据串写/重复消费或国内影响退修；不要求上文列举的全部故障矩阵和形式证据。现役消费者竞争是实际功能风险，需要验证解决，但不重复付费AI或旧抓取，不凭模拟PASS宣称实际定时完成。
