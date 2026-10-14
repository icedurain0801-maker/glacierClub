---
status: verified-in-isolation
scope: BigPlayer 手动同步仓储切片
---

# BigPlayer 多站点手动同步：父子 Run 与站点 Checkpoint

## 变更

- 对配置中有多个启用 `siteUrls` 的 BigPlayer 来源，`enqueueManualSourceSync` 在同一事务创建一条父 `manual` run 和每个已启用持久站点一条子 run。
- 子 run 写入父 run ID、`site_id`、来源/账号、同步模式和窗口；站点注册表与已保存配置不一致时 fail-closed，不创建任何 run。
- checkpoint 的查询、领取和重置 identity 加入 `site_id`；旧单站调用显式限定 `site_id IS NULL`，保持 legacy 语义。
- 代码仅依赖迁移 `027_bigplayer_multisite.sql` 已提供的结构；本次未对实际服务库运行迁移。

## 隔离证据

- 三站点 mock：`1` 条父 run + `3` 条子 run，子 run 依次带 `site-2`、`site-9`、`site-16`。
- 同一账号、任务和窗口的 checkpoint 会按 `site_id` 独立领取；旧调用检索 `site_id IS NULL`。
- 注册表少站点或 URL 不一致时返回 `MULTISITE_SITE_REGISTRY_MISMATCH` 并回滚。

## 验证

```text
node --test --test-name-pattern "BigPlayer multi-site manual sync|site-aware checkpoint identity|startSourceSync locks" server/test/repository.test.js
# 4/4 PASS

node --test server/test/bigplayerMultisiteMigration.contract.test.js
# 4/4 PASS

git diff --check -- server/src/db/repository.js server/test/repository.test.js
# PASS
```

## 未覆盖

- Worker 子 run 领取、按站点 URL 建立 connector 上下文、定时/补跑、前端进度均不在本切片范围。
- 当前实际服务数据库未执行 027，未重启服务、未创建真实 run、未补跑或发布。
