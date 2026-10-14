# v132 父任务集合与审计完整性增量

Status: DEV_SQL_PASS_REVIEW_PENDING

新增独立 `--isolated-parent-integrity`，仅正常原firstClaim epoch1的两站空feed。验证缺child membership、额外合成child、terminal links/taskSet/completionSet/schema/contract SHA逐项漂移精确拒绝，父/source/state/cursor/event零写，恢复fixture后正常并发finalize。

缺child只暂改parent membership，不删除真实child；多child使用自有合成独立row且验证后删除，无依赖无业务数据。无proof重构。首次开发原件 `.temp/overseas-real-db-Waf3FX/result.json` NO_GO：contract SHA漂移实际由绑定校验提前拒绝，测试误期待parent层错误。已修精确期待 `OVERSEAS_AUDIT_BINDING_UNPROVEN`，不放宽校验。实例已停止释放。

历史祖先锁/动态竞争与生产持久目录路径由员工只读核查，尚未实现。cursor接anchor/全失败/translation预算字段漂移仍未完成。整体NO_GO/HOLD国内不动，无真实HTTP/AI/通知或恢复。

修正测试精确错误后，活动树开发 `.temp/overseas-real-db-su7ri0/result.json`，15项PASS，实例停止/端口释放。仅五个SHA字段和集合membership，不称terminal全字段矩阵；物理删除child/所有失败亦未验证。
