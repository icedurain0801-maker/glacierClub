# club.iyogames.cn 登录与采集兼容

日期：2026-10-12

- `server/src/connectors/bigPlayerH5Connector.js`：境内已允许 `club.q1.com` 的实例自动允许精确域名 `club.iyogames.cn`，复用 Q1 的版块、帖子、评论 API 分支。仅海外实例的范围不扩大。新域名须使用 HTTPS、标准端口且无 URL 凭据或 fragment；API 响应必须保持来源同 origin，防止两个允许域名之间串用认证。
- `login-session-service/src/adapters/bigPlayerH5Playwright.js`：登录 iframe 使用 URL 解析与精确域名匹配，支持 `login*.iyogames.cn`，保留原 Q1 及开发登录域名，拒绝仿冒子域和 query 伪装。
- 新增 `server/test/iyogamesCompatibility.test.js`、可见浏览器验收脚本及 JSON 结果。

## 验证

- 精确暂存版本独立导出运行：新增兼容测试、版块/评论/API 授权回归及登录 selector 回归，共 16 项全部通过；工作区含其他未提交内容的先前验证为 17 项全部通过，以精确暂存版本为提交依据。
- JavaScript 语法及暂存空白检查通过。
- 本机 API、采集 Worker、分析 Worker、LoginSession 分别从各自最新现役包复制候选，只更新本次对应文件。API/Worker 和登录运行包 manifest 检查通过；切换后四个服务均 Running。
- 可见 Edge 在正式采集源页面选择境内欢乐战三国、打开新增抽屉、填写 boardId 4 与新站点地址；无凭据请求通过站点校验后返回预期的缺少凭据错误，未创建源、未进行外部认证。
- 可见 Edge 打开新站点登录页面，识别 `login1.iyogames.cn` iframe 和可见密码框，未提交账号密码。

## 实测边界

两站公开社区及账号 JS 相同，未认证 API 契约一致。真实账号登录成功、board 权限及完整帖子/评论采集尚未验证，需要有效账号完成授权后验证。不涉及 AI 图片分析、历史数据重判或无关来源配置。
