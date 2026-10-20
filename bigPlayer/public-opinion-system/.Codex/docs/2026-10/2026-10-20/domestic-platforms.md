# 境内平台入口收窄

- 需求：境内仅保留 BigPlayer、TapTap，其余隐藏。
- 修改：共用 assets/scope.js 的境内可选列表收窄；保留旧平台历史标签；6页 scope.js 资源版本更新。境外列表不变，旧隐藏平台 URL 自动回退 BigPlayer。
- 数据边界：未删除历史数据、未修改采集配置或权限、未推 Git 或 BaaS。
- 验证：node --check、git diff --check、运行包50文件校验通过。Chrome 候选6页通过（管理页使用隔离认证配置，真实权限未改变）；现役首页、内容页、告警页及境外到境内切换通过，近7天内容列表正常加载5行，无 pageerror。真实只读入口不具管理权限，管理页现役登录验收未执行。
- 发布：从 release-20261020-facebook-external-r1 最小复制为 release-20261020-domestic-platforms-r1，前端服务健康200。XML备份位于仓库根 .temp/domestic-platforms-20261020/frontend-before.xml。
- 测试产物：.tests/2026-10/2026-10-20/domestic-platforms/。
