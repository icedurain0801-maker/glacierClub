# 优质内容列表字段及推荐操作调整

Status: 已发布、可见浏览器验收通过

## 用户已确认

区域/社区列替换为独立审核状态列；首页推荐/置顶/加精在推荐操作列；采纳/忽略/撤销移动到操作栏。帖子ID需要先核对来源。推荐理由展示真实保存的AI分析原因。

## 来源ID核对

采集器 `server/src/connectors/bigPlayerH5Connector.js` 的 q1Post 使用来源响应 item.id 保存 externalId，并以同值构造来源详情URL的 postId。截图两条数据库记录均为 post：external_id=1603966、1600672，source_url 分别包含相同 postId；内部UUID分别为482f4433-66e2-4b5f-9e12-ba389ffd70c9、6b0a7973-b487-4786-a946-7aa51e10bbd8，与帖子ID不同。本次核对代码映射、已保存记录与来源URL，未重新请求来源接口。记录 raw_payload.id 未保存，不能宣称已用当前上游响应重新核验。

## 修改

- `../admin/PublicOpinion/assets/alerts.js`：优质列表内容标识改为帖子ID；来源链接postId冲突显示待确认，不使用内部候选UUID补缺；评论不冒称帖子ID。审核状态独立，推荐操作仅展示推荐类型，实际动作位于操作栏并保留权限与防重复提交逻辑。多推荐类型分别对应审核状态和动作。详情名称同步改为推荐操作。
- 推荐理由同时展示已保存具体推荐原因和 analysis_reason。固定文案“TypeSafe结构化质量及推荐判断”不作为原因；缺失时明确显示未保存，不根据标题临时编造。两条截图记录的AI原文依据分别为阵营加成/英雄组合/克制比战力更重要，以及强英雄不等于好阵容。
- `../admin/PublicOpinion/alerts.html`：更新文案、理由布局与脚本缓存版本。
- `server/src/db/repository.js`：MySQL优质列表/详情查询补充真实analysis_reason；BaaS读模型已携带该字段，无需修改云端数据。
- `.tests/2026-10/2026-10-14/quality-columns.test.cjs`：来源ID防误用、原因缺失、审核状态与动作分离等回归。

## 发布与验证

从最新API/前端运行包克隆，按相关函数/查询片段移植，保留并行变更。仅重启API/前端，不操作真实审核、数据库历史重判或Worker。运行包清单见 quality-columns-release-manifest.json。

- 21项新旧审核及有效正文测试通过；JS语法、空白检查、前端/API健康200。
- 使用既有SSO Edge配置启动可见浏览器，在club-opinion.q1.com真实读取两条截图帖子；登录旧凭证失效时点击既有重新验证按钮恢复，不绕过鉴权。
- 浏览器检查8列表头、审核状态、操作位置、真实原因及详情名称；对采纳/忽略/撤销仅拦截保存响应进行隔离验证，真实审核未修改。
- 截图人工检查通过，页面无脚本错误。
- 证据：quality-columns-browser.json、quality-columns-browser.png。

历史TypeSafe未保存具体质量推荐解释的限制仍存在，本次展示真实分析原因并明确缺失字段；不把风险分析原因描述成已保存的质量推荐解释。
