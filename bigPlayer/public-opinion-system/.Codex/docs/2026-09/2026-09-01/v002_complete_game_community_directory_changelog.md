# 完整游戏与社区目录增量修复

日期：2026-09-01

新增 `020_complete_game_community_directory.sql`，补齐用户批准的国内 23 个、国外 21 个社区目录，并为游戏与社区保存外部目录编号 `external_id`。目录种子使用稳定 UUID，重复执行通过唯一键与更新语句保持幂等。

`externalId=2` 复用 011 已创建的社区 UUID `00000000-0000-0000-0000-000000000101`；019 已执行的 Last Night 社区 UUID `00000000-0000-0000-0000-000000000102` 不变，仅补充外部编号映射。目录状态同步写入 `po_communities.status`：externalId `8`、`11`、`14`、`100019` 为 `disabled`，其余（包括 `19`、`100017`）为 `enabled`。迁移末尾 fail-closed 断言要求最终 44 条目录社区的状态集合精确匹配。

目录数量验收以 `po_communities JOIN po_games` 后按 `po_games.region_code` 统计，预期 `domestic=23`、`overseas=21`、合计 44。由于 externalId `2` 和 `100017` 复用现有内部游戏，直接统计 `po_games` 得到 `domestic=22`、`overseas=20` 是预期结果，不作为目录缺失判据。

服务端 `GET /games` 与 `GET /communities` 新增 `externalId` 查询过滤，便于后台按外部目录编号定位；未修改前端、worker、真实社区连接或凭据配置。
