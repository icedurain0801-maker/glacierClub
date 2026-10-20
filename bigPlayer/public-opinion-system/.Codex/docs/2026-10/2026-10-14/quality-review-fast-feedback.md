# 优质内容审核即时反馈

Status: released-and-accepted
Date: 2026-10-14

用户要求“采纳、忽略、撤销”立即处理。现役 PATCH 每次在本地审核写入后等待 `synchronizeMetadata` 完成整批 BaaS 元数据发布，前端收到响应后才更新；按钮仅禁用、没有明显进度，这是代码确认的阻塞路径。未对真实业务执行改审以测量原耗时，不将推测写成性能测量。

## 修改后的逻辑

- 审核 PATCH 保留鉴权、范围校验和数据库写入，写成功后返回当前结果，不等待整批云端发布。不是点击后虚假标记成功。
- BaaS 同步后台串行执行，正在发布期间发生的新审核合并成下一轮；失败 15 秒后重试，API 重启 15 秒后从已保存状态恢复发布。任务定时器不阻止进程退出，没有新增数据库迁移或外部集合。
- BaaS 内容读取不变；优质候选审核状态和告警独立审核状态读取本地权威候选行，覆盖旧云端审核快照；删除候选不复活，既有社区权限和内容范围过滤保留。这是现有本地写、云端读结构内的审核状态一致性修复，不表示全部业务已迁移云端。
- 按钮点击立即禁用并显示“处理中…”，提示正在保存；保存成功后直接更新列表和详情，失败保留原状态并提示错误。阻止重复提交，隔离同候选不同审核类型。递增请求序号阻止旧列表响应覆盖新审核，切换范围后不把旧范围响应写到当前页面。

## 文件及验证

`server/src/app.js` 调整审核发布触发方式和重启恢复；`server/src/services/baasReadRepository.js` 后台同步队列与审核状态读取；`../admin/PublicOpinion/assets/alerts.js` 即时进度与响应竞态保护；候选 `alerts.html` 更新脚本缓存版本。

18 项相关测试通过，覆盖失败保留状态、重复点击、三个独立审核类型、权限范围、旧云数据覆盖、发布期间新写入合并。实际候选后端 10 项通过；真实 loopback HTTP API + 可见 Edge 验证三个动作、延迟响应时立即进度、无需 reload 的成功状态更新通过。语法和空白检查通过。测试仅使用隔离候选，不写真实业务审核。

首轮基于准备时当前包克隆：API `api-release-20261014-baas-auth-recovery-r1`、前端 `release-20261014-baas-cloud-read-r2`。首轮后现役 XML 变化，未切换过时包；重新基于最新现役克隆并叠加精确修改，保留现役其他变更。最终候选 `release-20261014-quality-fast-api-r2` / `release-20261014-quality-fast-front-r2` 通过 421/46 文件 manifest 校验；仅 API 两个文件、前端 alerts.js/alerts.html 改动。最新候选后端及可见 Edge 再次通过，现役 XML 一致性核对通过，切换脚本 dry-run 通过，尚未上线。

证据 `.tests/2026-10/2026-10-14/quality-fast-feedback-tests.txt`、`quality-fast-candidate-tests.txt`、`quality-fast-feedback-browser.json`、`quality-fast-feedback-browser.png`。正式地址性能与更新验收待上线后执行；不承诺网络环境下固定毫秒时延。BaaS 离线时本地审核仍已保存并即时可读，云端发布等待恢复并重试。

按用户 AGENTS 发版门禁，准备完成后弹窗确认 API/前端切换。Git 不提交、不推送，真实审核验收若需要改变当前审核状态须明确限定范围；不得以测试为名采纳其他候选。

## 正式上线验收

用户弹窗批准“现在上线并验收”后，重新确认原 XML 一致性与 manifest，通过后切换 API r2 和基于最新前端叠加的 front r3。API 和前端均 Running，本机 API 与正式 HTTPS 前端健康检查 200。

可见 Edge 使用真实登录及官方 SDK 访问 X-Clash 优质内容页面，未路由替换业务接口或页面。对平台内容 ID 1603966 已采纳的首页推荐执行同状态保存（accepted/adopt），不改变审核结论、推荐类型或正文；该保存仍更新审核人/审核时间。正式 PATCH 200，包含点击开销实测 185ms，仅代表本次测量，不保证所有环境固定时延。按钮 pending 可观察、成功提示无需 reload、立即 GET 与刷新后 accepted 状态一致，无 pageerror。

三个动作改变状态的浏览器验证采用隔离数据，正式验收只做同状态保存，未采纳、忽略或撤销其他候选。证据 `.tests/2026-10/2026-10-14/quality-fast-live.json`、`quality-fast-live.png`。本次没有 Git commit/push、数据库迁移、Worker 切换。云端故障时后台重试仍可能延迟，操作状态以已保存权威审核行为准。
