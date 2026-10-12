# v363 DB 参数契约与运行时状态复测

## 结论

**FAIL / 不授权第二次 Apply**。

本次按“运行时状态从 immutable checksum 排除、改做 schema 校验”的新门禁复核，发现候选尚未完成该修复闭环：

- `executor.test.js`：`5/6 PASS`，新增 mutable runtime state 测试失败。
- 失败原因：`apply-state.json` 含 UTF-8 BOM，Node `JSON.parse` 报 `Unexpected token '﻿'`。
- `checksums.sha256` 仍有 `426` 条，且明确包含 `apply-state.json`，未从 immutable inventory 排除。
- 因此尚未达到要求的 immutable checksum `425/425`。

此前 DB 参数契约本身的 9/9 测试仍通过，但状态文件 schema 与 inventory 规则不通过，不能授权第二次 Apply。未执行 Apply、未连接或写入生产 DB。
