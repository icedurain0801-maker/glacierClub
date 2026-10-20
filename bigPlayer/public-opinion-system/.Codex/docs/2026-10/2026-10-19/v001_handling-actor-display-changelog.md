# 处理状态展示处理人和处理时间

## 变更内容

- `po_content_handlings` 新增 `handled_by_name` 字段，保存执行处理操作的当前登录用户名称。
- 内容处理接口、列表查询、BaaS 元数据和本地覆盖读取链路统一返回处理人名称与 `handled_at`。
- 内容管理列表在“已处理”状态下显示处理人和北京时间处理时间；历史处理记录没有名称时显示“历史记录”。

## 验证

- `node --test server/test/handlingFastFeedback.test.js server/test/handlingStatusFilter.test.js` 通过（7 项）。
- 前端状态渲染隔离检查通过：已处理显示两行元数据，待处理不显示。
- `node --check` 已检查处理服务、BaaS 读取服务、应用入口和前端脚本。
- 已执行 `npm --workspace server run migrate -- 040_content_handling_actor.sql`，迁移成功。
- 浏览器已打开内容管理页面验证处理状态筛选控件和页面加载；当前免登录只读会话没有可用社区数据，无法在真实行上展示处理人文本。

## 兼容说明

历史记录的 `handled_by_name` 为空时，前端按“历史记录”兜底；不会改变既有处理状态、处理方式或备注。
