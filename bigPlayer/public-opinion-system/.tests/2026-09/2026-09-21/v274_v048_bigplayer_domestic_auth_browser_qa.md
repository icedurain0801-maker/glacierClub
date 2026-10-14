# v048 境内 BigPlayer 账号密码授权浏览器 QA

- 测试日期：2026-09-21
- 测试角色：测试负责人
- 范围：仅验收 v048 境内 BigPlayer 账号密码保存、检测授权、检测能力。
- 环境边界：只允许本机 3000；不触生产 sync、不重启 4320/v046 release、不触碰 3001、不修改候选或业务代码。

## 结论

**FAIL（唯一阻断）**

## 证据

- 候选 manifest 校验通过：375 files。
- manifest SHA-256：`E606FA21602A5E7F221689978B82D1B164A541F37C36A5A61EB7E59E150945AB`。
- 当前 3000 为旧 `.temp/qa_proxy_3000.js`；4320 为既有 v046 release；3001 保持原进程。
- 按受控替换流程以 `PORT=4321` 启动候选 API 时，进程立即退出：

```text
Error: Cannot find module './runtimeEnv'
Require stack:
...\.temp\candidates\v048-bigplayer-domestic-auth-password-20260921-qa\server\src\app.js
```

- 候选 `server/src/app.js` 首行依赖 `./runtimeEnv`，但候选 manifest 仅包含 `server\\src\\app.js`、connectors 和 authRefreshCoordinator 等文件，未包含 `server\\src\\runtimeEnv.js`。
- 4321 未监听，因此无法将 3000 代理切换到 v048，也无法在浏览器中执行密码保存、检测授权和检测能力。

## 退回开发负责人

请补齐候选运行时依赖并重新封存候选，至少确保 `server/src/runtimeEnv.js` 纳入 manifest；候选 API 能在 4321 健康启动后再提交浏览器复测。当前 3000、4320、3001 均未被本次失败操作改动。
