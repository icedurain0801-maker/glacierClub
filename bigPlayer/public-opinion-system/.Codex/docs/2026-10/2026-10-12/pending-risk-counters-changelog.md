# 处理后风险数量更新

Status: released
日期：2026-10-12

## 行为
关注级、合并紧急告警计数改为待处理数量。po_content_handlings已有记录的内容不再计入风险数量；分析情感、风险等级和原始内容不变，已处理内容仍可在全部或已处理筛选中查询。按内容ID排除，重复确认或更改处理方式不会重复扣数。计数仍受社区、平台、日期及其他统计筛选约束；风险计数固定pending，不因列表切换已处理而显示已处理风险数。帖子/评论总量保留原有统计筛选。

server/src/db/repository.js：getContentStats风险维度及帖子/评论风险细分统一handlingStatus=pending，复用NOT EXISTS处理记录过滤。概览与内容页共用统计同步生效。
../admin/PublicOpinion/assets/content.js：处理成功后Promise.all刷新列表与统计，返回统计Promise；成功后从服务端重取数量，不采用本地扣减。失败维持数量。
../admin/PublicOpinion/content.html：风险卡片提示注明待处理口径，更新content.js版本号。
新增server/test/pendingRiskCounters.test.js。

## 验证
8项最小相关测试通过：单条、混合批量、重复处理、普通内容总量、已处理筛选口径、底层SQL分页过滤及合并风险契约。扩大repository回归有两项既有无关失败：overseas boardId、startBoundedSourceBackfill窗口（本会话之前已记录），未修改这些采集路径。
候选Edge验证真实待处理统计与pending列表meta.total一致；4次模拟提交覆盖单条、批量、重复及失败；业务写入为0。API与前端manifest通过，语法和diff空白检查通过。
发布为最新现役定点补丁：API只改repository统计段，前端只改content.js及content.html，保留其他并发变更。实际3001进程27768、4320进程43268指向新包，外网两个资产HTTP200且SHA256一致。外网浏览器只读验收结果另见pending-risk-live.json。

API：C:\ProgramData\PublicOpinion\releases\release-20261012-pending-risk-counts-1791797393979
前端：C:\ProgramData\PublicOpinion\frontend3001\releases\release-20261012-pending-risk-counts-1791797401266
回滚包保留，未重启Worker、未执行迁移、未改变真实内容处理状态。

证据：.tests/2026-10/2026-10-12/pending-risk-candidate.json、pending-risk-live.json、pending-risk-assets.json及对应截图。
