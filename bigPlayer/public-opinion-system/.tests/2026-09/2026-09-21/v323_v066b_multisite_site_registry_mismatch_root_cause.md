---
status: blocked
priority: P0
date: 2026-09-21
role: development
topic: v066b-bigplayer-multisite-site-registry-mismatch
evidence_mode: read-only
---

# v066b BigPlayer 站点 registry 不一致与 stale checkpoint 根因包

## 结论

**`BLOCKED`，真实 Run 继续冻结。**

本次只读快照于数据库 UTC `2026-09-21 15:16:35.209` 取得。目标 source 的声明站点为
`site-7586e54f3a0cb84f433d59cf6baa1d4d`，持久 registry 的同 URL 站点为
`legacy-7586e54f3a0cb84f433d59cf6baa1d4d`。两者 URL 一致但 site ID 不一致，属于
`MULTISITE_SITE_REGISTRY_MISMATCH` 的直接风险。

更早的硬门禁同样未满足：数据库已登记 `027_bigplayer_multisite.sql`、
`028_bigplayer_scheduled_site_runs.sql`，但未登记 `029_bigplayer_site_run_evidence.sql`，且
`po_sync_runs` 缺少 `site_url_snapshot`、`last_request_at`。v066b 的 scheduler readiness 在
027 已应用时要求 028 和 029；因此候选会在真实采集前以
`UNIFIED_SCHEDULER_SCHEMA_NOT_READY` 拒绝 admission。

本次没有创建 Run、写入/清理数据库、改动配置或服务、访问 `3001`、发布或 push。

同一只读复核还确认：目标 source 的 active Run 数为 `0`，active checkpoint lease 数为 `0`。
这只说明当前没有占用，不构成解冻授权；任何获批窗口开始前都必须重新读取。

## 冻结身份与范围

| 字段 | 只读值 |
|---|---|
| 候选 | `.temp/candidates/v066b-bigplayer-comment-window-integration-20260921/` |
| 候选 manifest SHA-256（已复算） | `F7FB68F221963F8DA4019CCC6D3C8A1CCDA1826A55D32F48AD559888BB23A810` |
| 回滚基线 | `v058f-risk-severity-formal-integration-20260921` |
| 基线 manifest SHA-256（已复算） | `1BB0CFFCF660124FA421C1615F024CFE2E9080C308F3B7260A14537AE525FE1E` |
| source | `5c21f78d-5f67-4467-963d-dcdeb5e26cab` |
| account | `70c393cf-9600-11f1-b3d2-d85ed3ae61b0` |
| community | `00000000-0000-0000-0000-000000000101` |
| game | `896b6b25-39ea-4979-bb87-8c1d7334fde7` |
| platform / source 状态 | `bigplayer_h5` / enabled / authorized |
| config `siteUrls` 数量 | `1` |
| 规范化 URL | `https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS&lang=zh-CN` |
| config site ID | `site-7586e54f3a0cb84f433d59cf6baa1d4d` |
| registry site ID | `legacy-7586e54f3a0cb84f433d59cf6baa1d4d` |

`config.siteUrls` 当前只有一个条目。因此 v066b 的多站点 admission 分支（仅当
`siteUrls.length > 1`）暂不会直接抛出该错误；它仍是后续扩展到多站点或由子 Run 使用
site identity 时的确定性阻断，不能用“当前单站”忽略。

## 各阶段权威来源

| 阶段 | 权威来源 | 原因与代码证据 |
|---|---|---|
| 保存时的期望站点集合 | `po_sources.config.siteUrls`，经 `normalizeSiteUrls()` 规范化 | 规范化 URL、显式 `siteId`、默认 `site-*` / legacy `legacy-*` 派生规则在 `server/src/services/bigplayerSiteConfig.js:31`、`:42`、`:53`；source 保存后以该集合对账。 |
| 可调度站点集合 | `po_source_sites` 中 `enabled=1` 的行，且必须与 config 的 `siteId + url` 精确匹配 | `enqueueManualSourceSync()` 在 `repository.js:1902-1917` 锁定读取 registry，并在缺行或 URL 不同抛 `MULTISITE_SITE_REGISTRY_MISMATCH`；不能从请求体临时派生 child identity。 |
| registry 写入/冲突规则 | `reconcileBigPlayerSourceSites()` | `repository.js:105-126` 按规范化 config 对账；同 URL 却不同 site ID 抛 `MULTISITE_SITE_ID_CONFLICT`，因此普通保存 API 不能静默把 legacy ID 改成 site ID。 |
| 已创建子 Run 的运行时站点 | `po_sync_runs.site_id + site_url_snapshot` | child Run 插入时把已验证 registry 的 site ID 和 URL snapshot 一并冻结，见 `repository.js:2010-2013`；migration 029 明确历史 registry URL 不能替代 immutable run-time evidence。 |
| checkpoint 去重与 lease | `po_sync_checkpoints` 的 `(account_id, site_id, task_kind, task_key, sync_scope, root_platform_content_id, window_start, window_end)` | migration 027 创建 site-aware 唯一键；claim/read 均将 `site_id` 作为 identity，见 `repository.js:1162-1176`。 |

