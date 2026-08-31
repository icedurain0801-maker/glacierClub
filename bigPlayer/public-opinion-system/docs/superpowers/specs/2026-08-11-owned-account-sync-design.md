# 第一阶段自有账号内容与评论同步设计

- 日期：2026-08-11
- 状态：历史设计；其中独立回复 API、能力、任务和 checkpoint 已由 `2026-08-12/v006_comment_tree_unification_design.md` 取代
- 范围：大玩家 H5 完整同步 + 抖音官方 OpenAPI PoC
- 目标：为自有平台账号打通授权、帖子、评论、回复、断点续采和可审计的同步状态；其他平台先建立可扩展边界，不宣称已接入。

## 1. 背景与问题

当前系统将采集源、平台账号和凭据混在一起：`po_sources` 只有平台和任务配置，`po_credentials` 是 source 级单凭据；凭据虽然加密落库，但 Worker 没有读取、解密并传递给连接器，实际 H5 请求仍使用进程级环境变量。当前 H5 连接器通过 HTML BFS 将页面粗略存为 post，不能可靠识别帖子、评论、回复，也没有评论层级和可恢复分页游标。

本设计把采集源、平台账号、凭据、内容关系和同步 checkpoint 分层，并以平台官方/内部授权接口为生产数据契约。

## 2. 明确范围

### 首期生产能力

1. 大玩家 H5：通过社区内部只读 API，完成账号授权、帖子全量回溯、评论和回复分页同步、增量同步、断点恢复。
2. 抖音：实现官方 OpenAPI 适配层和真实权限 PoC，验证账号 OAuth、视频分页、评论/回复 scope、历史边界与限流；只有实际授权能力通过验证后才允许对应阶段生产同步。
3. 通用底座：账号级凭据、帖子/评论/回复关系、幂等、游标、任务状态、部分失败和审计信息。

### 首期不承诺

- 小红书、微博、B站、TapTap、贴吧的生产采集；
- 通过账号密码、Cookie、网页自动化绕过平台授权或反爬；
- 对没有平台/供应商完整性契约的平台宣称“全部帖子和评论”；
- 竞品或第三方账号采集。

这些平台后续只能在官方/合作方权限或持牌数据供应商明确提供字段、历史深度、评论覆盖和数据权利后接入。

## 3. 平台能力分级

| 平台 | 首期状态 | 数据通道 | 完整性声明 |
|---|---|---|---|
| 大玩家 H5 | 生产 | 社区内部只读分页 API | 可声明内部 API 返回范围内完整 |
| 抖音 | PoC | 官方 OAuth/OpenAPI | 仅声明授权 scope 返回范围，PoC 前不称全量 |
| 微博 | 待接入 | OAuth/商务数据合作 | 普通 API 不保证历史和全部评论 |
| 小红书 | 待接入 | 开放平台/商务或持牌供应商 | 不提供无依据的全量承诺 |
| B站 | 待接入 | 开放平台合作权限或持牌供应商 | 不使用未授权网页接口作为生产契约 |
| TapTap | 待接入 | 商务/合作数据接口 | 需确认社区内容导出权限 |
| 贴吧 | 待接入 | 百度合作或持牌供应商 | 论坛楼层/回复完整性需单独确认 |

网页自动化仅可作为经过法务和安全审批的低频核验工具；不实现 CAPTCHA 绕过、反检测或访问控制规避。

## 4. 数据模型

### 4.1 `po_sources`

继续作为同步任务与平台配置主体，保留游戏、平台、频率、生效窗口、启停和软删除。`config` 存平台连接参数的非敏感配置，例如 H5 内部 API 地址、端点版本、同步策略；不存明文 token、密码或 Cookie。

首期一个 source 绑定一个账号，但数据关系按 source-to-account 可扩展设计。

### 4.2 `po_accounts`

新增平台账号实体：

- `id`
- `source_id`
- `platform`
- `platform_account_id`：稳定平台账号标识，如 UID、sec_uid、UP 主 ID
- `account_name`
- `account_type`：`official` / `brand` / `creator`
- `profile_url`
- `enabled`
- `auth_status`
- `auth_expire_at`
- `last_full_sync_at`
- `last_incremental_sync_at`
- `metadata`：平台非敏感扩展字段
- `created_at` / `updated_at`

同一平台账号在同一游戏下需要有唯一约束，防止重复绑定。

### 4.3 `po_credentials`

凭据从 source 级迁移为 account 级：

- `id`
- `account_id`
- `credential_type`：首期 `api_token` / `oauth_access_refresh`；兼容字段 `cookie` / `password` 默认不开放
- `secret_ref`
- `secret_cipher`
- `status`
- `expire_at`
- `last_checked_at`
- `failure_reason`
- `updated_at`

服务端使用 `CREDENTIAL_ENC_KEY` 进行 AES-256-GCM 加密；解密值只存在单次请求/采集任务内存，不写日志、不回传前端。抖音 refresh token 仅服务端用于换取 access token。

### 4.4 `po_contents`

保留现有统一内容表，补充：

- `platform_author_id`
- `root_content_id`
- `parent_content_id`
- `platform_parent_id`
- `content_depth`
- `is_deleted`
- `raw_payload`
- `first_seen_at` / `last_seen_at`

关系规则：

- 帖子：`content_type=post`，`root_content_id` 和 `parent_content_id` 为空；
- 一级评论：`content_type=comment`，根和父均指向帖子；
- 回复：`content_type=comment`，根指向帖子，父指向被回复评论；
- 平台原始 ID 是幂等键和跨平台关联依据，系统内部 ID 仅用于数据库关系。

平台删除或隐藏内容保留本地记录并设置 `is_deleted=1`，不物理删除。

### 4.5 `po_sync_checkpoints`

