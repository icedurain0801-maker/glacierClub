# 保留免SSO只读入口

Status: implemented

`https://lfy3001.dev.q1op.com/`作为免登录只读入口，任何持有地址的人可查看概览、帖子、评论、告警。只有GET查看合同开放；配置、凭据、授权检测、采集、处理和其他写入仍要求SSO身份与权限。其他域名继续使用原SSO流程，未关闭全局鉴权。

后端以精确域名识别只读访客，只有本机连接的转发头可用于API判断。前端代理保留原始域名，仅信任本机与实测Kong网关私网段`172.16.127.0/24`的转发头，不接受任意远程客户端伪造。网关网段变化时免登录入口会重新要求SSO，需要核对配置。

前端免登录不加载SSO SDK，展示“免登录查看·只读”，隐藏管理与处理操作。采集源列表仅返回已有脱敏概要，不开放来源详情或配置。

变更文件：`server/src/services/baasAccess.js`、`server/src/app.js`、`../admin/PublicOpinion/assets/baas-auth.js`、`scripts/windows-services/frontend3001-server.js`。

权限回归11项通过，语法及运行包校验通过。验收脚本和结果保存在`.tests/2026-10/2026-10-12/public_view_*`。本次未提交或推送Git。
