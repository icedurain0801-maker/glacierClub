# 舆情系统全量部署到 BaaS 的预检

Status: superseded-by-confirmed-hybrid-scope

后续用户已确认：后台任务保留本机，前端和业务数据迁到 BaaS。最新实际执行状态见 `baas-hybrid-migration-status.md`。以下保留首次预检记录，不代表当前托管状态。

用户于 2026-10-14 要求将整个系统部署到 BaaS。已授权迁移目标，尚缺目标后端运行环境，不进行无法运行的静态页面假迁移。

## 已核实

当前应用 app_2473f541984b4e0696bb（舆情分析系统），控制台已登录读取成功，集合现有 8 文档，为历史有限采样，不代表正式数据库已迁移。托管尚未开通；控制台文字明确为“纯前端构建产物 zip”，每版须部门主管或平台管理员同意后上线。

2026-10-14 重新读取官方 OpenAPI：有静态托管上传、审批、版本回滚、集合 CRUD、bundle 导入导出；未检索到自定义 Node.js 后端、常驻 Worker、浏览器或通用 Cron 部署接口。此结论表示没有已证实能力，不断言平台不存在内部专用环境。

## 完整范围

| 组件 | 当前运行形态 | 目标要求 |
|---|---|---|
| 前端 | Windows PublicOpinionFrontend3001，静态与 API 代理 | BaaS 相对路径部署、SSO、可连通的真实 API |
| HTTP API | Node.js PublicOpinionApi，4320 | 常驻进程、受控入口、SSO 验证、数据库连接 |
| 采集 Worker | Node.js PublicOpinionWorker | 常驻进程，来源准入、外网接口访问、租约 |
| 分析 Worker | Node.js PublicOpinionAnalysisWorker | 常驻进程，AI 访问、预算、队列租约 |
| 翻译 Worker | Node.js PublicOpinionTranslationWorker | 常驻进程，持续 3 并发、周期补偿、预算与缓存 |
| 登录服务 | PublicOpinionLoginSession，4311 | 浏览器运行环境、验证码流程、访问限制 |
| Last Light 采集 | 独立 Windows scheduled task | 等价周期调度，保持共享 Worker 排除和断点 |
| 数据库 | MySQL/MariaDB po_ 表 | 原子事务、唯一约束、条件更新、索引、备份恢复 |
| 加密凭据 | 服务端 env 与密文业务表 | 目标秘密管理，保留加密密钥，禁止放静态 ZIP |
| 网络 | 本机 hosts/Apache + lfy3001 网关 | 非本机专用 DNS、证书、API 路由、外部服务白名单 |

原评估统计数据库约 3.17GB（2026-10-13 引擎元数据估算，非今日精确容量），不应直接用多次文档 CRUD 替代现有事务。BaaS AI 当前文档为用户登录 Cookie 计费，不等价机器后台调用。

## 执行顺序

1. 获取目标完整后端运行入口、部署文档或公司服务器环境；确认网络、数据库与浏览器支持。
2. 从各实际运行包构建部署清单；核对工作区未发布差异，排除其它业务项目、测试数据和凭据。
3. 准备目标秘密配置、版本包、数据库备份及迁移方案；验证目标权限与 AI/采集连通。
4. 验证 API、SSO/社区权限、真实评论根帖、翻译、分析、断点恢复、周期采集及告警契约。
5. 目标后端工作验证后上传可用前端 ZIP，遵循平台自身审批，不绕过审批或通知规则。
6. 切换用户入口并确保旧/新 Worker 不重复消费；校验历史数据和增量追平，保留旧包可回退。

## 当前缺少信息

已使用弹窗请求目标后端运行环境。推荐 BaaS 托管前端 + 公司服务器运行完整后端；若 BaaS 已有未公开后端环境，提供入口后按实际能力部署。

本次只读检查未开通托管、未上传业务数据库或秘密、未修改现役服务与正式入口、未产生发布审批及钉钉通知。

证据：`.tests/2026-10/2026-10-14/baas-full-migration-preflight.json`；历史完整能力评估 `docs/baas-migration-assessment-2026-10-13.md`。
