# 内容管理超时恢复与 API 定向修复

日期：2026-10-19
状态：API 修复已发布；整体运行态验收仍有未通过项。

## 故障与证据
页面能加载，API/数据库健康检查正常；内容列表和统计曾超过 30 秒。COUNT 执行计划从来源表开始，使用 source_collected 索引及 rowid filter，未优先按社区和发布时间缩小范围。强制已有 community_time 索引的对照查询返回相同总数，耗时约 260ms。另观察到后台读取 raw_payload 的查询运行超过 3 分钟，不能据此断言唯一根因或归因于周报。

## 恢复操作
执行 ANALYZE TABLE po_contents 更新优化器统计。该维护超过工具等待时间，期间观察到 Waiting for table flush 排队，随后已释放。尝试按严格条件取消超长只读查询时查询已自行结束，未实际执行 KILL。没有删除数据、触发采集/AI/钉钉推送。

## 修复与发布
用户弹窗批准仅发布 API 查询修复。工作区 server/src/db/repository.js：带日期的 countContents 使用与社区/来源/账号/游戏相匹配的已有时间索引，并以内容表驱动；精确内容/帖子 ID、小任务 ID 集合保留选择性计划。保留权限、风险判定、处理状态、删除标记及左闭右开日期条件。
修改 server/test/queryCounterPerformance.test.js，补充索引边界；server/test/repository.test.js 仅调整 COUNT 测试桩以兼容 STRAIGHT_JOIN。
现役基线 release-20261019-weekly-api-r2；新包 release-20261019-content-counter-r1。比较 server/shared 源码，仅 repository.js 一处文件不同。保留原环境配置，短暂停止并启动 PublicOpinionApi。Worker 未切换/重启，前端未修改。

## 验证
- 专项 7/7 通过；语法及 git diff --check 通过。
- 专项+repository 共 167 项，154 通过、13 失败；通过仅撤回本次查询块的基线对照确认，13 项均为既有失败，涉及检查点/采集记录/推荐查询测试。未扩大范围修改。
- 新运行包真实只读统计：帖子164、评论472、关注44、紧急1，单项约6–31ms。
- 真实 Edge 浏览器完成帖子、评论、关注及紧急分类点击，均加载真实数据；Console 零 error/warn。统计21–62ms、帖子85ms、评论44ms；关注列表首次12.4秒，仍需优化。后续独立外网统计探测612ms。
- localhost/LAN/外网页面、CSS、JS、auth/config均200。localhost/LAN未登录内容接口返回401，未绕过鉴权，因此内部两层真实内容读取未完整验收；外网只读入口真实内容接口200。
- API health数据库ok。

## 未解决项
Worker入口已被其他现役变更切换到 release-20261019-topic-collection-r1，本次未覆盖。UTC 12:49:24检查，最新心跳UTC12:16:08，逾期1995秒，scan running；采集任务租约和updated_at仍在推进，不能认定Worker已完全正常。关注级列表首次12.4秒。两项均未纳入本次批准的API发布范围。整体服务验收不能标记全部通过。

## 产物
- .tests/2026-10/2026-10-19/content-counter-final.json
- .tests/2026-10/2026-10-19/content-counter-published-browser.png
- .tests/2026-10/2026-10-19/content-timeout-tests.txt
- .Codex/docs/2026-10/2026-10-19/content-counter-release-manifest.json

回滚：使用保留的原服务XML恢复API入口并只重启API；不涉及数据库迁移。
