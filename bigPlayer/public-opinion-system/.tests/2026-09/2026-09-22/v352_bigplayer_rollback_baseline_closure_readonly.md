---
status: BLOCKED_ROLLBACK_BASELINE_CLOSURE
date: 2026-09-22
role: development-lead
---

# rollback 基线闭包只读核对

## 结论

`rc-b9c2` 的唯一根因是 rollback baseline 缺少 `release\checksums.sha256`。本轮不补文件、不修脚本、不创建第三次候选。

## 缺失对象

| 相对路径 | 是否生产文件 | 期望 hash 来源 | 只读结果 |
|---|---:|---|---|
| `checksums.sha256` | 否，候选闭包完整性元数据 | rollback-current-taptap/release 中同名文件的 SHA-256 | 缺失；导致 `rollback object missing for checksums.sha256` |

本次失败发生在生成器把 target payload 中的 `checksums.sha256` 当作待恢复对象处理时；当前 TapTap 基线 release 没有对应文件。候选未生成，脚本已清理临时目录。

## 为什么 v351 未覆盖

v351 只核验 `.temp/assets/release-readonly-preflight.ps1` 的存在、执行结果和身份/指纹契约，没有把最终生成器会遍历的 payload 元数据文件纳入 rollback 映射闭包，因此未提前发现 `checksums.sha256` 缺失。该缺口属于资产闭包清单与生成器实际遍历范围不一致。

## 最小修复范围

由项目经理另行决定是否允许后续返工：需要先定义 `checksums.sha256` 的元数据回滚语义（候选生成后才产生，不应伪造生产上一版文件），并让 formal-file-closure/rollback 映射与该策略一致；在此之前不得重试候选。

## 安全边界

未访问 3001，未发布、未切换、未重启、未执行真实 Run、未写数据库；未使用旧 v334c 或其他替代候选。
