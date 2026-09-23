# Windows 常驻服务阶段 A

Status: in_progress
日期：2026-09-17

## 已完成

- 新增 API/Worker 运行时监督器与 Windows 服务模板、安装/旧任务导出/禁用/回滚工件；仅静态和 dry-run 验证，未安装。
- 调度槽位领取、唯一任务插入、winning run 确认和 last/next 推进增加独立连接事务路径。
- 增加 Worker 心跳记录与 sync-run epoch 栅栏；负责人已补扫描异常 failed 状态和清 current_scan，移除 Worker interval unref。
- 定向测试历史检查点：监督器1/1、调度模式12/12、adapter/runtime16/16、Worker/调度94/94 PASS。上述结果不是最终全量集成或独立QA结论。
- 系统 skill-creator quick_validate：`python -X utf8` 执行成功，输出 `Skill is valid!`。恢复 skill 仅扩展本机 Worker 检查，保留本机恢复边界。

## 插单断点

- BigPlayer 能力检测 P0 已完成，独立报告 `.tests/2026-09/2026-09-17/v155_bigplayer_capability_gate_3001_4320_acceptance.md` 为PASS；本机 API 重载为PID28204，Worker/3001未重启。
- P0结单后恢复本单，侧栏排队不写码。

## 尚未完成

- 独立全局扫描租约CAS+epoch及双实例互斥测试。
- queued/running有界恢复与poisoned队列告警自动化。
- Windows工件实际可安装合同修正、最终全量集成和阶段A独立QA。

## 安全边界

阶段A不执行真实迁移、服务安装、机器环境变量写入、旧任务停用或删除、Worker重启、push和发版。阶段B仍需项目经理另行高影响门禁，24小时实跑不得加速替代。
