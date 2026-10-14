# 显式隔离候选factory组装

Status: frozen-candidate7 / developer-38-PASS / independent-QA-pending / runtime-NO_GO

新增 `worker/src/overseasBigPlayerCandidateFactory.js`：显式组装可信JOIN loader、具体DB/Journal verifier、claim合同管理器、真实Adapter、完整PageJobs及原主链profileSpec/matchRules策略。不默认修改buildDeps，不创建timer/消费者；调用方必须提供隔离repo/transport和翻译版本。非目标返回原deps/source。候选提供关闭站点session方法。

claim钩子及精确合同读取参数已接worker；MainChain现在使用真实factory/loader/合同管理器/Adapter/PageJobs的页链，不再手工组装依赖。实际runSource claim→persisted owner续租→缺证恢复失败→terminal已测，零HTTP且不创建文件；7项最小测试PASS exit0。claim SQL仍fixture方法，完整成功run及普通首次初始化入口尚未验证，不能称整段完成。

员工审查后捕获并校验light版本，拒直接原生fetch；包装fetch无法靠函数类型判别，隔离repo/transport仍是调用者可信边界，false字段不是网络隔离。factory不传刷新器，401直接失败不自动refresh。当前无verifyHistoricalScope，历史父帖证据不足继续失败关闭。

实际发现当前schema run无site_url_snapshot，候选加入resolveOverseasClaimedSource钩子：claim后从config选择唯一启用site，随后Journal＋完整persisted验证；配置不当历史证据。普通路径不设置钩子不变。新实现需另冻结，候选6结果不外推。

首次合同显式输入含完整owner/epoch，适合隔离已知claim；普通服务随机owner的首次合同注册入口和生产恢复政策仍待闭合，不能通过环境变量自动授权。当前观察恢复、完整drain/单消费者、第二源、真实执行和共享基线未完成。候选6已冻结交QA，不包含本批后续代码；不要把候选6结论外推活动树。
