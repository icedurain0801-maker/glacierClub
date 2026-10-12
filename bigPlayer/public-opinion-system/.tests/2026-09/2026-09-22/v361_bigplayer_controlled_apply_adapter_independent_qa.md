---
status: fail_minimal_default_path_literal
date: 2026-09-22
role: test-owner
topic: v361 BigPlayer controlled apply adapter 独立命令审查
---

# v361 BigPlayer controlled apply adapter 独立 QA

## 结论

**FAIL（唯一最小缺陷：`ProductionRoot` 默认路径字面量错误）。**

脚本参数默认值写为 `C:\\ProgramData\\PublicOpinion`，PowerShell 单引号字符串中的反斜杠不承担转义作用，因此这是包含双反斜杠的实际字面量；后续严格门禁比较的是 `C:\ProgramData\PublicOpinion`。不显式传 `-ProductionRoot` 时，Apply 会在“实际 ProgramData 根路径”门禁处拒绝，不能满足交测要求的默认实际根路径输入。

## 已通过项目

| 检查项 | 结果 |
|---|---|
| `node --test tests/adapter.test.js` | `3/3 PASS` |
| 候选 checksums | `14/14 PASS` |
| 默认命令 | `DRY_RUN`，`productionWrites=FALSE` |
| 缺证据 Apply | `FAIL_CLOSED` |
| 错误 v360 evidenceId | 在任何 Apply 步骤前 `FAIL_CLOSED` |
| 95 基线 / v358 / TapTap formal1 hash | 静态门禁与 evidence 引用存在 |
| STEP1 至 STEP7 | 严格顺序输出，包含 029、三条 identity、target、rollback stop 条件、发布后验收及半开窗口 |

## 退回开发负责人

请将 `scripts/controlled-apply-adapter.ps1` 的默认参数改为单反斜杠实际路径 `C:\ProgramData\PublicOpinion`，并补充一个断言默认值与严格比较值相等的离线测试；修正后重新生成 14 文件 checksum 并交 QA 复核。

本轮未运行 Apply，未连接或写入生产 DB，未切换/重启 Worker，未执行真实 Run，未访问 3001。
