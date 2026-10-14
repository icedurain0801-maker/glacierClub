# SSO 角色社区权限

日期：2026-10-13
状态：已发布

## 变更

- 左侧导航新增“权限”分组与“权限管理”页面。
- 以 SSO 返回的角色为授权主体，支持为 `Ops_chaoneng_cn`、`Ops_dengta_cn`、`Ops_weimian2_cn` 分配六项一级功能及其可访问社区。
- 新增 `po_sso_role_permissions`，以角色、导航、社区三元组保存授权；保存同一角色时在事务内全量替换，重复提交幂等。
- API 同时校验导航权限、查询参数中的社区、来源、账号和同步任务记录的实际社区归属；社区目录按授权范围过滤。
- 权限规则管理接口仅允许应用内 `admin` 访问；SSO 运营角色没有配置规则时拒绝访问。

## 发布

- 数据库迁移：`035_sso_role_permissions.sql`，已执行。
- API：`release-20261013-sso-role-permissions-r1`。
- 前端：`release-20261013-sso-role-permissions-r1`。
- 回滚配置快照：`C:\ProgramData\PublicOpinion\config\backups\sso-role-permissions-20261013-r1`。
