# BigPlayer 新增来源切账密出现 source not found 修复

- Status：开发修复完成，独立 QA 待验；生产未部署。
- 本缺陷与 v060 风险规则分开冻结，不纳入其 PASS。

## 根因与证据

现役 `bindH5CredentialMode(source, creating)` 忽略 creating，切换授权方式时无条件调用 renderDetail。新增草稿未创建、没有 id，却被渲染为“保存配置/检测授权”管理页；检测路径随之成为 `/sources/undefined/check-auth` 或 check-capabilities，后端在账密校验前返回 404。实际 served 函数已离线复现；截图当时具体请求未捕获，不冒充现场抓包。

员工只读证据：仓库根 `.temp/source-not-found-20261010/employee-readonly/report.md`。本机、公开映射、磁盘与任务前工作树 JS 原始字节 SHA 一致：`e7a50696141b1455aa44fef4bd2d19cfe7cad29bd00cb2a9421657380976af88`。实际 GET/DB 的现有 sourceId 均为 string UUID，未发现类型差异。我要当老祖社区已启用但没有 BigPlayer 来源；境外 X-Clash 同名来源不能挪用。

## 修改与行为

业务修改仅 `bigPlayer/admin/PublicOpinion/assets/sources.js` 和 HTML 的资源版本 v209→v210：

- 新增授权方式切换通过原新增 render 回调重新渲染，始终保留创建按钮，无已有来源检测操作。编辑继续使用原 renderDetail。
- 名称、频率、版块、多站点（含空白待填行）、账号等输入保留。账号仅在当前表单内存暂存、关闭/换来源清理；密码/Token 不写临时 draft、URL、日志或浏览器持久存储。
- 无有效 id 的保存/授权/能力/登录检测在前端直接阻断，明确提示先创建。范围或当前来源已经切换时阻断旧动作。
- H5 有未保存输入时检测提示先保存，避免误以为正在验证新输入。已有来源 404 保留表单、显示中文过期提示，并阻断反复无效请求；保留原 error code/status，不误报成密码错误。
- 创建单次提交，校验返回的真实 id。缺 id 或网络结果不明时提示刷新列表确认，阻断直接重复 POST；不自动创建或重建。旧创建回包不能关闭同范围中新打开的草稿。
- 正常创建成功仍刷新列表，后续管理使用服务返回 id；不新增产品流程，不改后端来源、凭据、采集或风险逻辑。

任务前相关文件已另存仓库根 `.temp/source-not-found-20261010/before/`，有原有未提交改动的文件不以 git 全 diff 覆盖。本次范围用任务前基线差异核对。

## 验证

- `.tests/2026-10/2026-10-10/source-draft-lifecycle.test.cjs`：9/9，通过创建/编辑生命周期、缺 id、重复提交、旧回包、条件 DOM 账号往返、scope、404 输入保留；新增 201 无法解析也视为结果未知，不重复 POST。
- `bigPlayer/admin/PublicOpinion/assets/source-status.test.js`：24/24，通过；原检测刷新 fixture 增补真实已保存表单值，符合新的未保存检测门禁。
- 员工定向复审 5/5：仓库根 `.temp/source-not-found-20261010/employee-review/report.md`；不代独立 QA。
- Node 语法通过。额外 Facebook 历史测试 8/9，原基线同一条也失败（facebookFormPayload 未返回历史 enabled=false 合同）；本次不改无关 Facebook 行为，不将这条原有失败写成通过。
- 浏览器隔离页使用当前真实 HTML/JS 和内存 fixture API：新增→切账号密码仍显示创建且保留字段；模拟创建后列表出现真实 ID；管理及授权检测使用同一模拟 ID，未见 `/sources/undefined`。账号 password→token→password 实际 DOM 往返保留。fixture 从不读生产 env/DB，不调用真实授权/AI/采集/通知，模拟密码不保存到记录。
- 当前只读生产映射和 API 核查用于定位；未在生产创建来源、保存账密、点击检测或复制静态文件。真实映射下写流程最终验收仍待独立 QA/经理执行范围。

## 后续

独立 QA 仅验本次冻结静态身份和功能：新增合法模拟来源→创建→管理保存→检测使用同一 ID；失败/无 id/网络结果不明不重复 POST；已有源消失、切社区、旧请求返回时反馈中文且保留非敏感输入；密码不持久。真实生产验收需明确可用范围，不能拿隔离内存记录冒充生产创建成功。

最终冻结为 `v064_source_draft_candidate_manifest.json` / 仓库根 `.temp/source-not-found-20261010/candidate-v064/`。v063 保留，只补一处 INVALID_RESPONSE 未知结果门禁后重冻结，不用已变工作树替代冻结身份。
