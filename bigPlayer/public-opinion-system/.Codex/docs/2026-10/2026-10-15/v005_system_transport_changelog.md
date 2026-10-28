# 系统连接修复发布记录

Status: API 已发布；BaaS 静态 v5 待平台审核，正式版本仍为 v4。

用户已确认发布本轮修复，并要求更新到最新代码。旧候选准备后现役代码发生更新，已基于最新 API release-20261015-collection-runs-fast-1792071000000 和前端 release-20261015-hide-zero-1792034070106 重新打包，保留新增性能和页面修复。API 仅叠加身份只读请求的限量重试，保留现役分页计数及分页前置优化；未以旧候选覆盖现役。

静态包使用 club-opinion.q1.com API，更新资源内容哈希；8 页、39 文件。该地址依赖用户本机服务和浏览器局域网访问许可。API 已切换，两个健康端点均 200，Node 实际进程路径匹配新 release。BaaS v5 上传成功，平台返回 pending_review；正式 v4 页面实测仍引用 lfy3001.dev.q1op.com，不宣称前端正式生效。

验证：候选 API 428 文件完整性验证；相关后端 23/23，前端 42/42，托管契约 3/3；最新静态候选在可见 Edge 中访问 8 个页面，真实 SSO 和已切换正式 API，通过 GET/POST/PUT/PATCH/DELETE 连通校验；当前本机 8 页同样通过。静态候选只路由本地静态文件，身份和 API 未模拟。空审核及不存在路由验证未写业务数据。正式托管完整验收待平台批准 v5 后执行。

证据：.tests/2026-10/2026-10-15/system-transport-release.json、system-transport-hosted-status.json；前一日目录 system-transport-audit.json、system-transport-live-acceptance.json、system-transport-hosting-publish.json。

没有修改历史数据或数据库结构；Git 未提交、未推送。旧 API 包保留供回滚。用户再次强调先浏览器验证后推静态时，已说明 v5 已按此前授权上传且仍待审，随后完成切换后的候选浏览器复验，未重复上传。
