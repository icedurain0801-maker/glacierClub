# 海外候选 14 独立 QA 收口与下一阶段

Status: isolated-next-stage / RUNTIME_NO_GO
Owner: 开发负责人
Date: 2026-10-09

## 已收口证据

测试负责人报告 `v077_overseas_candidate14_isolated_real_sql_independent_qa.md`：冻结 12 文件离线 99/99 PASS；642/642 SHA 前后一致；独立 MariaDB 7/7 PASS。新合成实例 PID34936 已退出、13316 释放，3306/3001 owner 与三个现役 PID 创建时间前后不变。旧快照、合成 datadir、日志和结果全部保留。

这些证据仅覆盖部分真实 SQL。新 Node 仅恢复两站 scope，没有执行 actual runSource；合成 terminal 设置不是采集完成；初始化器模板字符串检查不是动态子进程审计、断电或文件系统崩溃证明。生产仍为 RUNTIME_NO_GO。

## 派单与全量待办

沿用用户已批准的海外两步方案及 v092 隔离方案；项目经理已消息派发下一阶段。员工负责只读分析与具体补丁建议，开发负责人审核技术方案并作为唯一写入者落地。使用当前选择的模型，不切换模型。

| 项目 | 状态 | 验收边界 |
|---|---|---|
| 候选 14 独立离线与部分真实 SQL | 已通过 | 不等于真实运行 GO |
| 新 Node actual runSource/page/jobs/终态真实 SQL | 分析中 | actual Repository、固定合成 transport、终态与内容/任务读回，禁止伪造 SQL ACK |
| 多站部分完成与 checkpoint cursor 恢复 | 待做 | 已完成站点证据校验，剩余站点恢复，不重复授权 |
| 过期租约、epoch >1 与旧 owner fencing | 待做 | 持久合同与新 claim 证据，不以缺证拒绝代替恢复完成 |
| 自有测试 client 安全中断与 commit 未知矩阵 | 待做 | 仅自有测试 client；不杀生产或 DB，不宣称断电证明 |
| 全入口单消费者证据 | 待做 | 现役 main 不激活候选，未授权切换 |
| 第二源 board/registry/401 精确修复计划 | 待做 | 不默认 board、不刷新真实凭据、不写生产 |
| 真实上游、AI/翻译与跨平台回归 | 未授权执行 | 必须后续独立 QA 与明确运行门禁 |
| 新候选冻结并交独立 QA | 待做 | 保留候选 14，生成新 manifest/交接消息 |

## 本次记录的变更与验证

本次仅新增本记录，收口正式 QA 结果并记录下一阶段派单；未修改业务代码、冻结快照、生产配置或数据，未提交、push、发版。下一阶段复用根 `.temp` 新合成 13316/serverId20261036 实例、身份校验与 owned SHUTDOWN。合成 page/analysis/translation/checkpoint schema 只用于新测试实例，不执行项目迁移。
