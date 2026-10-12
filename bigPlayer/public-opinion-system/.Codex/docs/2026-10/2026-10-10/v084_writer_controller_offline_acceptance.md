---
last_updated: 2026-10-10
status: offline-model-review-fixes-accepted-production-HOLD
owner: 开发负责人
production: HOLD
---

# 准入、双gate与旧入口禁止再起的离线控制工件

本轮交付纯状态控制器dry-run；**没有生产适配器，没有apply或真实SQL/shell/service/task/network动作。** 默认实际工件不足时阻断；全部正常合成条件也只返回PLAN_COMPLETE_NOT_AUTHORIZED，actions为空，不授权切换。

当前真实采样API已漂移，原v082目标失效；基v082加原 `runtime-identity.json` 输入正确BLOCKED_API_IDENTITY_DRIFT，不自动重定向到当前login-auth-fix。现役已经排空、禁止再起、双gate实际持有及新main安全暂停均未证明。

## 精确控制范围

精确四service、Q1/overseas双task及manual入口沿v082列出，当前API新基线沿v083重新核收。本模型核task XML/Action/Enabled、Node与wrapper/createTime/command、frontend/login保护对象与新增相关manual进程，不把未见进程当未来禁止再起。

| 顺序 | 模型要求 | 当前生产证据 |
|---|---|---|
| 准备 | 已审候选、完整归档、actual API/shared准入adapter、技术manual blocker与双task定义 | API需新revision；translation归档拒读；实际adapter未实现 |
| 关准入 | API写请求/shared新run关闭，双task禁新触发，manual禁再起；已接受请求/页事务排空 | 只有离线布尔/采样fixture，不签真实状态 |
| 持双gate | 固定同connection，analysis→translation顺序，每锁有限等待≤60s，owner等于该连接 | 无生产连接。第二锁失败仅拟释放本连接已拿first lock，不释放他人锁 |
| 排空核验 | 双gate心跳/owner新采样；API/shared/page及Q1/overseas/manual树另行排空，provider未知/COMMIT_UNKNOWN阻断 | gate不充当ungated writer排空证明 |
| 拟切换 | 再一次当前owner/新运行身份采样、新main pause/loaded与交接adapter核收 | 不自动执行，仍缺实际adapter与完整核收 |
| 回退 | 保准入关闭/旧split停/Q1禁，保ledger/audit/intent，不DROP/清lease/盲重队 | 只是回退约束模型，不是RestoreAll执行器 |

模型要求失conn/owner变更/心跳过期/任务或进程漂移/manual再起/provider未知时立即BLOCKED，禁止自动provider再dispatch。BLOCKED不得通过新heartbeat/recheck恢复。

## 冻结工件与审查历史

工件均在仓库根 `.temp/risk-normalization-20261010/`，旧文件不覆盖，未重业务矩阵或三站。

| 原件 | 已执行范围与限制 |
|---|---|
| `employee-writer-controller-dryrun-v084/manifest.json` SHA `3e47251878cafda69dee724e6f400edaa92d949303e7c7c4ce07f494eb2a3618` | 15case PASS；第一轮纯模型，输入reconstructed采样只是诊断，不能代实时；随后审查指出等待参数/当前owner不足，不作为最终控制依据 |
| `employee-writer-controller-v083/manifest.json` SHA `99b34f880e08c7ba88ba70e1c4185a068aab7de46851874268650ac6f2b59162` | 16case PASS；补task/protected/manual/heartbeat/provider，原采样SHA明确；仍需有限wait与拟切换当前owner审查修复 |
| `employee-writer-controller-v083-r2/manifest.json` SHA `6c811efa34e1aca1a4791f55315f24944b21199bd46bf5bd05687fbd2c0e2a10` | 18新增直接case PASS；finite wait、DRAIN/SWITCH current owner与递增heartbeat、一次性新runtime采样、BLOCKED禁续跑；主代理又指出首次heartbeat前提，须后续最小revision核收 |
| `employee-writer-controller-v083-r3/manifest.json` SHA `0b4b9ab7297925defcfa6e3bf315f6e54244d46cf816f2a7fa4c5fdf55f1420e` | 仅1新增反向场景PASS：无prior heartbeat时DRAIN/RUNTIME_RECHECK均拒；有效既有sequence>=1/有限时间前提保留。实际原输入API漂移仍BLOCKED；productionCalls0 |

上述结果各为其对应范围，不把原case数累加成单轮完整测试。第一轮/第二轮存在审查发现，不以原PASS替代修复后结论。主代理已读r3源码核补强，r3为最后核收revision，新增case/SHA由v086正式索引记录；没有重跑已过18或业务矩阵。

## 影响、回退和未确认

仅新增忽略目录里的离线脚本/JSON与正式文档，业务源码、冻结v078和现役程序均未改。输出动作为空，没有生产写入需回滚。运输模型须保其local model依赖SHA；失败证据/旧revision保留，不删原件。

actualAPI/shared准入暂停、技术manual/Q1/script blocker、服务main暂停和实际双gate控制连接/交接都未实现。模型里成功的fixture不代表真实adapter存在；默认缺证据必须阻断。当前API包重新集成、translation完整归档或停止回退核收、loaded/main证明沿v083/v085继续单列。生产schema/config/exact名单和通知不扩实现。本工件不是批准，真实境内外定时恢复仍未完成。
