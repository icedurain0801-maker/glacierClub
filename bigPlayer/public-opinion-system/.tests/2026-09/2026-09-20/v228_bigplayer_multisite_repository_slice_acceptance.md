# v228 BigPlayer 多站点仓储优先切片验收

- 测试日期：2026-09-20（北京时间）
- 测试类型：隔离 schema/mock 与迁移文本合同
- 边界：未连接真实 DB，未执行 `027`，未部署、重启、补跑或发版；pause/cancel、TapTap、候选观测不在本单范围

## 回归结果

| 项目 | 结果 | 证据 |
|---|---|---|
| 单站基础手动同步锁与单 run | PASS | `startSourceSync locks ... exactly one queued manual run` |
| 多站配置 | PASS | `BigPlayer multi-site manual sync creates one parent and one queued child per enabled persisted site` |
| registry 不一致 | PASS | `BigPlayer multi-site manual sync fails closed when registry and saved siteUrls disagree`；不创建 run |
| checkpoint site 隔离 | PASS | `site-aware checkpoint identity keeps same task and window independent per BigPlayer site`；legacy 查询限定 `site_id IS NULL` |
| 仓储定向测试 | PASS | `node --test --test-name-pattern "BigPlayer multi-site manual sync\|site-aware checkpoint identity\|startSourceSync locks" server/test/repository.test.js`，4 passed / 0 failed |
| 027 迁移合同 | PASS | `node --test server/test/bigplayerMultisiteMigration.contract.test.js`，4 passed / 0 failed |
| 历史记录保护 | PASS（迁移文本合同） | 覆盖“新增 parent/site 审计字段而不删除历史行”、只回填 `site_id IS NULL` checkpoint、legacy `baseUrl` 保留 |
| 语法/空白 | PASS | `node --check server/src/db/repository.js`；`git diff --check -- ...` 通过；只有 LF/CRLF 提示，无检查失败 |

## 合同核对

1. 三站点持久化 registry 与保存的 `siteUrls` 一致时：创建 1 个父 manual run 和 3 个已排队子 run。
2. registry 和 `siteUrls` 不一致时：fail-closed，0 run。
3. checkpoint identity 包含 `site_id`，相同账号/任务/窗口的不同站点互不占用。
4. legacy 调用明确走 `site_id IS NULL`；迁移仅回填 null site identity，不重写历史 run/checkpoint 审计。

## 结论

多站点仓储优先切片 **PASS（隔离 schema/mock 与迁移文本合同）**。真实 DB 尚未应用 `027_bigplayer_multisite.sql`，因此不得将本结果标为真实库验收、部署通过或可补跑。