迁移 027 用旧 `baseUrl` 生成 `legacy-<sha256前32位>`，并把旧 checkpoint 回填至 legacy
site，见 `migrations/027_bigplayer_multisite.sql:24-57`。这解释了同一 URL 具有 legacy ID 的来源；
仅凭当前两行无法证明哪一次配置保存引入了显式 `site-*`，该历史变更原因仍为**待确认**。

## 85 条 stale running checkpoint 只读分类

筛选条件为目标 source/account 且：

```sql
cp.status = 'running'
AND (cp.lease_until IS NULL OR cp.lease_until <= UTC_TIMESTAMP(3))
```

它们的 `lease_until` 均非空且已过期，不是 active lease。手动 admission 的阻断条件是
`status='running' AND (lease_until IS NULL OR lease_until>UTC_TIMESTAMP(3))`，见
`repository.js:1999-2000`；因此任何 `lease_until IS NULL` 的 running 行也必须视为阻断，不能只统计未来时间。

| site 分类 | task_kind | window 分类 | lease owner 时代（前缀） | lease 到期区间 | 条数 |
|---|---|---|---|---|---:|
| legacy `legacy-7586...` | `comments` | bounded | `17276-c3a2fa2c-345f-438b-80d0-5d4edfe241c2:*` | 超过 7 天 | 3 |
| legacy `legacy-7586...` | `q1_feed` | empty | `41836-67468ca5-f226-4901-98a9-6f16323a13a4:*` | 1 小时至 1 天 | 14 |
| `NULL` | `q1_feed` | bounded | `32020-02ec0e2a-dd26-4dfd-a713-4e0076a272fb:*` | 1 小时至 1 天 | 7 |
| `NULL` | `q1_feed` | bounded | `41836-67468ca5-f226-4901-98a9-6f16323a13a4:*` | 1 小时至 1 天 | 10 |
| `NULL` | `q1_feed` | empty | `41836-67468ca5-f226-4901-98a9-6f16323a13a4:*` | 1 小时至 1 天 | 51 |
| **合计** |  |  |  |  | **85** |

守恒：site `NULL` 为 `7+10+51=68`，legacy 为 `3+14=17`，`68+17=85`；
窗口分类仅有 bounded 与 empty：bounded 为 `3+7+10=20`，empty 为 `14+51=65`，`20+65=85`。

精确 lease owner 原值及数量：

| lease_owner | 条数 | earliest lease_until | latest lease_until |
|---|---:|---|---|
| `41836-67468ca5-f226-4901-98a9-6f16323a13a4:6a60ca6c-6add-48b1-a257-67acf92fabe4` | 65 | `2026-09-21 03:43:20` | `2026-09-21 06:35:04` |
| `41836-67468ca5-f226-4901-98a9-6f16323a13a4:ccbba495-908b-41e7-bce0-0f69ef834ef2` | 10 | `2026-09-21 06:43:46` | `2026-09-21 06:47:39` |
| `32020-02ec0e2a-dd26-4dfd-a713-4e0076a272fb:2936ab53-0468-4eda-b2b8-29cc886c97d1` | 7 | `2026-09-21 12:06:32` | `2026-09-21 12:09:00` |
| `17276-c3a2fa2c-345f-438b-80d0-5d4edfe241c2:6901728a-f167-4d05-95fa-501d1ac8e511` | 3 | `2026-09-14 15:07:41` | `2026-09-14 15:07:41` |

### 精确处置条件

