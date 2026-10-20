# 最新 BaaS 对接文档核对

Status: reviewed; full migration needs backend execution contract

## 一手资料

2026-10-14 完整读取 https://chat.q1.com/baas/sdk-guide.md 与 https://chat.q1.com/baas/openapi.json；本地原文保存 `.tests/2026-10/2026-10-14/baas-sdk-guide-current.md`、`baas-openapi-current.json`。

纠正：BaaS 是通用后端，不只是静态托管。它提供文档数据库、登录、实时、AI、文件、权限、审批、钉钉与定时通知服务。未发现自定义 Node 部署入口，不能反推平台没有后端和数据库。

## 系统能力映射

| 舆情系统功能 | BaaS 公开契约 | 接入工作 |
|---|---|---|
| 登录/角色 | auth.sso、auth.me、admin 角色/成员 | 已有 SSO 接入；迁移时保留身份与角色 |
| 来源配置/内容/处理结果 | collection CRUD、where、排序、分页、with_total | SQL Repository 改写文档映射；评论保留原帖 ID |
| 社区权限 | 集合 ACL/read_roles/write_roles | 现有每导航×社区权限不能仅前端过滤；需服务端映射集合或平台行级规则 |
| 翻译/分析 | app.ai.translate/classify/chat | 文档要求 SSO Cookie，同域页面调用，费用走用户；现有无人值守机器工作器身份待确认 |
| 内容更新刷新 | collection.subscribe、realtime | 可替换部分轮询，保持分页/日期边界 |
| 处理审计 | collection.audit、audit 策略 | 可接，但需保持 actor 与处置记录一致 |
| 通知/审批 | dingtalk、workflow | 可用，消息发送与审批需按平台真实权限和流程 |
| 静态前端 | hosting ZIP、审批、回滚 | 可部署；必须先有真实后端数据和可用接口 |
| 每 6 小时采集 | admin.jobs | 文档仅集合/审批数据查询与钉钉推送，不声明外部 API 抓取或任意脚本 |
| 登录授权/验证码 | 未发现浏览器运行、秘密管理与机器采集相关接口 | 不能把平台登录凭据放进公开前端；需后台执行能力 |
| 内容+断点+队列同事务 | CreateDoc/UpdateDoc 与唯一指定 ID | 公开 UpdateDocRequest 无 CAS/条件版本参数；未找到跨文档事务契约 |

## 关键证据

- QueryRequest: limit 1–500、offset、order_by、desc、with_total、where。
- UpdateDocRequest: data、merge、reason；无 expected_version、条件更新或事务标识。
- CollectionACL: 集合范围角色策略、author_only、append_only、lock_after_submit、audit；公开 schema 未出现社区字段级过滤策略。
- 定时任务原文：“定时查询集合/审批流 → 按模板汇总 → 推送到群机器人或个人钉钉”；每应用最多 10 个。
- AI 原文：“暂需 SSO 登录且页面与冰川同域（用登录 cookie 调用，计费走当前用户额度）”。
- 托管原文：“zip 根目录须含 index.html，只收前端文件类型，含源码/密钥会被拒”。

因此可改造成 BaaS 原生数据与页面，而不是将现有 Node.js 代码打 ZIP 当作后端部署成功。要保持无人值守采集、分析、翻译和现有原子一致性，需要平台后台执行/机器鉴权/事务或等价原子聚合实现的契约。缺少契约时不应先搬完数据库再发现采集停止。

## 当前状态

文档已完整阅读，用户授权全迁移仍有效。未修改正式数据、未切换现役服务、未上传不可运行的页面；需补齐目标后台执行契约后继续实施。若用户所指为另一份服务端/内部对接文档，优先读取其地址或文件。
