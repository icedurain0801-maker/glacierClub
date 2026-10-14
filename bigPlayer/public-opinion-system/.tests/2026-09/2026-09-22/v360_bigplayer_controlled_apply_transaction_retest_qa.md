---
status: pass_readonly_candidate
date: 2026-09-22
role: test-owner
topic: v360 BigPlayer controlled apply transaction 日期身份修复复测
---

# v360 BigPlayer controlled apply transaction 复测报告

## 结论

**PASS_READONLY_CANDIDATE**。

日期身份缺陷已修复。新路径、`manifest.json`、`provenance.json` 的 candidateId 均为 `v360-bigplayer-controlled-apply-transaction-20260922`，与内部 `2026-09-22` evidence 时间一致。

## 复测结果

| 检查项 | 结果 |
|---|---|
| `node --test tests/scope.test.js` | `3/3 PASS` |
| 候选 checksums | `14/14 PASS` |
| manifest hash | `348F022D1B212B6DEDA2DB462335F2494C8D2F64AFC8A4CB1C10175575202115`，匹配交测声明 |
| provenance hash | `6AAF9C88DDA0DD5593D07D838070328FFB27F488DB1B52BECAF1CE9638ECCEE2`，匹配交测声明 |
| checksums hash | `B94C3AF92CD1948505EDE3E2F867BB226E1050D4FBB6E4263A8F841509774C27`，匹配交测声明 |
| Dry run | 退出码 `0`，输出 `mode=DRY_RUN`，生产写入/切换/重启/真实 Run/3001 均为 `FALSE` |
| `-Execute` | 退出码 `1`，`FAIL_CLOSED` 拒绝生产执行 |
| 95 checkpoint | `95` 条、`95` 个唯一 ID |
| 步骤覆盖 | STEP1 至 STEP7 顺序、029、三条 same-URL、v358 target、TapTap formal1 rollback、发布后验收和半开窗口均保留 |

## 边界

本次仅完成隔离包只读复核；未连接或写入生产 DB，未执行 DDL/config，未切换或重启 Worker，未执行真实 Run，未访问 3001，未发布或 push。
