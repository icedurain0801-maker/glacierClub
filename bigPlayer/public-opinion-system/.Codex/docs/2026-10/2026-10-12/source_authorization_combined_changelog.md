# 合并授权检测与配置保存门禁

Status: implemented; isolated QA passed; live credential acceptance pending

## 行为

BigPlayer现有采集源编辑页将“检测授权”和“检测能力”合并为一个“检测授权”按钮。检测当前表单的站点、版块与凭据，逐站先验证授权，再检测帖子与评论能力。授权未通过不可保存；能力结果单独展示，不把“无评论样本、未检测”冒充可用。授权通过后允许保存，保存后同步来源/账号授权与能力状态。

初始保存按钮禁用；修改站点、版块、授权方式或凭据使检测失效。检测中修改配置、切换来源、迟到响应不能放行旧表单。后端签发五分钟的内存检测凭证，绑定来源/账号/原配置/新配置/凭据；保存接口校验，重启后需重新检测。Token与密码只在请求和临时内存使用，不写URL或浏览器存储。

检测草稿不写入业务配置或凭据；账号密码通过临时登录绑定验证，检测结束清理临时凭据与会话，不替换现有登录授权。新增采集源创建流程及其他平台流程保持既有范围。

## 文件

- `../admin/PublicOpinion/assets/sources.js`：合并按钮、当前表单检测与保存门禁。
- `server/src/services/sourceAuthorizationCheck.js`：草稿校验、授权/能力串行检测、临时登录与保存凭证。
- `server/src/app.js`：新增 `POST /sources/:id/check-authorization`；配置保存校验；复用受保护的内部凭据解析临时登录。
- `server/test/sourceAuthorizationCheck.test.js`、`sourceAuthorizationRoutes.test.js`：6项隔离回归。
- `.tests/2026-10/2026-10-12/source_authorization_*`：可见Edge脚本、结果、截图与接口测试输出。

## 验证与更新

6项测试通过，包括真实HTTP路由的未检测拦截、授权失败不测能力、不写配置、成功签发凭证、变更后拒绝保存、成功保存。可见Edge在发布页加载实际JS，以隔离身份、来源、检测和保存响应验证7个交互场景，页面异常为0。

API/前端从各自现役版本复制，只移植本次改动；运行包manifest和JS语法通过。当前API与前端服务均Running。

真实采集源详情请求曾超时；随后现役已启用冰川SSO，原q1op域名提示无法完成登录。真实账号授权成功与保存链路待可用登录环境验收，未冒充完成真实凭据验收。没有写入真实采集源配置，没有提交或推送Git。
