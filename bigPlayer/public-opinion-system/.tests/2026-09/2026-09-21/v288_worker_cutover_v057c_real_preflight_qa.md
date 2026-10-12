---
status: pass
priority: P0
date: 2026-09-21
role: test-owner
---

# v057c Worker cutover 真实只读 preflight 独立复核

## 结论

**PASS（真实只读 preflight 门禁）。** v057c 已满足重新申请唯一受控切换的测试资格；本次未执行切换、未创建 run，不代表线上切换完成。

## 候选与验签

- 候选：`.temp/candidates/v057c-worker-cutover-ebusy-gate-20260921`
- manifest SHA-256：`1CCDA24C3CBC5FE766A2838EAF8BB96A1A694016130255773524319E153DEB02`
- manifest 7 个文件逐项 SHA-256：7/7 匹配
- 包含 `worker-readiness.js`，候选依赖闭包完整，无 `MODULE_NOT_FOUND`

## 真实只读 preflight

从候选根目录使用 formal1 既有 ProgramData 只读参数执行：

```text
node scripts/windows-services/worker-only-controlled-cutover.js --preflight --controller=real ...
```

结果：`status=PASS`、`apiUnchanged=true`、`workerCalls=[]`。

确认范围：真实 CLI 仅执行文件/reparse/hash、`sc.exe query PublicOpinionWorker` 与 SELECT/SHOW readiness；没有 stop/install/start/apply。

## 候选门禁测试

- v227：5/5 PASS
- v283：4/4 PASS
- v284：3/3 PASS
- 合计：12/12 PASS
- `node --check`：PASS
- `git diff --check`：PASS

## 运行环境不变性

- `PublicOpinionWorker`：`Running`
- active Worker/API 工件 hash 未变
- 预检窗口新增 run：0（交测证据）
- 未写数据库、未创建 run、未操作 3001/API 配置

## 交接

已回执项目经理：v057c 真实只读 preflight PASS，可重新申请唯一受控 Worker 切换。任何真实切换和唯一 TapTap run 仍需新的明确授权；切换成功不能替代 run 验收。