1. 85 条均不可按“活跃任务”清理或中止；当前没有有效 lease。
2. 68 条 `site_id=NULL` 是 migration 027 保留的历史兼容身份，**不得**仅因 source 现有 config 改为 `site-*` 而重写。
3. 17 条 legacy 也不得直接重键。只有在注册表修复、029 已应用、并以 `id` 逐行确认无 site-aware 唯一键冲突及可追溯 run snapshot 后，才可由获批修复操作处理。
4. 修复前，任何新 Run admission 都必须再次只读确认 `active lease count=0`。过期 running 不可被当作 active；反之，出现任一 `lease_until IS NULL OR lease_until > UTC_TIMESTAMP(3)` 的 running 行即停止解冻。
5. 推荐的最小不可扩张动作是：先应用已审核的 029 schema，再让 config 引用既有 registry `legacy-*` 身份；不得先改 registry 主身份而使 17 条 legacy checkpoint 脱离既有 identity。85 条另走可审计的 checkpoint quarantine 审批，不重置 cursor、不自动重试、不删除历史行。

## 最小修复审阅稿（不得执行）

前置授权必须同时明确：029 migration 计划、source config/registry 对齐方案、85 条 quarantine 的身份清单、变更窗口、备份与回滚负责人。没有这四项，保持 `BLOCKED`。

### A. 只读 gate SQL

以下仅供获批窗口执行前复核，当前未执行：

```sql
-- 参数：:source_id, :account_id, :config_site_id, :registry_legacy_site_id, :url
SELECT s.id, s.platform, s.enabled, s.auth_status,
       JSON_LENGTH(JSON_EXTRACT(s.config, '$.siteUrls')) AS site_url_count,
       JSON_UNQUOTE(JSON_EXTRACT(s.config, '$.siteUrls[0].siteId')) AS config_site_id,
       JSON_UNQUOTE(JSON_EXTRACT(s.config, '$.siteUrls[0].url')) AS config_site_url
FROM po_sources s WHERE s.id=:source_id;

SELECT site_id, url, url_hash, enabled, auth_status
FROM po_source_sites WHERE source_id=:source_id ORDER BY site_id;

SELECT COUNT(*) AS active_checkpoint_count
FROM po_sync_checkpoints cp
WHERE cp.account_id=:account_id AND cp.status='running'
  AND (cp.lease_until IS NULL OR cp.lease_until > UTC_TIMESTAMP(3));

SELECT COUNT(*) AS active_run_count
FROM po_sync_runs
WHERE source_id=:source_id
  AND status IN ('queued','running','pausing','paused','cancelling','cancel_requested');

SELECT version FROM po_schema_migrations
WHERE version IN ('027_bigplayer_multisite.sql','028_bigplayer_scheduled_site_runs.sql',
                  '029_bigplayer_site_run_evidence.sql') ORDER BY version;
```

### B. forward SQL 轮廓（仅审阅，禁止执行）

建议由专用、带审计的 migration/repair 工具实现，而非手工拼接 SQL。最小方案保留已经被 migration 027、
17 条历史 checkpoint 和 registry 使用的 `legacy-*` 身份，只把 source config 的单站 `siteId` 对齐为该
`legacy-*`。不得先把 registry 改为 `site-*`；该替代方案需要同步迁移全部 run/checkpoint 引用并单独评审，
不属于本次最小修复。

```sql
-- 审阅稿，不得在当前窗口执行。
BEGIN;
SELECT id FROM po_sources WHERE id=:source_id FOR UPDATE;
SELECT site_id, url, url_hash FROM po_source_sites WHERE source_id=:source_id FOR UPDATE;
SELECT id FROM po_sync_runs
WHERE source_id=:source_id
  AND status IN ('queued','running','pausing','paused','cancelling','cancel_requested') FOR UPDATE;
SELECT id FROM po_sync_checkpoints
WHERE account_id=:account_id AND status='running'
  AND (lease_until IS NULL OR lease_until>UTC_TIMESTAMP(3)) FOR UPDATE;

-- 仅当上述两个 active 结果集均为空、registry URL/hash 唯一且 029 已登记时才可继续。
-- 实际工具必须先保存完整旧 config 作为 rollback 输入，再把 siteUrls[0].siteId
-- 从 :config_site_id 改为 :registry_legacy_site_id；其他 config 字段逐字节保持不变。
UPDATE po_sources
SET config=JSON_SET(config,'$.siteUrls[0].siteId',:registry_legacy_site_id),
    updated_at=UTC_TIMESTAMP(3)
WHERE id=:source_id
  AND JSON_UNQUOTE(JSON_EXTRACT(config,'$.siteUrls[0].siteId'))=:config_site_id
  AND JSON_UNQUOTE(JSON_EXTRACT(config,'$.siteUrls[0].url'))=:url
  AND EXISTS (
    SELECT 1 FROM po_source_sites ss
    WHERE ss.source_id=:source_id AND ss.site_id=:registry_legacy_site_id
      AND ss.url=:url AND ss.url_hash=SHA2(:url,256)
  );

-- 85 条先输出不可变 backup 清单；是否 quarantined 必须单独审批。
-- 不得执行 DELETE，不得清空 cursor，不得将 NULL site_id 批量改为 site-*。
COMMIT;
```

