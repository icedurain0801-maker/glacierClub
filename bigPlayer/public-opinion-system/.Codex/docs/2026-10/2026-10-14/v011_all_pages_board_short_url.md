# 全部舆情页面统一社区短参数

Status: released
Date: 2026-10-14

## 行为
- 内容、通知、采集源、运行记录、关键词页面统一使用 boardId，保留原页面路径、筛选、日期、分页和详情参数。
- 概览仍使用 /?boardId=XXX。侧栏、概览卡片、通知详情、运行内容详情不再生成长 communityId 参数。
- 全局权限管理与 API 配置不附加社区范围；从全局页面返回业务页使用本会话已选社区。
- 新增 pageQuery 用于页面链接。query 继续用于 API 请求，完整内部社区 ID 与服务端鉴权保持不变。
- 旧链接继续兼容，按社区目录真实 externalId/external_id 转换，未知或重复 boardId 禁止回退。

## 修改文件
- ../admin/PublicOpinion/assets/scope.js：统一短参数及页面查询编码、社区会话记忆。
- ../shared/sidebar.js：侧栏短链接及全局页面参数清理。
- ../admin/PublicOpinion/assets/app.js、content.js、alerts.js、collection-runs.js：导航和页面 URL 写入使用 pageQuery；API 查询继续使用 query。
- ../admin/PublicOpinion/*.html：相关脚本缓存版本更新。

## 自测与发布
- 短链接测试16项通过；现有运行记录测试4项通过。
- 修改 JS 语法检查、git diff --check、46文件运行包 manifest 通过。
- 从最新现役前端包克隆并仅应用本次修改，保留其他已上线改动；仅重启前端3001，API、Worker和数据库未变。
- 登录浏览器核对内容、通知、采集源、运行记录、关键词、全局权限页面，境外 Last Light 评论列表及详情刷新。
- 日期与内容等业务筛选参数继续保留，因此带筛选或详情的地址仍会长于只包含 boardId 的入口链接。