按账号、同步阶段和根内容保存可恢复进度：

- `account_id`
- `sync_scope`：`posts` / `comments` / `replies`
- `root_platform_content_id`：帖子/评论阶段的根对象
- `cursor`
- `status`：`idle` / `running` / `paused` / `completed` / `failed` / `unsupported`
- `sync_mode`：`backfill` / `incremental`
- `last_item_at`
- `items_fetched`
- `error_code` / `error_message`
- `updated_at`

游标在每页成功落库后立即提交；重复执行依靠平台账号 + 原始 ID 幂等。

## 5. 连接器契约

连接器不再只提供一次性 `collect()`，而提供可分页、可恢复的阶段接口：

```text
healthCheck(account, credentialContext)
listPosts(account, cursor, limit, updatedSince)
listComments(account, post, cursor, limit, updatedSince)
listReplies(account, comment, cursor, limit, updatedSince)
```

统一分页返回：

```json
{
  "items": [],
  "nextCursor": "opaque-platform-cursor",
  "hasMore": true,
  "capability": "full|authorized_scope|unsupported"
}
```

### H5

由大玩家社区提供内部只读接口：

```text
GET /internal/opinion/posts
GET /internal/opinion/posts/:postId/comments
GET /internal/opinion/comments/:commentId/replies
```

接口必须支持账号标识、opaque cursor、limit、更新时间过滤，并返回 `hasMore`。服务端通过 source config 的白名单 API 地址访问，使用解密后的只读 API Token。现有 HTML BFS 不作为完整同步通道。

### 抖音 PoC

使用官方 OAuth/OpenAPI 适配器验证：

- 授权账号绑定与身份回读；
- 账号视频列表分页；
- 评论列表与回复接口是否获批；
- 历史回溯边界、分页游标和限流信息。

scope 不足时只记录 `unauthorized` 或 `unsupported`，不把空数组解释为“没有评论”。

## 6. Worker 状态机

### 帖子阶段

授权检查 → 分页拉帖子 → 每页幂等写入 → 保存帖子游标 → `hasMore=false` 后标记完成。

### 评论阶段

按新建/变更帖子创建评论任务 → 分页拉评论 → 写入关系 → 保存帖子评论游标 → 完成或部分失败。

### 回复阶段

按一级评论创建回复任务 → 分页拉回复 → 写入父子关系 → 保存评论回复游标 → 完成或 `unsupported`。

规则：

- 同一账号同一阶段同一时间只有一个运行任务；
- 429、5xx、超时采用指数退避，checkpoint 保留；
- 连续失败进入 `paused`，后台可继续；
- 单帖失败不阻断同账号其他帖子，但账号同步结果标记 `partial`；
- 只有阶段明确收到 `hasMore=false` 才能完成；
- 对外部平台只展示“授权范围内完成”，不展示无依据的“全量完成”。

## 7. 管理端设计

采集源抽屉保留公共字段：游戏、平台、名称、频率、启停、首次同步模式、生效时段。

H5 动态字段：内部 API 地址、账号/租户标识、只读 API Token、授权检测、帖子/评论/回复能力检测。

抖音动态字段：OAuth 授权按钮、授权账号昵称/UID/主页、scope、过期时间和能力检测；token 不回显。

其他平台：允许预留账号标识，但展示“平台权限待审核/连接器未接入”，不提供会造成误解的账密即采集流程。

源列表展示：授权状态、帖子/评论/回复同步状态、计数、历史起点、最近同步、checkpoint 错误；提供继续、暂停、重新全量同步操作。

内容页面展示帖子详情和评论树，支持帖子/评论/回复类型筛选、完整性标签、平台作者 ID（按权限脱敏）和删除/隐藏状态。

## 8. 安全、合规与错误处理

- API Token、OAuth token、Cookie、密码绝不明文落库或日志；首期生产 UI 只开放 API Token/OAuth。
- H5 API 地址沿用环境白名单；页面输入不能改变信任边界，内网/localhost 非白名单地址拒绝。
- 未授权、scope 不足、连接器未获批、平台不支持时 fail-closed。
- 错误日志只记录 source/account、平台、阶段、错误码、计数和重试信息，不记录敏感请求头或原始响应。
- 公共评论仍可能包含个人信息，需要目的限定、最小化、访问控制、保留期限、删除/匿名化策略。
- 任何网页自动化只能在法务和安全批准后低频核验，不实现绕过验证码、反检测或访问控制。

同步结果枚举：

- `completed_full`
- `completed_authorized_scope`
- `partial`
- `unsupported`
- `failed`
- `paused`

## 9. 验收标准

1. H5 source 使用自己账号的 API Token 完成授权检测，Worker 实际使用该 source/account 凭据，而非进程级 env 凭据。
2. H5 帖子、评论、回复都能分页写入，父子关系和平台原始 ID 正确。
3. 任意阶段中断后从 checkpoint 继续，不重复插入、不丢失已提交页。
4. 编辑内容更新原记录，删除/隐藏记录保留并标记状态。
5. H5 首次同步完成有真实计数和 `completed_full`，不依赖 HTML 遍历数量。
6. 抖音 PoC 权限不足时显示 `unauthorized`/`unsupported`，不伪造成功。
7. 其他平台不会因为填写账密而进入假采集。
8. 测试覆盖凭据接线、分页、断点、幂等、评论树、部分失败、权限边界和敏感信息不回显。

## 10. 明确不做

- 不将现有 HTML BFS 包装成“全量社区同步”；
- 不使用未授权网页接口作为外部平台生产数据契约；
- 不实现 CAPTCHA 绕过、反检测、代理轮换或访问控制规避；
- 不把平台未返回的评论/回复解释为不存在；
- 不在首期接入竞品/第三方账号；
- 不为尚未获批的平台连接器开放启用按钮。
