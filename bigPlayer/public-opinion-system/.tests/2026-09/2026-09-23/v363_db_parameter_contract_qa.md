# v363 DB 参数契约独立 QA

## 结论

**FAIL / 不授权第二次 Apply**。

### 已通过

- `node --test tests/executor.test.js tests/execution-gates.test.js`：`9/9 PASS`。
- 正确值 `127.0.0.1 / public_opinion` 的 UTF-8 SHA-256 identity gate 通过。
- 错误 host、错误 name 均在 identity gate 处 fail-closed；未进入 mysql 调用。
- stub mysql 实际收到 `--host=127.0.0.1 --database=public_opinion`，未输出密码等敏感参数。
- DRY_RUN 输出不含 password/secret/token。

### 阻断

候选 `checksums.sha256` 未完整通过：

```text
entries=426
PASS=425
MISMATCH=1
apply-state.json
expected FE5D58D5C8D8F3BF709C6EA03E11AF123496F80B1C1D4E0AC78950B900C7EFD0
actual   D6231167828144F4089C162E8562419B38CAAB5DC67F04BFC67A1A7E03344499
```

因此当前只能判定 DB 参数契约逻辑通过，候选资产完整性不通过；待开发负责人重新固化 `checksums.sha256` 后再复测。未执行 Apply、未连接或写入生产 DB。
