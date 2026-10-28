# 优质内容配置上线记录

状态：已于2026-10-15按用户“要上线”授权切换并验收。Git未提交、未推送；未上传BaaS静态托管。

目标：用户截图访问的 https://club-opinion.q1.com/admin/PublicOpinion/keywords.html?boardId=100017&platform=discord 。浏览器实际登录并加载“境外／Last Light”，已显示优质内容开关、帖子/评论范围、0.70最低评分、50字正文门槛及可编辑规则，无页面脚本错误。

本次为现役运行包上的最小功能补丁：分别复制各服务自己的现役包，仅应用优质配置、候选规则快照、手动重判取得当前策略及必要的候选失败重试修正。保留现役v13风险研判逻辑，不夹带工作区尚未授权上线的v14评论语境/L1复核等改动。AnalysisWorker原包缺少质量原因生成模块，补齐现役API同版模块；补齐Q1失败路径原先缺失的错误脱敏函数，保证候选写入失败可重试。

## 发布版本与回退

四个服务的候选包版本后缀：`quality-config-1792052129094`。API、采集Worker、分析Worker、3001前端均已切换，服务为Running，API及前端health通过。原始运行包未修改，原XML与切换计划保存在Git根`.temp/quality-policy-release-plan.json`及`PublicOpinion*.before-quality-config.xml`。回退时恢复这些XML并按先停Worker、再停前端/API，先起API、再前端/Worker的顺序恢复；新增可空字段可保留。

迁移039已执行并登记到`po_schema_migrations`，只增加可空quality_policy字段。迁移前后候选记录均为1777；未批量重判、删除或改变审核状态。

## 验证证据

- `quality-policy-release-tests.txt`：针对实际候选API/Worker模块的34项测试全部通过，包含HTTP路由、可配置门槛、旧候选兼容、双查询通道及候选失败重试。
- 包闭包及SHA256 manifest：API 429文件、采集Worker 431文件、分析Worker 428文件、前端47文件验证通过。
- `quality-policy-live-migration.json`：迁移及记录数量。
- `quality-policy-live-assets.json`：现役HTTP返回的HTML与两个JS和冻结候选字节及hash一致。
- `quality-policy-live-validation.json`：登录浏览器、实际配置显示、候选SQL查询及服务运行包路径。

现役页面读取及候选查询已通过，保存修改链路在隔离HTTP/浏览器环境中验证，未为自测改变用户线上策略。以前工作区扩大回归的3项既有Worker失败仍见quality-policy-changelog.md，不把它们表述为已修复。
