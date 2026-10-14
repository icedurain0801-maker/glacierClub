---
last_updated: 2026-09-10
status: blocked_preflight
scope: p0-real-collection
---

# v047 P0 真实内容恢复前置核验

## 精确范围

- `regionCode=domestic`
- `communityId=00000000-0000-0000-0000-000000000101`
- `platform=bigplayer_h5`
- 业务日期：`2026-09-09`（北京时间半开区间 `[2026-09-09 00:00, 2026-09-10 00:00)`）
- source：`5c21f78d-5f67-4467-963d-dcdeb5e26cab`
- default account：`70c393cf-9600-11f1-b3d2-d85ed3ae61b0`

## 前置核验

| 检查项 | 结果 | 脱敏证据 |
|---|---|---|
| 精确来源唯一性 | PASS | 命中 1 个 `domestic / community 0101 / bigplayer_h5` 来源 |
| source enabled | PASS | `enabled=true` |
| game enabled | FAIL | `gameEnabled=false` |
| community enabled | PASS | `communityStatus=enabled` |
| default account | PASS | 唯一默认账号存在且 `enabled=true` |
| source/account authorization | PASS | 均为 `authorized`，未过期 |
| credential | PASS | `api_token`、`account_password` 均为 active、未过期且 secret 存在；未读取或输出 secret 值 |
| connector installation | PASS | installed/configured，posts/comments endpoint 均 configured |
| connector capability | PASS | posts=true，comments=true |
| 常驻 Worker | FAIL | 匹配进程数 0 |
| unified scheduler | FAIL | `UNIFIED_SOURCE_SCHEDULER_MODE=off` |
| legacy Windows task | FAIL | task Enabled/Ready，但 `Last Result=3` |

> 2026-09-10 复核更正：首次 Worker 进程匹配规则过窄，将常驻 Worker 误记为 0。放宽为相对/绝对入口兼容匹配后，确认当前项目存在 2 个 Worker 进程。后续证据以 v048 为准；该更正不改变当时 game disabled、scheduler off 与 API/DB 为 0 的结论。

稳定汇总原因码：`P0_COLLECTION_PREREQUISITES_FAILED`。

子原因码：

- `SOURCE_GAME_DISABLED`
- `WORKER_NOT_RUNNING`
- `UNIFIED_SCHEDULER_DISABLED`
- `LEGACY_TASK_LAST_RUN_FAILED`

## 当前零数据复现

本机数据库在该 source/community 与北京时间 2026-09-09 窗口内按 `content_type` 分组无记录。

验收域名精确 API：

- `contents?contentType=post`：total=0，returned=0。
- `contents?contentType=comment`：total=0，returned=0。
- `contents/stats`：post=0，comment=0，negative=0，attention=0。

页面与 API 使用同一范围：`publishedFrom=2026-09-09T00:00:00+08:00`，`publishedTo=2026-09-10T00:00:00+08:00`。

## 结论与最小修复建议

按派单门禁，“任一前置失败即停止真实采集”。本轮未绕过 game enabled、未启动 Worker/调度、未执行 crawler、未写入业务数据库。

最小恢复顺序：

1. 明确批准并仅启用精确来源所属游戏 `896b6b25-39ea-4979-bb87-8c1d7334fde7`；不得批量启用其他游戏/来源。
2. 不建议为一次 P0 验收直接启动全局统一调度；优先使用能够锁定该 source 与业务日期的单次手动运行入口。
3. 在单次运行前先修复或绕开 `Last Result=3` 的 legacy task 路径，但不得自动 Disable/Delete task。
4. 运行后核对 sync run 终态、posts/comments/total 入库数，再核对相同范围 API；若 2026-09-09 上游确无内容，再选择有真实内容的精确日期重验。

以上动作涉及配置写入和真实外部采集，本轮因硬前置失败未执行。
