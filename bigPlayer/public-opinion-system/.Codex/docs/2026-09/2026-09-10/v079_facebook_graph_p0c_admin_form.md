---
last_updated: 2026-09-10
status: implemented
scope: facebook-graph-p0-c
owner: 开发负责人
source_plan: .Codex/docs/2026-09/2026-09-10/v075_facebook_graph_page_source_delivery_plan.md
---

# v079 Facebook Graph P0-C 管理表单与安全换绑实施记录

## 实施结果

- Facebook 进入采集源可管理平台，仅允许境外 Last Night 社区创建；采用独立单列表单，不改变其他平台表单。
- 默认主页地址为 `https://www.facebook.com/LastLightSurvival`，地址保持可编辑，并在前后端统一规范化后比较；仅尾斜杠或跟踪参数差异不会误触发换绑。
- 创建时 Page Access Token 必填；编辑时不回显，留空保留原凭据。Token 不写入 URL、浏览器存储或非凭据字段。
- 新建、主页地址变化或显式换 Token 后均保持停用，并依次执行授权检测与四项能力检测；只有 `page/posts/comments/replies` 全部为 `authorized_scope` 才允许启用或同步。
- 主页地址变化时，同一事务内清除旧 Page 身份、授权、四项能力、checkpoint 与下次调度，终止 queued/running run 并递增调度栅栏；历史内容、分析、告警、审核及 Token 保留。
- 同址显式换 Token 时 fail-closed，清旧授权与四项能力并终止旧 run，但保留 Page ID 和 checkpoint，等待新 Token 重新检测。
- 旧 Worker 写入继续受 sync-run 状态、账号、来源、lease owner 与 lease 到期时间共同栅栏保护。
- 首次同步支持“全部历史”“指定日期”“仅从现在”，分别映射为固定 backfill 起点、北京时间零点起点和 incremental；下次采集时间只展示服务端返回值。
- 无管理权限时表单为只读；通过四项能力检测后，“开始同步”可调用现有同步端点自动启用来源，无需先单独启用。

## 文件

- `server/src/db/repository.js`
- `server/test/repository.test.js`
- `server/test/app.routes.test.js`
- `../admin/PublicOpinion/assets/scope.js`
- `../admin/PublicOpinion/assets/sources.js`
- `../admin/PublicOpinion/sources.html`
- `.tests/2026-09/2026-09-10/facebook-p0c-admin-form.test.js`

## 验证

```powershell
node --check server/src/db/repository.js
node --check server/src/app.js
node --check ../admin/PublicOpinion/assets/sources.js
node --test --test-concurrency=1 server/test/repository.test.js server/test/app.routes.test.js server/test/facebookGraphConnector.test.js server/test/facebookSecurity.contract.test.js
node --test ../admin/PublicOpinion/assets/source-status.test.js
node --test .tests/2026-09/2026-09-10/facebook-p0c-admin-form.test.js
```

- 服务端全量回归：320/320 PASS；P0-C 定向回归：164/164 PASS。
- 前端既有回归：12/12 PASS。
- P0-C 前端合同测试：8/8 PASS。
- 后端与前端独立只读复审均通过，无剩余阻断。
- 四个实现文件语法检查及定向空白/冲突标记检查：PASS。
- 未发起真实 Facebook 或 Konga 请求。

## 边界

- `configured_unverified` 长度为 21，现有 `auth_status VARCHAR(20)` 无法安全存储；本阶段沿用等价 fail-closed 状态 `unconfigured`，不引入 schema 迁移。
- 本阶段未 commit、未 push、未合并、未发版；P0-D 保持 `not_admitted`。
