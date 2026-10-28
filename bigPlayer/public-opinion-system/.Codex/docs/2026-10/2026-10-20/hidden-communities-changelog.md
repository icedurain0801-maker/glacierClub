# 隐藏三个境外社区

- 用户指定隐藏：HeroClashS、主公、走れ！、KingdomGo。
- 范围：所有页面的社区展示；仅前端，不删除业务数据、不停采集、不修改真实授权。
- `../admin/PublicOpinion/assets/scope.js`：从共享展示白名单移除上述三项；旧 communityId 参数按现有可见社区回退逻辑处理，旧 boardId 不再解析为可选社区。
- `../admin/PublicOpinion/assets/permissions.js`：社区选项、默认选择及已配置社区摘要过滤上述三项；原有授权草稿集合仍保留其已有授权，避免保存其他社区权限时误删。
- index、alerts、content、sources、collection-runs、keywords、permissions 七个 HTML 入口升级脚本版本，避免旧缓存。
- 本地 3001 开发服务已同步；未推送公司静态托管。

## 验证

- scope.js、permissions.js 语法检查与空白检查通过。
- `node .tests/2026-10/2026-10-20/hidden-communities.cjs` 通过。
- 本地浏览器逐页检查六个业务入口，境外社区均为 11 项，三个指定社区不可见，Hero Clash 等其他社区仍保留。
- 三个旧 communityId 链接不会选中隐藏社区；旧 boardId 无可选范围。
- 权限管理使用隔离 GET 模拟数据验证选项、摘要与默认勾选，不使用真实登录、不写权限。
- 截图：`.tests/2026-10/2026-10-20/hidden-communities-content.png`。
- 待用户要求“推送静态托管”后，再发布并验收公司托管地址。
