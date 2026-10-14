# v010 checkpoint site identity 测试兼容

- 日期：2026-09-20
- 范围：仅修复 `site_id` 已加入 checkpoint identity 后的两处旧测试夹具与参数断言；未修改生产代码、真实数据库、迁移或服务。

## 变更

- 更新窗口 identity mock key，使 legacy checkpoint 的 `site_id=NULL` 作为稳定空槽位参与 identity。
- 更新 task kind/key 参数断言，明确 INSERT 的参数序列为 `account_id, site_id, task_kind, task_key`。

## 验证

- 两条 checkpoint identity 定向测试：2/2 通过。
- `node --test server/test/repository.test.js`：138/138 通过。
- `node --check server/src/db/repository.js` 与 `git diff --check`：通过。
