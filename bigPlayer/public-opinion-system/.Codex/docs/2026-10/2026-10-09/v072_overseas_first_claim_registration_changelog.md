# 随机claim owner首次合同注册

Status: frozen-candidate8 / developer-40-PASS / runtime-NO_GO

新增显式 `initialRunBindings`：完整合同scope（run/source/account/game/community/site/board/URL/hash/window/manifest）一次性许可，不包含owner/epoch；使用严格contract校验，拒runId-only或额外字段。owner/epoch在claim后生成合同，以当前DB完整JOIN及attempts=1/live/owner/epoch=1验证后创建。许可在验证前消费，失败不得重新授予；默认resume仅读已有合同，重领不自动创建新epoch。

通过隔离factory传递，不写env/生产配置、不加入普通buildDeps。不代表生产授权；重启不得重新注入一次性许可。原精确owner合同兼容仅供隔离已知claim；本批补普通随机owner的首次候选路径与实际claim SQL/成功runSource测试。

观察持久恢复、epoch交接政策、全部入口drain/单消费者、第二源和真实运行仍未完成。候选7不修改，后续另建快照。

员工审查后统一所有首次合同epoch=1，并拒绝同runId多份许可（包括精确合同与scope许可交叉重复）。新增完整scope/runId-only/额外owner/错误manifest/epoch重领拒绝及失败消费测试。冻结v074的7tests共40/40 PASS、后632hash一致，独立QA待完成。
