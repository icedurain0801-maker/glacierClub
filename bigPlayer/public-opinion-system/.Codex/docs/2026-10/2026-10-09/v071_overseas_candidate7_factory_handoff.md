# 候选7可信factory与claim合同冻结交接

Status: PARTIAL_OFFLINE_38_PASS / independent-QA-pending / runtime-NO_GO

快照：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-candidate7-20261009-01`。
清单v070_overseas_candidate7_factory_frozen_manifest.json：632项源码/共享/安装依赖/lock/授权7tests/工具；Node v22.22.0；精确命令开发38/38 PASS exit0，后hash一致，仅额外snapshot-raw.txt。排除旧测试/脚本/env/服务资产与链接，禁止全目录任意运行或当部署包。

实际接线：显式CandidateFactory组装JOIN身份、具体DB+Journal verifier、ClaimedContracts、实际Adapter及原profileSpec/matchRules完整PageJobs；测试已使用该factory的resolver→prepare→页事务，非手造依赖。实际runSource负路径验证claim→persisted owner续租→缺证拒绝→failed terminal，零HTTP/零Journal创建。首次精确binding一次消费，验证失败不重新授予；恢复缺证/变epoch拒绝。worker claim后钩子及leased owner/window读取参数已接线。

候选current schema run缺URL snapshot，因此仅候选claim source钩子按config同siteId唯一启用URL选择；随后严格Journal+DB验证。当前config不作历史证据。普通buildDeps/default分支不变，无默认启动。拒直接native fetch/版本捕获；包装fetch和repo仍调用者信任边界，不是硬网络sandbox；401不自动刷新。

员工只读审查无新增安全阻断；明确未完成：预存合法Journal的runSource成功全链、真实claim SQL、随机owner普通首次注册/epoch恢复策略、历史父帖当前观察可信loader与intent/commit/reconcile、全入口drain/单消费者、第二源board/registry/401、真实DB/HTTP/AI翻译/定时槽及共享基线。不得用38PASS冒称整链完成。

请QA仅新快照核632hash/无链接/Node并执行v070.testCommand，后hash核验。Journal测试在仓库根.temp创建独立证据目录不删除。候选6及旧代码保留；现役PID19584/DB/任务/release不动，不真实HTTP、不启第二消费者、不占3001、不push/发版。
