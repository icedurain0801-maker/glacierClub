# 首次登录恢复修复

## 现象与证据
- 他人电脑从 https://chat.q1.com/apps/public-opinion 进入，显示 Failed to fetch；用户确认对方曾登录冰川平台。
- 已确认托管 v5 的 API 为 https://club-opinion.q1.com/api/public-opinion；该域名没有独立 DNS A 记录，仅本机 hosts 将它映射到 127.0.0.1，Apache 配置也注明 local-only。此前把本机域名作为共享接口发布的判断错误。
- 本机带已有身份可以正常进入真实 content.html，不能作为其他电脑首次登录成功的证据。
- 公共配置接口200；未登录SSO断言401带正确CORS头；SSO交换OPTIONS200。因此未证明持续CORS配置故障。
- 原脚本将SSO的网络异常原样显示并终止；重试按钮无差别清除登录状态；过期Token未在首次加载时自动重新登录。

## 修复
- 修改 ../admin/PublicOpinion/assets/baas-auth.js。
- 首次SSO网络失败或15秒超时，允许每5分钟一次正式登录页跳转；存储不可用时只显示手动入口，避免循环。
- 网络重试不清除有效凭证；会话401重新SSO并复验权限一次；403不绕过、不改权限。
- 网络失败按配置、SSO、权限服务阶段返回中文提示。

## 验证和生效范围
- .tests/2026-10/2026-10-15/baas-auth-first-visit.test.cjs：6项隔离测试通过。
- 浏览器隔离测试：首次SSO网络失败进入模拟正式登录入口；过期凭证恢复并保持只读权限，两项通过。
- 真实现役页面：已有登录状态可进入，不代表修复后首次真实SSO已验收。
- 候选包：C:/ProgramData/PublicOpinion/frontend3001/releases/release-20261015-sso-recovery-r1；仅从现役克隆，替换登录脚本及8页缓存版本号，manifest验证通过。
- 用户弹窗批准后，已将 PublicOpinionFrontend3001 切换到上述候选包；健康检查200，旧包与 XML 备份保留可回退。该切换只增强登录恢复，不会替换托管 v5 的硬编码地址。
- scripts/verify-baas-frontend.cjs 改用有真实 DNS 的 https://lfy3001.dev.q1op.com/api/public-opinion，所有托管页面仍强制 SSO。拒绝 club-opinion.q1.com、localhost、IPv4/IPv6 loopback 静态地址；4项构建契约测试与6项登录恢复测试通过。
- 新增 scripts/windows-services/test-hosted-api.ps1：无需凭据，检查独立 DNS、有效 TLS、跨域预检、无效 Bearer 401；不修改权限或 hosts。
- 托管候选由冻结的 sso-recovery-r1/public 构建，8页39文件通过资源/hash/语法检查。构建报告和zip位于仓库根 .temp/baas-sso-dns-recovery-20261015-*。
- 平台页面确认当前 v5 LIVE，没有待审批的新版本；发布必须审批，未发现审批前预览入口。
- 公司网关 DNS 指向 172.16.0.192，依赖公司网络。不能把本机浏览器/接口通过当作对方电脑跨域 SSO 验收，已弹窗请求对方电脑先验证网关页面。跨电脑与实际托管新包验证未完成前，不提交新审批。
- 未提交/推送Git，未上传BaaS托管版本。
- 切换后浏览器实测 club-opinion 本机入口：身份刘福毅/管理员正常，10/14 帖子134条；DOM确认加载 baas-auth.js?v=20261015-sso-recovery-r1。真实网关入口亦加载同日134条，只读模式正常；这两项不等同于新托管包跨电脑 SSO 验收。
- 用户弹窗回报：出错同事在同一电脑打开真实公司网关页面，能显示页面及内容列表。公司网关跨电脑可达性已确认；已另行弹窗请求提交修正zip到托管审批，批准前不上传。新包上线后仍需实际托管入口 SSO 复验。
- 用户批准提交后，已通过控制台上传 baas-sso-dns-recovery-20261015.zip，平台生成 v6 待审批，39文件/0.59MB，线上仍为 v5。未修改账号权限、未推送Git。
- 上传zip SHA256：FB7E7AD3970F56DB5F4F0CAD9824F99FE555F11B64EE3D92B22C8C35C1F2C6F5。
- 静态扫描两条非阻断告警为已有业务域名：api-config.html 中的 chat-test.q1.com（TypeSafe配置）及 sources.js 中的 club-en.q1.com（采集站点）；AI安全检查仍在进行。待审批截图见 .tests/2026-10/2026-10-15/baas-hosting-v6-pending.png。
