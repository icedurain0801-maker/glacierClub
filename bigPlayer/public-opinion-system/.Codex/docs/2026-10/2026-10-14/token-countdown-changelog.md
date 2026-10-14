# 采集源 Token 有效期倒计时

- 授权标签下方新增 Token 倒计时，每秒仅更新文字，不重绘列表。
- 来源 API 返回 account.tokenExpiry（expiresAt、basis），不返回 Token 或 JWT payload。
- 优先使用凭据到期记录；无记录时在服务端解析 JWT exp，仅作展示提示，不参与授权判断。普通 Token、无法解密或无有效 exp 显示有效期未知；无 Token 凭据不显示。
- MySQL dateStrings 按仓库 UTC 配置转换为 ISO 时间；替换手工 Token 时清除旧 Token 的期限记录，避免串用。
- 隔离验证：Token 解析、未知、过期、密码凭据、UTC、解密失败、HTTP 列表脱敏，共 3 项通过；授权回归 5 项通过。语法与 diff 空白检查通过。
- 浏览器预发布：倒计时位置、每秒更新、未知、过期、无 Token 隐藏通过。BaaS 远端 SDK 直接加载超时，使用此前从官方获取的原版 SDK 缓存验证；登录会话和来源 API 使用真实服务。
- 发布包基于现役 release，仅应用本次补丁；不带入 repository.js 等其他未提交改动。不修改业务数据、不重启 Worker。

## 上线验收

- 提交 c51ec68 已推送至 origin/codex/v102-bigplayer-recovery。
- API 与前端运行在 release-20261014-token-countdown 发布包，Worker 未重启。
- 真实来源接口 HTTP 200，无凭据字段泄漏；当前 2 个 Token 解析到到期时间，4 个 Token 有效期未知，2 个无 Token 凭据。
- 正式浏览器确认真实来源显示倒计时；再用内存隔离数据验证位置、秒级更新、未知、过期及隐藏状态。测试未写入业务数据或修改凭据。
- BaaS SDK 直连加载问题仍存在，浏览器验收使用官方原版 SDK 缓存，不能视为该网络问题已修复。
- 首次发布因脚本误用 API 健康检查地址自动回滚；修正为 /health 后切换成功，正式页面/API 已复验。
