# v011 changelog

## 本次变更

- 知识库新增 `kb_entry_locales` 子表，用于按语种存储同一条知识条目的多语言文本。
- 导入流程在写入 `knowledge_entries` 后，会自动识别 Excel 行内的多语种字段并同步写入 `kb_entry_locales`。
- 知识库 `/kb/entries` 和 `/kb/search` 接口新增多语种聚合返回，支持按 `locale` 选择展示内容。
- 管理端知识库页面新增语种筛选与多语种分段展示，便于核对每条知识的本地化文本。
- 兼容旧数据：即使数据库尚未回填子表，也会从 `raw_json` 中兜底提取多语种字段用于展示。

## 验证

- 新增 `server/test/kbEntryLocales.test.js`，覆盖多语种字段提取、去重合并和按语种取文案逻辑。
