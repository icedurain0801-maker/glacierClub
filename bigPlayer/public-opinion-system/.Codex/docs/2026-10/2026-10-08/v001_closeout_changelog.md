# 舆情候选收尾变更

Status: ready-for-independent-qa

## 范围与交接

仅处理舆情后台与 public-opinion-system 候选。开发完成后冻结文件清单、内容 hash、原始测试输出及迁移清单，消息交测试负责人独立 QA。未经 QA 不宣称候选完成；不发版、不操作真实采集数据。

## 已修改

- 提交前暂存检查补查历史未跟踪文档，清理 10 份文档的行尾空格或多余末尾空行；不改变业务代码。
- 独立 QA 退回管理抽屉后，修复来源详情误走列表：按 path ID 和区域/社区/平台范围读取单对象，不存在返回 404；冲突 query ID 返回 400，嵌套路径不再被列表截获。新增真实 HTTP handler 回归；旧部署慢查询未作为本候选已解决事项。
- connectorSlice 凭据夹具按 credentialType 返回凭据，避免 api_token 冒充 account_password；connectorSlice/connectors 59 项通过。
- BoardFeed、Worker 去重和日采集夹具补必填 boardId，保留生产门禁。
- 030 迁移移除正文 fingerprint 唯一索引：不同 externalId 的相同正文必须能共存；保留 source/board/external 唯一身份。
- 手动及自动多站采集游标限定当前 board，手动单站排除其他 site checkpoint，防止切换板块后漏采。
- 登录 selector 按实际元素数量和可见性回退；诊断同步等待查询结果。
- 非 BigPlayer 调度意图不新增 board/community 空字段，保持既有接口结构。
- 部署 ACL 枚举和写入失败直接阻断；AnalysisWorker 卸载失败保留 wrapper/XML；登录服务使用正式文件白名单构包并拒绝 env/链接。
- 隔离迁移子进程显式覆盖 DATABASE_URL 的数据库名，防止继承父环境或候选 .env 后误指向其他数据库。
- 两端采集准入新增 030 ledger、board 列、生成列表达式和唯一索引校验；缺项阻断运行。
- BoardFeed 回退用例使用 V2 500，另独立覆盖 403/404 必须失败且不回退，避免旧测试与当前安全合同相冲突。
- 登录回归 36/36 通过；隔离迁移环境与 manifest 负例 7/7 通过。
- 补齐 API/Worker 入口 LoginSessionClient 注入，并在账密登录前恢复账号绑定；保留登录失败禁止旧 Token 回退。
- 路由测试显式固定测试 DATABASE_URL，写入前分别校验 fixture/API 两个连接池数据库身份。
- Repository 的 DATABASE_URL 与分字段配置统一使用 UTC/dateStrings 连接选项，避免 URL 配置下 DATETIME 被本地时区转换。
- 前端测试复用真实终态判断并补完整 scope fixture，保留取消态与过期响应断言。
- 独立 MariaDB 全量迁移、030 部分 DDL 重跑、同正文不同 externalId 共存及 board 隔离验证通过；实例已关闭，未迁移现有业务库。
- 部署失败边界测试通过：ACL 枚举/子项写入失败向上传播；stop/uninstall/SCM 查询失败保留恢复工件。

## 验证状态

- `npm test`：详情路由修复后 Server 514/514、Worker 277/277 通过（`npm-final-v4.log`）；新增 5 项详情 ID、scope、404、列表兼容与嵌套路由回归。
- Login Session 36/36 通过（`login-retest.log`）。
- 前端及工具 44/44 通过（`frontend-and-tools-final.log`）。
- 独立 MariaDB 迁移与部署失败边界验证通过（`isolated-migrations.log`、`deployment-boundaries.log`）。
- 完整原始日志保存在仓库根 `.temp/po-closeout-20261008/`，不提交。

## 待完成

- 冻结候选、流转独立 QA，再根据结果处理提交。
- Last Light MALFORMED_RESPONSE 仍属另案未验收；本次没有专属修复，不以通用连接器回归代替真实环境验收。
