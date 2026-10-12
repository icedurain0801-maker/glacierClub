# TapTap BOM 回归门禁报告

- 日期：2026-09-20
- 角色：测试负责人
- 范围：`worker-only-controlled-cutover.js` 的 verified snapshot 解析边界
- 环境：Windows PowerShell `5.1.19041.3803` 外壳，Node.js `22.22.0`
- 结论：**PASS（隔离回归）**

## 执行命令

```powershell
powershell.exe -NoProfile -NonInteractive -Command "node --test .tests/2026-09/2026-09-20/v229_worker_only_controlled_cli.test.js"
```

结果：`17/17 PASS`，`0 failed`，`0 skipped`。

## 验收矩阵

| 场景 | 结果 | 证据 |
|---|---|---|
| 无 BOM verified snapshot 基线 | PASS | CLI fake apply 返回 `status=PASS` |
| 单个 UTF-8 BOM（PowerShell 5.1 写出） | PASS | 文件头 `EF BB BF`，CLI 返回 `status=PASS` |
| 双 UTF-8 BOM | PASS | CLI 以 `verified-snapshot must be valid JSON` 拒绝，退出码 4 |
| UTF-16 snapshot | PASS | CLI 拒绝，退出码 4 |
| 畸形 JSON | PASS | CLI 拒绝，退出码 4 |
| 结构缺失/哈希字段不完整 | PASS | CLI 以校验错误拒绝，退出码 4 |

## 附加门禁

- `node --check scripts/windows-services/worker-only-controlled-cutover.js`：PASS。
- `git diff --check`（相关脚本与测试）：PASS。
- `%TEMP%\\po-cli-input-*`、`%TEMP%\\po-cli-fake-*`：无残留。
- 本次仅执行隔离 fake CLI 回归；未触碰第七候选、ProgramData 服务、重启、真实 C+B 或补跑。
- 浏览器新标签已成功打开 `http://127.0.0.1:3000/`；未使用本地 3001。

## 后续阻塞

第八新 Candidate 的 C+B、受控 D、health 及一次有限 TapTap 真实验收仍待开发负责人交付候选 ID、部署材料和可执行计划；本报告不将隔离 PASS 外推为真实切换或发版通过。
