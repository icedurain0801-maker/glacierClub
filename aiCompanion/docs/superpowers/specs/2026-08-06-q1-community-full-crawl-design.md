# Q1 社区目标板块全量抓取设计

- 日期: 2026-08-06
- 状态: 设计已通过分节评审，待用户复核文档
- 范围: aiCompanion 社区同步，单个 Q1 目标板块

## 1. 背景与问题

图 1 的 Q1 社区后台显示目标板块 `Last Light` 约 1614 条帖子；图 2 的同步运行记录显示本次发现页面 78、变更页面 78、新写入 159。当前数字不能直接比较：

- `pages_found` 是本次运行接受的页面数，不是社区总量。
- 后台已抓取页面前端固定请求 `limit=100`，页面列表不是全量展示。
- 一个帖子可能拆成多个知识库条目，因此 `entries_written` 不是帖子数。
- 已经存在的 URL 当前会被 `knownPageUrls` 跳过，不会计入本次新增统计。

同时，Q1 爬虫存在全量风险：

- `user/context` 返回的 boards，未固定目标板块。
- 列表接口每页固定发送 `offsetId=0`、`dataLength=0`、`resetData=true`，未使用返回的分页游标或总数。
- 只读取 `payload.data` 数组，不解析 `total`、`hasMore`、`nextOffsetId` 等元数据。
- 通过 `posts.length < pageSize` 判断结束，无法证明已覆盖全部帖子。
- 现有帖子被直接跳过，无法发现正文或评论变更。
- 现有 `community_sync_pages` 没有 `board_id`，无法可靠区分同一版本下不同板块的页面，也无法按目标板块统计入库数。

## 2. 已确认的关键决策

| 决策点 | 选择 |
|---|---|
| 全量范围 | 只抓目标板块，例如图 1 的 `Last Light`，与社区后台总数直接对账 |
| 板块定位 | 固定 `boardId`，不依赖名称匹配 |
| 抓取模式 | 增量补齐，保留现有数据，补缺失并更新变化，不清空重抓 |
| 完成判定 | 优先使用接口返回的 `total/totalCount`，发现数和入库数与之对账 |
| 删除策略 | 本次未出现的旧帖子保留，不自动从本地知识库删除 |
| 并发策略 | 首版保持串行详情/评论请求，优先稳定和可追踪 |

## 3. 方案选择

采用“固定 `boardId` + 正确分页 + 接口总数对账”，并吸收游标异常检测能力。

### 方案 A（采用）

- 固定目标板块。
- 解析总数、下一页游标和 `hasMore`。
- 后续请求使用真实游标，第一页和后续页区分 `resetData`。
- 统计去重帖子 ID、已入库页面、缺失数。
- 对账失败时标记 `incomplete` 或 `inconsistent`，不静默标记成功。

### 方案 B（不采用）：按 ID 范围扫描

帖子 ID 可能不连续，删除帖、其它板块帖和权限帖会产生大量无效请求，且无法准确得到目标板块总数，容易触发限流。

### 方案 C（部分吸收）：分页后补扫缺口

在方案 A 基础上，检测到总数与发现数不一致时记录异常并支持重试/补扫。首版先完成可靠分页和明确失败状态，再根据真实接口响应增加特定补扫策略。

## 4. 设计

### 4.1 固定板块配置

新增配置字段:

```text
COMMUNITY_SYNC_Q1_BOARD_ID
```

管理后台增加“目标板块 ID”配置项。运行时流程:

1. 认证并调用 `user/context`。
2. 读取并校验配置的 `boardId` 是否在当前账号可见板块中。
3. 不可见或不存在时直接失败，提示权限或配置错误。
4. 只请求该 `boardId` 的帖子列表，不遍历其它板块。
5. 保存最终 `boardId`、板块名称和接口目标总数，供运行记录和对账使用。

数据库迁移要求:

- `community_sync_settings` 增加目标 `board_id` 配置字段。
- `community_sync_runs` 增加 `board_id`、`board_name`、`target_total`、`discovered_unique`、`stored_count`、`missing_count`、`pagination_pages`、`verification_status` 和异常详情字段。
- `community_sync_pages` 增加 `board_id`，已有历史记录按其原始抓取配置回填；无法确认板块的历史记录不得计入目标板块全量对账。
- 对 `community_sync_pages` 建立 `(version_id, board_id, url_hash)` 相关索引，保留现有唯一约束兼容历史数据。

### 4.2 分页响应解析

新增统一解析函数，输出:

```js
{
  posts,
  total,
  nextOffsetId,
  hasMore
}
```

兼容实际响应中可能出现的字段:

- 总数: `total` / `totalCount` / `count`
- 游标: `nextOffsetId` / `offsetId`
- 是否继续: `hasMore` / `hasNext`

实际接口响应字段以真实抓包结果为准，不凭猜测写死。

请求策略:

