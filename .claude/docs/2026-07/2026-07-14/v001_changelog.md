# v001 变更文档 · AI 陪伴机器人子项目5（知识库内嵌图片提取与展示）

从上传的 xlsx 内嵌图片(drawing 锚点解析,非单元格URL文本)提取图片,精确关联到所在行,存本地磁盘(uploads/kb-images/),新增 kb_entry_images 表。RAG 检索(ragContext.retrieve)与 B 端条目预览(/api/kb/entries)追加 images 字段到返回结构(向后兼容追加)。C 端对话气泡下方渲染缩略图,点击全屏放大;B 端预览列表同步显示。新增迁移 006_kb_images.sql,新增服务 imageExtractor.js。集成测试 8/8,全量回归通过。
