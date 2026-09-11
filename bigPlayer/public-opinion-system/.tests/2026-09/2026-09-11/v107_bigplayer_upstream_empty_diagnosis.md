# BigPlayer 上游非空只读取证报告

- 日期：2026-09-11
- 测试角色：测试负责人（只读取证）
- 目标 source：`5c21f78d-5f67-4467-963d-dcdeb5e26cab`
- 关联 run：`10268a17-feae-4d06-a091-abe636c73979`
- 取证范围：仅目标境内 BigPlayer 来源、已绑定默认账号、固定近 7 天窗口；未写入上游、未重试同步、未修改业务代码

## 对象与窗口映射

| 项目 | 只读核对结果 |
|------|--------------|
| community | 超能世界国服版（配置 `gameId=2131`、`gameVersion=2131-CN-ZS`、`lang=zh-CN`） |
| platform | `bigplayer_h5` |
| source | `5c21f78d-5f67-4467-963d-dcdeb5e26cab` |
| default account | `70c393cf-9600-11f1-b3d2-d85ed3ae61b0` |
| account subject | `legacy-source:5c21f78d-5f67-4467-963d-dcdeb5e26cab` |
| source/account 状态 | source 已配置；account `enabled`、`authorized`；取证结束后 source 保持 `disabled` |
| run 模式 | `manual` / `backfill` / `lookbackDays=7` |
| 固定窗口 | `[2026-09-04T13:22:10.696Z, 2026-09-11T13:22:10.696Z)` |

## 上游请求证据

以下请求均复用生产 source/account 的已授权凭据，只记录脱敏路径、必要查询参数、HTTP 状态和汇总数量；未记录 token、密文、Cookie 或完整 provider payload。

| 请求 | HTTP | 结果 |
|------|------|------|
| `GET /api/club/v1/auth/user/context` | 200 | 授权上下文可读 |
| `GET /api/club/v2/auth/board?id=2` | 200 | board schema 可读 |
| connector `discoverFeeds` | 200 | 发现 24 个 feed |
| `GET /api/club/v1/auth/post/model/merged-list?boardId=2&sectionId=0&pageSize=20&offsetId=0&pageIndex=1` | 200 | 返回 20 条；该页发布时间覆盖 `2026-09-02T07:14:42Z` 至 `2026-09-11T10:36:22Z` |
| `GET /api/club/v1/auth/post/list`（脱敏 feed 参数） | 200 | 多个 feed 非空，代表性返回 2、7 条 |
| `GET /api/club/v1/auth/post/activity/list`（脱敏 feed 参数） | 200 | 多个 feed 非空，代表性返回 20、20、20、2、9 条 |
| `GET /api/club/v1/auth/post/?postId=916457&source=0` | 200 | 详情可读，发布时间 `2026-09-09T15:56:31Z`，落在固定窗口内 |
| 同一详情接口，`postId=916976/916695/916699/916881` | 200 | 各详情均可读 |

## 固定窗口复核

直接以 run 的精确窗口调用 connector，仍取得窗口内内容：

- merged feed：18 条。
- info 类 feed：多个非空，代表性为 2、7 条。
- activity 类 feed：多个非空，代表性为 20、20、20、2、9 条。
- 详情请求与列表解析均成功，证明基础 HTTP、凭据加载和响应解析路径可以取得窗口内项目。

因此，“上游在 2026-09-08、2026-09-09 无数据”与本次只读取证不符；至少 `2026-09-09T15:56:31Z` 的帖子 `916457` 可从详情接口读取。由于本报告没有对 8 日、9 日做全量逐日计数，不把代表性样本外推为两日完整应入库数量。

## 与受控 run 的差异

受控 run 已正确持久化目标 source/account 和上述固定窗口，终态为 `completed_authorized_scope`，但 `fetched=0`、`stored=0`、`inserted=0`、`changed=0`、`comment_count=0`，且无 error code。生产内容只读复核仍为 3072 条，最新观察记录仍是 external id `916457`、`collected_at=2026-09-10 09:30:36`，本次 run 后未观察到新增或更新。

## 结论

**上游非空；受控 Worker run 零计数问题仍未定位，生产恢复继续 FAIL / NOT_ADMITTED。**

## 开发负责人复现与确认

- `Repository.listRunnableSyncRuns()` 返回扁平行：`id` 是 sync run ID，`source_id` 才是来源 ID。
- recovery 模式的 `runOnce()` 原先按 `sourceRecord` 优先读取 `id`，因此把 run ID 当成 source ID；目标 manual run 会在进入 `runSource()` 前被过滤掉。
- 现已将 recovery 过滤优先级改为 `sourceId/source_id`，并补充扁平 repository 行回归测试；该修复只影响 recovery 选择，不改变普通调度和来源持久配置。
- 定向验证：`node --test worker/test/workerUnifiedSchedulerSeam.test.js`，18/18 通过。

现有证据可排除：

- 上游真实空数据；
- source/account 未授权或凭据完全不可用；
- connector 基础 HTTP 与列表解析完全无数据。

待开发负责人排查：Worker 是否实际消费该 run、固定窗口是否完整透传到各 feed、connector 返回如何进入内容 upsert，以及 run 计数/终态是否与实际消费脱节。以上均为待确认方向，不是已确认根因。

## 安全收尾

- recovery Worker PID `28916` 已停止。
- 目标 source 已恢复 `disabled`，抓取频率仍为 3600 秒。
- API 既有 PID `55932` 未重启；未占用 3001。
- 未创建第二个 run、未删除数据、未执行 migration、未处理境外来源或 7 天前内容。
- 在原因明确且重新获得授权前，不再次启用来源或重试同步。
