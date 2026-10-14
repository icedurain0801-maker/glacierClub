# Last Night 精确启用候选（只读）

Status: DRAFT_NO_CONFIG_WRITE_NO_ACTIVATION_PENDING_SCOPE_DECISION

只读查询当前生产中境外 `bigplayer_h5` 来源、账号、站点、feed membership 和历史同步窗口，不读取正文或输出凭据。发现 Last Night 与 X-Clash 两个来源，本次用户目标为 Last Night，因此建议候选仅限定 Last Night。X-Clash 的 config boardId 为空，不加入推荐范围。

## 分析候选

| 字段 | 实际值 |
|---|---|
| source_id | `081a16d2-5545-4afd-9c65-e04777e4540b` |
| account_id | `75c8205f-37eb-4bdf-b6a4-f4f502e35658` |
| game_id | `00000000-0000-0000-0000-000000000002`（Last Night） |
| community_id | `00000000-0000-0000-0000-000000000102`（Last Light） |
| region_code | `overseas` |
| content_type | `post` |
| board_id（补充证据） | `100017` |

来源、账号、游戏、社区当前 enabled；来源和账号 auth_status 为 authorized。API token 元数据为 active、有加密值、expiry 为空，最近检查字段为 `2026-10-08 14:18:26`。这些是数据库状态，不证明当前远端登录有效。该账号当前有 1945 post、2471 comment，计数只描述已有库存，不代表本轮新增。

**分析 scope 只有六个字段，没有站点或窗口限制。**若未来允许这个 scope，可能覆盖同来源/账号的全部 post；不能称为“只启一个站点一天的分析”。评论未列入本次最小候选。

## 翻译候选

三站均 enabled，url_hash 与实际 URL 字节 SHA256 相同；表中仅保存来源 origin 与 URL SHA，不输出完整查询参数。域名均为 `https://club-en.q1.com/`。

| site_id | language_id | site_url_sha256 | 当前站点授权元数据 |
|---|---|---|---|
| `legacy-8483a64ab230417e63c5e30d77b0a6f0` | `2` | `8483a64ab230417e63c5e30d77b0a6f0884e559e907aacf96a23b5924708c509` | authorized |
| `site-3bb48be7f9a82185d6a045e9a5cbd3d7` | `16` | `3bb48be7f9a82185d6a045e9a5cbd3d74a50cecfd9833a246e96a4e989afab6c` | unknown |
| `site-f069f4495d534693dd87b2485053e7cd` | `9` | `f069f4495d534693dd87b2485053e7cd1eff86da3310a7c7bce54987dcd53baa` | unknown |

三个完整 feed 证据分别为：

```text
overseas:legacy-8483a64ab230417e63c5e30d77b0a6f0:100017:home:merged::0:::
overseas:site-3bb48be7f9a82185d6a045e9a5cbd3d7:100017:home:merged::0:::
overseas:site-f069f4495d534693dd87b2485053e7cd:100017:home:merged::0:::
```

每组有 21 条现有 feed membership，siteId/languageId/boardId/siteUrlSha256 四字段一致。旧 feed 缺 languageId 的记录不作为完整 allowlist 证据。

已有完成记录窗口为 `2026-10-08T16:00:00.000Z` 至 `2026-10-09T16:00:00.000Z`（半开区间，相当于北京时间 10 月 9 日 00:00 至 10 月 10 日 00:00）。对应三条 scheduled_site run 分别：

- language 2：`94399681-ebb8-4b56-b7a4-cc736a209c79`
- language 16：`daf2880d-aa22-4c57-b97a-d911b9e01e4c`
- language 9：`7a921b05-6c06-4aa1-9fbd-aeb1c9d47eb7`

这些窗口来自历史数据库字段，不是本次批准的新运行窗口；completed 状态没有经过本轮实际正文完整性验证，不能拿它签新版本真实调度恢复。

## 最小推荐

供经理向用户确认的最小翻译候选为 Last Night 固定来源/账号、`post`、board `100017`、language `2` 的 legacy 站点、上述完整 feed 与已有窗口。选择它的依据是当前站点元数据为 authorized，完整 feed/URL SHA/历史窗口可对应。两个 unknown 站点保留为候选，不扩大推荐。

这只是候选名单。两个生产 intent 开关保持 `enabled:false`，未改配置或触发任何任务。未来启用还需精确 scope/window 决策、旧入口再起控制、准入/排空/双 gate、Translation 回退或 stop-only，以及实际 main/loaded 证据；批量/版本/evidenceId 也要固定，不用库存记录自动推断。

完整只读证据：仓库根 `.temp/risk-normalization-20261010/current-v097-validation/overseas-scope-readonly.json`，SHA256 `0f177a212fc094c951ebe1515301871c69eae86f2ea7b3e8aeb310e68a791f39`；可复核候选 `.temp/risk-normalization-20261010/current-v097-validation/overseas-allowlist-candidates.json`。只读事务结束后回滚并关闭连接；没有真实网络请求或数据库写入。
