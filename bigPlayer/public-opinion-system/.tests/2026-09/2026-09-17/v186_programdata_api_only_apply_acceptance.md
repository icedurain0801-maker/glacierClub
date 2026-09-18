# v186 ProgramData API-only 真实安装：开发验收记录

- 日期：2026-09-17
- 结论：开发侧 PASS，待项目经理正式送测试负责人浏览器验收。
- 授权范围：仅 `PublicOpinionApi`；未安装或操作 Worker，未停用或删除旧任务，未 push、合并、tag、发版或删除数据。

## 安装结果

| 检查项 | 结果 |
|---|---|
| 紧邻 `/apply` 的 API-only preflight | PASS，391 files |
| `/apply PublicOpinionApi` | PASS |
| ReleaseRoot | `C:\ProgramData\PublicOpinion\releases\release-14869-24421-11130` |
| SCM 账户 | `NT AUTHORITY\LocalService` |
| 启动模式 | Automatic (Delayed) |
| release/services/config ACL | PASS，LocalService `ReadAndExecute` |
| logs/data ACL | PASS，LocalService `Modify` |
| 部署路径泄漏 | PASS，无仓库、`C:\Users` 或 `AppData` 路径 |

## 运行验收

| 检查项 | 结果 |
|---|---|
| 初次启动与 4320 `/health` | PASS，DB `ok` |
| 正常停止/启动 | PASS |
| 强杀 API 子进程恢复 | PASS，PID `31048` 被终止后由新 PID `12736` 恢复，DB `ok` |
| localhost 页面/资源/API | PASS，页面及 3 项资源 200，games 45 条 |
| LAN 页面/资源/API | PASS，页面及 3 项资源 200，games 45 条 |
| 外网页面/资源/API | PASS，页面及 3 项资源 200，games 45 条 |
| 3001 / 3306 | PASS，PID 分别保持 `25008` / `6064` |
| 旧任务 | PASS，`BigPlayer Q1 Daily 02` 保持 Ready |
| preflight 临时目录 | PASS，0 残留 |

页面验收地址为 `https://lfy3001.dev.q1op.com/admin/PublicOpinion/index.html`。根路径 `/` 仍返回 404；3001 仍由既有临时代理提供服务，本单按授权保持不变。失败回滚未触发。

## 待测试负责人

由项目经理正式下发浏览器强刷验收：确认非 504、非白屏、页面资源完整、真实数据渲染、Console 零 error/warn。API QA PASS 前继续禁止 Worker。