- 第 1 页: `pageIndex=1`、`offsetId=0`、`resetData=true`。
- 后续页: `pageIndex += 1`，`offsetId` 使用上一页返回的游标，`dataLength` 使用累计发现数量，`resetData=false`。
- 每页记录帖子 ID，并用 Set 去重。

停止条件:

1. 发现数达到接口 `total`。
2. 接口明确返回 `hasMore=false`。
3. 返回空页。
4. 下一页游标缺失或与上一页相同。
5. 连续两页没有新增帖子 ID。
6. 达到调试用 `maxPages` 上限。

### 4.3 全量对账

抓取后计算:

```text
targetTotal       = 接口返回的目标总数
discoveredUnique   = 所有分页去重后的帖子 ID 数
storedTargetBoard  = 数据库中目标 boardId 已抓取页面数
missing            = targetTotal - storedTargetBoard
```

运行状态:

- `complete`: `targetTotal === discoveredUnique` 且 `missing === 0`。
- `incomplete`: `targetTotal > discoveredUnique` 或达到上限后未完成。
- `inconsistent`: `discoveredUnique > targetTotal` 或其它数量矛盾。
- `unverified`: 接口没有可靠总数，只能耗尽分页。

接口总数为 1614 时，验收目标是:

```text
接口总数 = 1614
发现唯一帖子 ID = 1614
目标板块已入库页面 = 1614
缺失 = 0
对账状态 = complete
```

### 4.4 增量更新

现有“已知 URL 直接跳过”逻辑改为内容校验:

1. 列表页收集所有帖子 ID。
2. 为每个帖子生成标准详情 URL。
3. 已存在帖子仍请求详情和评论。
4. 计算详情内容哈希。
5. 哈希不变: 标记 `unchanged`，不重新写知识条目。
6. 哈希变化: 更新页面和对应知识条目，标记 `updated`。
7. URL 不存在: 新建页面和知识条目，标记 `new`。
8. 本次列表未出现的旧页面保留，不自动删除。

### 4.5 运行记录与后台展示

配置区新增:

- 目标板块 `boardId`。
- 目标板块名称只读回填。
- 全量校验模式开关，默认开启。

运行记录新增或补充展示:

- 目标板块 ID/名称。
- 接口目标总数。
- 分页数。
- 发现去重数。
- 新增数、更新数、未变化数。
- 已入库数、缺失数。
- 对账状态。
- 分页异常信息。

“最多抓取页面数”在全量模式下:

- `0` 表示按接口总数抓完。
- 大于 `0` 只用于调试或分批运行。
- 达到上限但未达到总数时必须标记 `incomplete`。

后台“已抓取页面”列表需要支持分页或明确显示当前展示数量，不能让固定 `limit=100` 被误认为全量结果。

## 5. 错误处理

- `boardId` 不在可见 boards 中: 运行失败，提示权限或配置问题。
- Token 认证失败: 保留现有认证错误处理，不开始抓取。
- 接口返回重复页: 记录页码、游标和重复 ID，按重复页停止规则结束并标记 `incomplete`。
- 接口无 total: 标记 `unverified`，不能显示 `complete`。
- 请求单个详情失败: 记录该帖子失败原因，继续其它帖子；最终对账仍显示缺失/失败数。
- 内容低于最小长度: 保留页面状态和忽略原因，计入未入库/缺失统计，不静默丢弃。
- 运行中断: 保留已完成的页面和进度，下一次增量运行继续补齐。

## 6. 测试计划

新增或扩展测试覆盖:

1. 固定 `boardId` 后只请求目标板块。
2. `user/context` 缺少目标板块时明确失败。
3. 正确解析 `total`、下一页游标和 `hasMore`。
4. 第一页 `resetData=true`，后续页 `resetData=false`。
5. 后续页传递上一页的 `offsetId` 和累计 `dataLength`。
6. 重复页/重复游标不会死循环。
7. 达到 total 后停止。
8. total 与发现数不一致时标记 `incomplete`。
9. 发现数超过 total 时标记 `inconsistent`。
10. 已有帖子内容不变时 `unchanged`。
11. 已有帖子内容变化时 `updated`。
12. 新帖子标记 `new`。
13. 详情失败不会阻断其它帖子处理。
14. 后台显示目标总数、发现数、已入库数、缺失数和校验状态。

## 7. 验收标准

使用图 1 的目标板块验证:

- 配置正确的 `boardId`。
- 运行记录显示目标总数 1614（以接口实际返回为准）。
- 分页请求不会重复第一页，能够遍历到结束。
- 发现唯一帖子 ID 与目标总数一致。
- 数据库目标板块已入库页面数达到目标总数。
- 缺失数为 0。
- 对账状态为 `complete`。
- 第二次运行不重复创建知识条目，未变化帖子标记 `unchanged`。
- 修改一条帖子后再次运行，只更新该帖并显示 `updated`。
