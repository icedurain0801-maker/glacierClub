# v013 changelog

## 本次变更

- 修复知识库导入因 `kb_entry_locales` 表缺失导致整批任务失败的问题。
- 已执行数据库迁移，补齐 `007_kb_entry_locales.sql`，当前库已存在 `kb_entry_locales`。
- 调整 `server/src/services/ingestWorker.js`：
  - 导入主流程新增多语种落库的降级保护。
  - 若运行环境尚未完成 locale 子表迁移，导入不会因为写 `kb_entry_locales` 失败而整批中断。
- 清理并重建了失败的导入任务，使用原上传文件重新入库。

## 现场处理结果

- 原失败任务：`job_id=73` / `document_id=73`
- 重建任务：`job_id=74` / `document_id=74`
- 最终状态：`done`
- 导入条数：`1377`

## 验证

- 执行 `npm run migrate`
- 验证 `kb_entry_locales` 表已存在
- 观察重建任务从 `processing` 持续推进至 `done`
- 相关回归测试：
  - `node server/test/kbEntryLocales.test.js`
  - `node server/test/liveTools.test.js`
