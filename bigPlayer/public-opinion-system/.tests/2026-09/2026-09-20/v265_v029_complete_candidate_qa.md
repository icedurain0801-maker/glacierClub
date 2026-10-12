# v029 完整候选 QA 报告

- CandidateId：`v029-bigplayer-migration-api-20260920-1931`
- Manifest SHA：`B05DFA1084A881089EEB9AD155341CB96BECF5BE4C7DC08BE851818BED659256`
- 结论：**FAIL，候选永久无效，不得修复复用**

## 失败证据

1. 独立执行候选迁移契约测试：

```text
node --test .temp/candidates/v029-bigplayer-migration-api-20260920-1931/server-test/bigplayerMultisiteMigration.contract.test.js .temp/candidates/v029-bigplayer-migration-api-20260920-1931/server-test/migrate023Runner.test.js
```

结果 `0/2 PASS`。测试入口使用相对路径读取候选外部文件，分别报：

- `ENOENT ... .temp\\candidates\\migrations\\027_bigplayer_multisite.sql`
- `ENOENT ... v029...\\src\\db\\migrate.js`

候选目录实际文件位于 `v029...\\migrations` 和 `v029...\\api-runtime\\server\\src\\db\\migrate.js`，交付测试链不可执行。

2. Test bootstrap 类型不一致：候选 `server-test/app.routes.test.js` 创建 `po_sync_runs.parent_run_id VARCHAR(64)`；正式 migration `027_bigplayer_multisite.sql` 定义为 `CHAR(36)`。这不满足 FK 两端类型/字符集/collation 同构门禁。

## 结论

manifest 自身 SHA 与交付值匹配，且其内部 455 个条目校验无 mismatch，但完整候选验收已失败。不得生产迁移、API 切换或 sync；不得在本 CandidateId 上原地修复。需重新生成全新 CandidateId，并提供可执行的 canonical bootstrap/test 链。
