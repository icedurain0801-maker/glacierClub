# Facebook 配置只输入一次密码

Status: 已发布，2026-10-20。

- 按用户要求移除新增/编辑表单的确认密码输入框、前端重复比较和 `confirmPassword` 请求字段；脏状态检查与保存后的清空逻辑仅保留账号、密码。
- API 原已允许不传 `confirmPassword`，本次未修改或重启 API、Worker、登录服务，既有加密及权限保持原逻辑。
- 修改文件：`../admin/PublicOpinion/assets/facebook-browser.js`、`../admin/PublicOpinion/sources.html`；同步调整既有 `.tests/2026-10/2026-10-20/facebook-browser-ui.cjs`。
- 以现役 `release-20261020-weekly-report-paragraphs-r1` 为基线，仅合入表单脚本及其资源版本号，保留并行页面变更；前端切至 `release-20261020-facebook-single-password-r1`。
- 本地真实 Edge 与外网已发布资源各完成 12 项隔离浏览器检查：新增/编辑均无确认密码，单次密码可提交，保存后不回显，登录及关闭流程正常。业务 API 与 Facebook 页面均为模拟，未写真实来源或使用真实账密。
- JavaScript 语法、指定文件空白检查和前端 50 文件 SHA-256 清单验证通过。
- 回滚备份：`E:/CodexData/public-opinion/frontend3001/services/backups/PublicOpinionFrontend3001.before-facebook-single-password-20261020-r1.xml`，回滚前核对没有后续发版。
- 未提交或推送 Git，未发送站内信，未启用新来源。
