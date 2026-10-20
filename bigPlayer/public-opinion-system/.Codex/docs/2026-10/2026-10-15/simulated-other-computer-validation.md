# 异机访问近似模拟验证

Status: 本机网络模拟和已有身份浏览器验证通过；独立浏览器/其他账号首次登录未覆盖。

## 方法与边界

- 新增只读诊断脚本 `.tests/2026-10/2026-10-15/simulated-other-computer.cjs`。
- `dns.resolve4` 直接查询 DNS，不读取 hosts。HTTPS连接使用 DNS 返回地址，同时保留原域名 SNI 和证书校验。
- 不携带 Cookie 或真实凭证，不修改配置、hosts、权限或业务数据。
- 当前浏览器工具只提供内置浏览器，Edge不在可用浏览器列表；没有创建无痕浏览器，也没有清除用户已有登录。
- 当前网络环境未变化，因此不模拟其他电脑防火墙、VPN、浏览器局域网权限或其他用户授权范围。

## 网络结果

| 检查 | 结果 |
|---|---|
| club-opinion.q1.com 独立DNS | ENOTFOUND，确认依赖本机hosts |
| chat.q1.com / lfy3001.dev.q1op.com | DNS均为172.16.0.192 |
| 托管入口不带Cookie | 302到/login，登录控制有效 |
| auth/config | 200，TLS验证通过 |
| Origin chat.q1.com 的Authorization预检 | 204，允许跨域 |
| 无效Bearer会话验证 | 401 |

运行命令：`node .tests/2026-10/2026-10-15/simulated-other-computer.cjs`。
JSON报告：同目录 `simulated-other-computer.json`。语法与空白检查通过。

## 真实托管浏览器验证

- 实际访问 https://chat.q1.com/apps/public-opinion/admin/PublicOpinion/content.html。
- 页面DOM确认 API 为 https://lfy3001.dev.q1op.com/api/public-opinion，PUBLIC_OPINION_REQUIRE_SSO=true，修正包已由托管返回。
- 使用已有冰川身份刘福毅/管理员进入成功；超能世界国服版2026-10-14列表加载141条帖子/动态，当前页50条，评论366条。
- 浏览器错误日志为空，截图 `.tests/2026-10/2026-10-15/hosted-v6-content-verified.png`。
- 此浏览器验证不等同于另一账号首次SSO登录；对方电脑此前已确认能加载公司网关页面，但新托管入口仍建议由对方复验。

本次只增加诊断脚本、报告、验证记录；未推送Git、未重复发布托管版本。
