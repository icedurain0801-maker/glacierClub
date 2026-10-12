---
status: ASSESSMENT_NO_REWRITE_RECOMMENDED
date: 2026-09-22
role: test-owner
topic: BigPlayer 采集问题重写必要性评估
---

# BigPlayer 采集功能是否需要重写

## 结论

**当前不建议重写采集功能。** 当前失败主线是发布候选门禁和运行时凭据恢复，而不是已被证明无法修复的采集业务逻辑。

| 证据线 | 已知事实 | 归因 |
|---|---|---|
| 窗口业务逻辑 | v333 候选独立复核：窗口专项 6/6、Worker 27/27、Server 145/145；00:00:10 纳入、posts/comments 同一半开区间、Discord/TapTap 不回退 | 局部窗口逻辑已有可验证修复候选 |
| 发布候选 | v337-v339：目标 release 不存在、DB 指纹占位/不匹配、rollback 抽象，无法发布前闭合 | 发布工程/证据门禁失败 |
| 生成器门禁 | v340-v341：脚本开始补强，但测试有共同提前失败，rollback command 未真正 dry-run | 候选生成与测试覆盖失败 |
| 高 FAIL 率 | v332：历史 BigPlayer 失败主要为 `CREDENTIAL_NOT_FOUND`，零抓取计数；`authorized` 元数据不等于运行时可用 | 运行时凭据绑定/配置恢复问题 |

因此，“窗口修复候选 PASS”不等于“抓取恢复”；但“候选无法发布”也不等于“采集功能必须重写”。

## 最小可验收路径

1. **先修发布门禁，不改采集设计**：v341 的四类反例必须各自以唯一失败原因通过，生成器只能在真实目标 release、真实 DB 指纹、逐文件 rollback hash 和可 dry-run 回滚命令齐全时生成 READY。
2. **重新生成冻结候选**：同一 UTC evidenceId 下提供目标 release 目录/commit/path、非敏感 DB_HOST/DB_NAME hash、前端/API/Worker payload 与具体上一版 rollback 实物。
3. **受控发布后最小验收**：按 v335 核对同版 API/Worker health，下一次正常定时 Run 的 `window_end >=` 实际执行截止，posts/comments 同窗口、详情计数拆分及 3000 GET/HEAD 用户路径。不做历史补跑。
4. **凭据恢复另案验收**：项目经理取得凭据配置后，仅验证同一 source/account/platform 的运行时解析、授权探针和一条最小真实 Run；以 `CREDENTIAL_NOT_FOUND` 是否消失及真实产出判断，不能用 `authorized` 字段代替。

## 何时才应考虑重写

仅在完成上述门禁和受控发布后，出现以下任一项，才建议评估重写或替换该采集链路：

- 同版、已验证运行时凭据可用的 Worker 仍持续把窗口上界截断，或 posts/comments 边界语义无法统一。
- 最小真实 Run 证明 connector/Worker 的状态机在正确输入下持续零产出或产生重复/漏抓，且不能由局部修复收敛。
- source/account/credential、checkpoint、Run、详情投影的现有数据合同互相矛盾，修复需要破坏性迁移或无法提供可回滚方案。
- 经过一次明确的局部修复复测仍复现同一 P0，且根因已定位到架构耦合而非配置、候选或部署证据。

## 重写风险

- 重写会扩大到 connector、调度、checkpoint、Run 详情、权限与凭据绑定，反而增加漏抓和重复入库风险。
- 历史 `CREDENTIAL_NOT_FOUND` 不会被重写自动解决，可能掩盖真实配置问题。
- 在未建立可验证 release/rollback 链前重写，只会复制当前发布门禁缺口。

本轮仅评估，未改代码、未发布、未操作服务、未执行真实 Run/DB 写入，也未访问 3001。
