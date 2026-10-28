# 采集源最近同步与任务记录一致

Status: released
Date: 2026-10-14

## 根因
X-Clash任务在2026-10-14 14:18:22完成，但po_sources.last_success_at仍是2026-10-13 18:03:25（北京时间），账号同步字段为空。前端直接使用该旧来源时间，并从历史检查点挑选错误，所以仍显示10/13与sync run lease lost。

## 修复
- server/src/db/repository.js 的 listSources 从来源所属账号的 po_sync_runs 获取最近活动任务，按完成/开始/请求/创建时间降序，ID作为稳定排序；包含调度父任务与站点子任务。不依赖旧汇总字段、不更改采集游标或历史数据。
- ../admin/PublicOpinion/assets/sources.js 新增 recentSyncOf，普通与Facebook采集源同步列都优先使用任务的时间与结果；成功任务不再显示旧检查点错误，当前失败或部分完成保留当前错误。没有任务记录时兼容旧字段并取最新时间。
- ../admin/PublicOpinion/sources.html 更新脚本缓存版本。

## 验证
- 8项新增用例、7项来源HTTP路由回归、1项来源范围SQL回归通过。
- 真实只读查询确认最新父任务e79b6325-ddc4-427c-a55c-c20a17b36eb4，completed，完成时间UTC06:18:22=北京14:18:22，无错误。
- JS语法和git diff --check通过；API运行包425文件、前端46文件manifest校验通过。
- 克隆最新现役包，仅合入本次修改并重启API4320、前端3001；未修改数据库、未提交采集任务、未重启Worker；旧包保留可回滚。