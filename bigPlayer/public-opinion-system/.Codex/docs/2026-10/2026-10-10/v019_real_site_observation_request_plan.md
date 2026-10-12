# v019 真实站点侦察逐请求计划（设计稿）

Status: DESIGN_ONLY_MANAGER_REVIEW_REQUIRED_NO_GO
Date: 2026-10-10 (Asia/Shanghai)
Owner: 开发负责人

本稿响应 v018 的“最多 24 请求”细化要求。它只定义未来一次经批准的只读侦察，不执行 HTTP、token exchange、账号刷新、入库或消费者。侦察对象必须是各自 source/account/site/board 的真实绑定；历史 v104 的 source、board、registry、token 不能复制给另一源。三站不是硬编码需求，实际站点集合以临近执行时的自身配置和授权合同为准。

## 1. 固定边界与预算

- 全批最多 24 个 HTTP 请求，按每站 8 个、最多 3 个站点编排；单并发；每请求超时 10 秒；总墙钟上限 5 分钟；自动重试 0。
- 每个站点单独计数。某站缺少某类 feed、详情或评论时，记录 `unsupported`，不把未用额度转给其他站，也不为了凑满 8 次伪造 endpoint 或参数。
- 站点失败立即停止该站；redirect 预算固定为 0，任何响应重定向或非批准 origin 均立即停止；401、403、超时、响应结构不明、scope 漂移、token 状态未知均不得重放。若出现身份/预算/全局租约冲突，停止整批。
- `login/token` 属外部授权状态变化，必须作为独立授权动作计数；侦察不使用密码登录、浏览器登录、`authRefreshCoordinator` 或任何账号刷新路径。
- `discoverFeeds` 不直接调用：它会自动尝试 board v1 fallback。v2→v1 若未来确需验证，必须把 fallback 作为预先批准的单独请求替代当前 board slot，而不是预算外追加。
- 不调用 `enrichQ1FeedItems` 包装器；该包装器会按条目并发请求详情。详情只允许使用表中单个明确 `postId` 的 slot。
- 不调用完整采集、分页、评论树展开、历史补扫、run/worker、AI、翻译或通知。

## 2. 每站八个请求

下表中的 `{source, account, site, board}` 必须来自同一 source 的冻结绑定。`{gameId, gameVersion, languageId, env}` 只从该站完整 `siteUrl/baseUrl` 读取；业务 API URL 不自行拼接这些键。

| 序号 | method | endpoint | query 键 | 目的与成功条件 | 禁止的隐式行为 |
|---:|---|---|---|---|---|
| 1 | GET | `/api/club/v1/login/token` | `token`（日志 `[REDACTED]`）、`sdkToken=`、`gameId`、`gameVersion`、`languageId` | 以该站自身 account token 交换站点 token；仅保存脱敏状态/HTTP code/hash | 不刷新账号、不重试、不保存 token |
| 2 | GET | `/api/club/v1/auth/user/context` | 无业务 query | 确认该 token 能看到自身 board，且返回 board id 与冻结 `boardId` 一致 | 不自动选择其他 board |
| 3 | GET | `/api/club/v2/auth/board` | `id={boardId}` | 读取该站 board schema，提取明确存在的 feed descriptor（endpointKind/sectionId/type/feedKey） | 不自动 v1 fallback；v1 fallback 需替代本 slot并预先批准 |
| 4 | GET | `/api/club/v1/auth/post/list` | `boardId,sectionId,pageSize=1,offsetId=0,type` | 用第 3 步返回的 info descriptor 取单页样本；`type` 必须来自 descriptor | 不猜 type/orderType/isUltimate，不分页 |
| 5 | GET | `/api/club/v1/auth/post/activity/list` | `boardId,sectionId,pageSize=1,offsetId=0,type` | 用第 3 步返回的 activity descriptor 取单页样本；不存在则 `unsupported` | 不为缺失 feed 借用其他站 descriptor |
| 6 | GET | `/api/club/v1/auth/post/` | `postId={同站第4或5步样本 id},source=0` | 验证同站详情响应、id 与可用正文类型 | 不对列表多条 item enrichment |
| 7 | GET | `/api/club/v1/auth/comment/{postId}` | `offsetId=0,pageSize=1,postId={同站样本},sortType=0` | 验证顶层评论页字段、评论 scope 与 root content id | 不猜 `commentId`，不展开回复树 |
| 8 | GET | `/api/club/v1/auth/comment/{postId}` | `offsetId=0,pageSize=1,postId={同站样本},commentId={第7步同站顶层 comment id},sortType=0` | 仅在第 7 步返回可用顶层 comment id 时验证回复候选；否则记录 `unsupported` 并停止该 slot | 不跨站借 commentId，不切换 sortType，不自动重试 |