这段 SQL 只是审阅轮廓，正式操作应复用配置事务并校验 `affectedRows=1`。它不能独自通过代码门禁：
必须先由获批发布应用 `029_bigplayer_site_run_evidence.sql`，使
`site_url_snapshot` 与 `last_request_at` 存在。029 的回滚不是删除历史 run 数据；若 API/Worker 候选
失败，应回滚应用 release，保留已应用的 schema 与审计数据。

### C. checkpoint quarantine 与回滚约束（仅审阅）

若负责人另行批准处理 85 条，forward 必须先以 85 个 `cp.id`、旧 `status`、`lease_owner`、
`lease_until`、cursor、window 和 error 字段生成不可变备份。之后只能按 ID 更新为可诊断的失败/隔离状态，
不得批量 `reset` 或 `DELETE`。rollback 只能从该备份按 ID 恢复原字段；发生计数不守恒、唯一键冲突、出现
有效 lease 或 snapshot 不能证明站点时立即 `ROLLBACK`，不继续处理其余行。

## 解冻条件与只读验收

下列均满足后，才可由项目经理重新评估一次有界真实 Run；本文件不授权执行。

- `029_bigplayer_site_run_evidence.sql` 已获批并在 migration ledger 中存在，`po_sync_runs` 同时具有
  `site_id`、`site_url_snapshot`、`last_request_at`。
- config `siteUrls` 与 `po_source_sites` 对每个 enabled site 均满足相同 `site_id + normalized url + url_hash`。
- 目标 source/account 的 active Run 为 0，active checkpoint lease 为 0；85 条的处置审计总数仍为 85。
- 85 条 quarantine 若发生，按 site/window/owner 分类的前后映射可审计；`NULL` 历史 identity 未被误改为
  `site-*`，无 cursor 被清空或删除。
- 候选与基线 manifest hash 与本文件“冻结身份”一致，`READY.json` 仍为 `241/241 PASS`、无新增失败。
- 测试负责人按 `v322_v066b_bigplayer_real_run_acceptance_card.md` 确认只读浏览器入口与真实 Run 同源；
  `3001`、PID `32020`、发布/push 仍在范围外。

## 附录：服务与浏览器边界

当前没有获批的 v066b 正式 deployment target 或 service replacement 路径，因此这些值为
**BLOCKED，不能猜测或执行**。历史 `v046` 的
`C:\ProgramData\PublicOpinion\releases\v046-bigplayer-api-cutover-20260921-0200` 与 v066b 无等同性，
不得作为本候选目标。

仅在项目经理提供真实 Run 与同源只读代理后，可使用
`http://127.0.0.1:3000/admin/PublicOpinion/collection-runs.html` 做浏览器读取；网络仅允许 GET/HEAD。
`3001`、任何同步按钮、POST/PATCH/DELETE 和跨站跳转均是拒绝条件。

## 证据路径

- 候选实现：`.temp/candidates/v066b-bigplayer-comment-window-integration-20260921/server/src/db/repository.js`
- site config：`.temp/candidates/v066b-bigplayer-comment-window-integration-20260921/server/src/services/bigplayerSiteConfig.js`
- schema：`.temp/candidates/v066b-bigplayer-comment-window-integration-20260921/migrations/027_bigplayer_multisite.sql`、`028_bigplayer_scheduled_site_runs.sql`、`029_bigplayer_site_run_evidence.sql`
- 候选 QA：`.tests/2026-09/2026-09-21/v318_v066b_bigplayer_comment_window_qa.md`
- 真实 Run 验收卡：`.tests/2026-09/2026-09-21/v322_v066b_bigplayer_real_run_acceptance_card.md`
