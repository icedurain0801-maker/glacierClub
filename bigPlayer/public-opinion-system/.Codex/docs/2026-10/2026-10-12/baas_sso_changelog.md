# v0.1.1 舆情系统 BaaS SSO 与角色权限

Status: released-local-verified

用户确认仅本机使用，接入范围为 SSO + 角色权限，保留舆情独立数据库、API 和 Worker。本人账号的 admin 角色及应用入口已由用户弹窗授权后通过 BaaS 控制台保存。

## 改动

- 六个后台页面提前加载统一登录组件，业务请求等待 BaaS 身份及服务端权限校验完成；仅向舆情 API 发送应用 Bearer。
- 服务端固定 appKey 和 BaaS 地址重新核验 `/v1/auth/me`；非匿名用户且有已知角色才能访问。admin 管理配置，reviewer 审核处理，analyst/viewer 只读；owner 兼容 admin。
- 角色来源仅为 BaaS；客户端自报角色及操作人不能代替真实身份。已有质量审核和内容处理审计关联验证后的操作者。
- 未知接口默认需管理权限；只读来源概要仅返回名称、平台、启用状态及频率，不暴露账号或连接器配置。
- BaaS 身份请求强制校验证书，即使旧连接器设置了全局 TLS 兼容选项也不关闭身份服务的证书检查。
- 原机器导入保留机器 token 校验；未配置机器 token 时，只保留原有直连本机采集兼容，经前端代理的请求拒绝，不把代理的 loopback 地址误认作采集器。
- 本机 hosts / Apache / 独立受限域名 CA 实现 `https://club-opinion.q1.com`，不修改公司 DNS，不更换原站点证书。证书私钥及浏览器登录资料不提交仓库。
- 项目版本 0.1.0 → 0.1.1，无依赖升级、数据库迁移或历史内容调整。

## 验证

- `node --test server/test/baasAccess.test.js`：9/9；包含角色分离、身份伪造、匿名拒绝、服务异常、撤权、默认管理权限、概要脱敏、处理审计操作者及真实 HTTP 边界。
- 可见 Edge 隔离浏览器：7/7；只读、审核、管理、无角色、过期、关闭接入、跨站场景。
- 可见 Edge 真实 SSO：钉钉登录成功，非匿名身份，用户授权配置后 roles=[admin]；服务端真实 BaaS 验证通过。
- HTTPS 隔离候选服务六页真实联调：6/6，证书检查开启，未登录业务 API 401，页面无脚本错误及失败业务请求；未写入舆情业务数据。
- 本机正式域名页面及健康检查 200；原域名与 BaaS SDK 仍可访问。

## 发布边界

只发布本次 BaaS 接线、版本、测试和文档。发布时基于现役 API、前端运行包复制后应用最小补丁并校验 manifest，避免覆盖其他已发布功能。仅切换 API 与前端，Worker 不切换。身份验证开启后旧域名未登录访问会提示使用 q1.com 新入口。

运行配置默认关闭，真实联调完成后在正式 API 环境开启。发布及最终验收结果另追加，不以候选服务通过代替正式运行态验收。

## 正式本机发布与验收

- 代码提交 `d5ddfd4` 已推送至 `origin/codex/v102-bigplayer-recovery`。
- API：`C:/ProgramData/PublicOpinion/releases/release-20261012-baas-sso-1791805628411`；运行包校验 405 文件通过。
- 前端：`C:/ProgramData/PublicOpinion/frontend3001/releases/release-20261012-baas-sso-1791805628411`；运行包校验 37 文件通过。
- 正式 API 配置 `PUBLIC_OPINION_BAAS_ENABLED=true` 已生效；仅重启 API、前端服务。Worker / AnalysisWorker / TranslationWorker 发布前后进程编号不变（3268 / 37736 / 14372），均为 Running。
- 正式 `https://club-opinion.q1.com` 的六页真实 Edge 验收 6/6；admin 身份验证通过，无页面脚本错误或失败业务请求；成员与权限面板正常打开。
- 未登录 API、伪造操作人/角色头、无 token 的代理机器导入均返回 401。原域名健康检查仍 200，原域名未登录业务 API 同样 401。
- 9 项 BaaS 测试及 2 项处理状态回归，共 11/11 通过。真实验收未写入舆情内容、采集配置或审核状态。
- 结果：`.tests/2026-10/2026-10-12/baas-live-acceptance.json`；截图仅在本机测试目录保留，不提交实际业务内容截图。
- 本机信任证书及 hosts 不属于代码仓库；该入口只在本次配置的电脑解析生效。未修改公司 DNS、未发送站内信。
