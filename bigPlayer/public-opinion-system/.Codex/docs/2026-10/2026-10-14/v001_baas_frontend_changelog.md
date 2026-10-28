# BaaS 前端托管 v1

Status: pending-platform-approval

本轮将 8 个舆情管理页面及共享资源构建为独立 BaaS 前端包，并开通 `public-opinion` 托管。原本机 API、采集、登录授权、分析和翻译服务继续运行，业务数据库暂未迁移。

修改 `../admin/PublicOpinion/assets/baas-auth.js`：BaaS 构建强制 SSO，允许继续使用现有 API 的角色及社区权限校验；网络失败显示局域网访问与本机服务提示。新增 `scripts/build-baas-frontend.cjs` 负责白名单构建，不包含服务源码、凭据、业务数据、测试或 Node 依赖。

验证：37 文件语法/资源检查通过；8 页面 BaaS origin 预部署路由、真实 SSO 和真实 API 读取通过；10 项现有鉴权测试通过；空白检查通过。实际 Edge 访问需要局域网权限，测试显式授权并在结果注明。

真实托管上传 v1 成功，AI 安全检查完成，medium 风险提示需审批人核实已有本机 API 网关和管理页凭据提交用途。主管/平台管理员审批 pending，current_version=0，不算已上线。业务数据迁移需平台提供本应用限定的无人值守服务身份，再完成聚合存储适配、历史迁移与增量验收。

完整边界、数据量与未完成项见 `baas-hybrid-migration-status.md`。
