# v107 采集源配置与启用开关修复

日期：2026-09-14

## 已完成

- BigPlayer 基础配置保存不再提交同步模式或历史起点；服务端在这两个字段省略时保留已有同步元数据。
- 启用开关从详情抽屉移到来源列表行；切换只调用 `PATCH /sources/:id` 并发送 `{ "enabled": boolean }`，不创建同步任务。
- 新建或接管 BigPlayer H5 来源默认启用；创建本身不请求采集或启动 Worker。
- Facebook 继续保留授权和能力检测的启用门禁，未改变其新建停用策略。

## 验证

- `node --test C:\Users\Administrator\AppData\Roaming\Code\User\project manage\bigPlayer\admin\PublicOpinion\assets\source-status.test.js`：13/13 通过。
- `node --test --test-concurrency=1 --test-name-pattern="configuration|BigPlayer 默认启用|接管未配置 legacy H5" server/test/app.routes.test.js`：4/4 通过。
- `node --check`（`sources.js`、`app.js`、`repository.js`）和 `git diff --check` 通过。