第 4、5 步使用的 `sectionId`、`type`、`feedKey` 必须来自第 3 步同站响应。若只返回一种 feed，另一 slot 不得改测 `merged-list` 来凑数。`merged-list`（`/api/club/v1/auth/post/model/merged-list`，query `boardId,sectionId,pageSize,offsetId,pageIndex`）本稿不测；如经理另需 merged 合同，应明确替换第 5 步或第 8 步并重新冻结预算。`pageSize=1` 是侦察取样上限，不是生产采集合同。

## 3. 24 个请求编号与全批停止

当冻结了三个站点 `S1/S2/S3` 时，实际编号为 `S1-01..S1-08`、`S2-01..S2-08`、`S3-01..S3-08`，总上限 24。每站按 1→8 串行，站点之间不得并发借用 token 或预算。若只冻结两个站点，预算是 16，不自动扩展到未知第三站。

失败分类及动作：

| 事件 | 动作 | 证据 |
|---|---|---|
| 401/403、token exchange reject、账号/board 不匹配 | 立即停止该站；若身份绑定或全局租约冲突，停止整批 | 脱敏 code、scope、站点伪名、请求序号 |
| timeout、network error、429、5xx | 不重试，停止该站 | code、elapsed、attempt=1 |
| redirect 非 `https://club-en.q1.com`、URL 含凭据/fragment | 停止该站 | safe URL 与原因 |
| JSON malformed、字段类型/必需 scope 不明、未知 provider code | 停止该站，状态 `UNKNOWN` | schema summary/hash，不存 raw secret |
| 第 3 步没有明确 feed 或第 7 步没有 comment id | 对应 slot `unsupported`，不换额度 | descriptor/字段类型摘要 |
| 同站返回另一 source/account/board/site 的内容 | scope drift，停止整批 | 绑定摘要、内容伪名/HMAC、响应 code |

## 4. 脱敏原件格式

每次请求记录一条 JSONL 元数据，不记录 authorization、token、cookie、完整正文、作者联系方式或 provider 原始响应。建议字段：

```json
{
  "batchId": "审批准入后生成",
  "siteAlias": "S1",
  "sourceIdHmac": "本次随机盐 HMAC",
  "accountIdHmac": "本次随机盐 HMAC",
  "siteId": "非秘密配置值",
  "boardId": "非秘密配置值",
  "requestNo": "S1-04",
  "method": "GET",
  "endpoint": "/api/club/v1/auth/post/list",
  "queryKeys": ["boardId", "sectionId", "pageSize", "offsetId", "type"],
  "queryValues": {"boardId": "...", "sectionId": "...", "pageSize": 1, "offsetId": 0, "type": 3},
  "attempt": 1,
  "httpStatus": 200,
  "providerCode": 0,
  "responseShape": {"data": "object", "items": "array"},
  "scopeResult": "accepted|unsupported|failed|UNKNOWN",
  "canonicalSummarySha256": "仅非敏感摘要",
  "startedAtUtc": "...",
  "elapsedMs": 0
}
```

`queryValues` 只可写入不含秘密且已批准的 scope/分页值；postId/commentId 使用本次随机盐 HMAC 或短伪名，不写可回溯原值。原始 provider body 如因 QA 必须保留，只能进入经理指定的受控 `.temp` 证据根，另行审批、加密/权限保护并在交接后清理；本 repo 不收录原件。

## 5. 侦察后的放行条件与未实现项

侦察成功只证明“该 source/account 在该时刻对这些有限 endpoint 返回了可解释合同”，不证明全量采集、历史边界、三站分流、生产 schema、持久恢复、AI/翻译或下一槽。成功后仍须经理单独收口：真实入库窗口、唯一 job 清单、provider 费用、通知策略、现役共享 Worker 排他和回退。

本稿未实现请求记录器、token 授权器、脱敏存储、生产 ACL、DDL、真实 HTTP 或任何服务入口；`login/token` 的外部状态影响和未知结果必须保持 HOLD，不能由本稿自动重放或撤销。

## 交叉复核与变更记录

本稿由开发负责人依据 `bigPlayerH5Connector.js` 的 `requestQ1`、`discoverFeeds`、`listFeedContents`、`listQ1Comments` 和 `overseasBigPlayerSiteSession.js` 只读核对，并经员工复核。执行器若显式完成第 1 步 token exchange，后续业务请求必须复用同一隔离 session 的内存站点 token，不能再次隐式交换；若直接让 `requestQ1` 首次完成 exchange，则审计仍只计一次授权请求。它纠正 v018 中“每站 login/context/board 共最多 12”的算术表达：本设计是每站 8、三站最多 24，且不把不存在的 feed 变成请求。Status 保持 `NO_GO`，待经理审阅。
