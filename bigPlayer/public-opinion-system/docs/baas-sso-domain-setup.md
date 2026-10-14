# BaaS SSO 域名接入

Status: local-domain-sso-released-verified

目标入口为 `https://club-opinion.q1.com/admin/PublicOpinion/index.html`。用户于 2026-10-12 确认仅在本机使用；已采用本机 hosts 和 Apache 专属 HTTPS 虚拟主机，无需公司 DNS 或网关变更。SSO 与角色权限接入保留原有 API、数据库及 Worker；域名配置不迁移数据。

## 已落地的本机配置

- hosts：`127.0.0.1 club-opinion.q1.com`，仅此电脑生效。
- Apache：`C:/xampp/apache/conf/extra/httpd-public-opinion-local.conf`，HTTP 跳转 HTTPS，HTTPS 完整转发至 `127.0.0.1:3001`。
- 独立证书及备份目录：`C:/ProgramData/PublicOpinion/local-https`。目录 ACL 仅管理员与 SYSTEM 可访问；私钥不提交仓库。
- 当前用户 Root 信任专用本机 CA；CA 设置域名约束 club-opinion.q1.com，不覆盖其他站点。CA 有效期 730 天，站点证书 365 天。
- Apache 语法检查通过；配置已重载。Edge 默认启用证书校验，无证书跳过参数，页面及接口返回 200，无脚本错误；原站点及 BaaS SDK 仍返回 200。
- 浏览器从新域名读取主站 SSO 断言接口成功，未登录时返回可读的 401。用户已完成钉钉认证，真实 SSO 及服务端身份校验成功；用户弹窗授权后，其本人账号的 admin 角色和应用入口已在 BaaS 保存。
- Windows curl 对本机 CA 无吊销服务报吊销查询错误；`--ssl-no-revoke` 的仅吊销检查关闭探测返回 200。浏览器的正常证书校验已经单独通过，不以 curl 跳过检查替代浏览器验收。

### 本机配置回退

`local-https/setup.json` 记录原 Apache 配置、hosts 备份路径和专用 CA 指纹。仅回退本次 Include、虚拟主机和 hosts 条目，并从当前用户 Root 移除对应指纹的 CA。若配置后其他任务修改了 hosts 或 Apache 配置，按本次条目精确移除，不整文件恢复旧备份。最后检查 Apache 语法并受控重载。不修改原 chat.q1.com 或 lfy3001 站点。

以下正式 DNS／网关方案保留为将来跨设备访问的参考，本次未执行。

## 已核实

- 本机地址：`172.16.2.48`；前端代理端口：`3001`。
- `http://127.0.0.1:3001/healthz/frontend` 返回 200。
- 现有 `lfy3001.dev.q1op.com` 解析到 `172.16.0.192`，其前端健康检查返回 200。
- `club-opinion.q1.com` 当前 DNS 查询返回名称不存在。
- 本机 Apache 证书仅覆盖 chat.q1.com、cli-chat.q1.com、localhost 及 127.0.0.1，不覆盖目标域名。

## 入口配置要求

1. 在 q1.com 的实际 DNS 管理平台创建 `club-opinion` 记录，指向能够连通本机 3001 的受控 HTTPS 网关。网关 IP 待确认，不将本机私网地址误作公网地址。
2. 网关安装覆盖 `club-opinion.q1.com` 的有效证书，提供完整证书链；HTTP 入口跳转 HTTPS。
3. 网关保留完整 URI，将此域名的请求转发到 `http://172.16.2.48:3001`。其中 `/api/public-opinion/` 由现有前端代理转至本机 API；不改变路径前缀。
4. 转发 Host 与 X-Forwarded-Proto=https；Authorization 头必须保留。仅允许受控网关访问该上游，网络连通性由入口管理员验证。
5. 保留现有域名和服务。单独配置新域名，不更换共享默认站点或已有证书。

Kong 配置应建立专属 Service（上游 http://172.16.2.48:3001）和按 hosts=[club-opinion.q1.com] 匹配的 Route；strip_path=false，preserve_host=true。证书绑定此域名的 SNI。实际管理 API、凭据和版本待提供，不执行猜测性远程配置。

## BaaS 设置及启用

- BaaS 地址：`https://chat.q1.com/baas`，公开 appKey 已由用户提供并接线；不需要管理密钥写入前端。
- 应用使用 SSO 模式；如平台要求来源／回跳白名单，登记 `https://club-opinion.q1.com`，具体字段以平台为准。
- 角色：admin 配置与全部操作；reviewer 内容审核处理；analyst/viewer 只读。owner 映射 admin。未分配角色拒绝访问，不自动授权。
- 服务端固定应用身份向 BaaS `/v1/auth/me` 验证 Bearer，不信任客户端角色头。机器导入保留原机器 token 校验。
- `PUBLIC_OPINION_BAAS_ENABLED=false` 保持当前运行行为。真实 SSO 和权限验收成功后，才能在 API 运行环境开启并受控重载。
- 真实 SSO、隔离接口及浏览器测试、六页候选和正式本机浏览器验收均已通过。正式 API 已启用鉴权，代码提交 d5ddfd4 已推送，详见当日 baas_sso_changelog.md。

## 验收与回退

验证 DNS、证书、前端健康检查、同源 API、真实登录、无角色拒绝、只读越权拒绝、审核权限及管理员入口；测试产物不得包含 token 或 cookie。API 以 BaaS 验证身份记录已有处理审计 actor。

若新入口配置失败，删除本次新增的专属路由及 DNS 记录，保留旧入口。启用身份验证后的回退需受控操作并说明恢复旧鉴权行为的影响，不能自动静默关闭鉴权。
