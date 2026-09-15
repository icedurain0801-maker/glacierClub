# BigPlayer 普通配置保存复测

- 日期：2026-09-14
- 地址：`http://[::1]:3000/admin/PublicOpinion/sources.html?regionCode=domestic&communityId=00000000-0000-0000-0000-000000000101&platform=bigplayer_h5`
- 范围：仅保存复测；未触发同步、回溯、抓取或 Worker

## 结果：PASS

进入唯一“大玩家H5社区”配置，确认 Token 已配置、历史起点留空，未修改字段直接点击“保存配置”。页面 toast 显示“配置已保存”，抽屉关闭并返回列表；未再出现 `syncMode must be incremental or backfill` 或历史起点校验错误。

浏览器截图已在测试会话输出并回传项目经理。
