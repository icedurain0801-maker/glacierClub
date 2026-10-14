# v046 API cutover 后只读接口与浏览器回归

- 候选：`v046-bigplayer-api-cutover-20260921-0200`
- 目标 source：`5c21f78d-5f67-4467-963d-dcdeb5e26cab`
- 目标 account：`70c393cf-9600-11f1-b3d2-d85ed3ae61b0`
- API cutover 结论：`PASS`
- 浏览器内容页回归：`FAIL`

## API 只读回归

以下 GET 均返回 HTTP 200，响应无 `error`：`/health`、`games?regionCode=domestic`、目标 source、目标 account、account sync-status、source latest sync-run、sync-runs 列表。health 显示数据库 `ok`，BigPlayer connector 已安装且 configured。

最新 sync-run 仍为 `1a709456-95b3-4df8-9181-0244533c6449`，旧错误 `LOGIN_SESSION_SERVICE_UNAVAILABLE`；没有产生新 run。

当前 release 路径为 `C:\ProgramData\PublicOpinion\releases\v046-bigplayer-api-cutover-20260921-0200`，与执行记录一致；回滚 release `release-31135-668-15061` 保留。API 服务 health 200，服务状态 RUNNING。

## 浏览器证据

- 3000 来源页：PASS，页面正常加载，显示“验收社区 / BigPlayer社区”，两个验收源均显示“已授权”。
- 3000 内容页：FAIL，页面可加载但显示“帖子/评论/负面待处理/关注级 加载失败”，并显示“统计加载失败：fixture not found”。
- 未点击检测能力、开始同步、刷新保存或任何写操作。

## 独立阻断缺陷

审计记录的唯一 sync 请求：

- `POST /api/public-opinion/sources/{sourceId}/sync`
- body：`{"mode":"incremental"}`
- HTTP `401`
- 错误：`AUTH_REFRESH_FAILED`
- `newRunId=null`

该请求已按要求停止，未重试、未回滚 API、未重启 Worker、未修改数据。`AUTH_REFRESH_FAILED` 作为独立缺陷退回开发负责人；不以它否定已完成的 API cutover PASS，但当前采集恢复不可报 PASS。
