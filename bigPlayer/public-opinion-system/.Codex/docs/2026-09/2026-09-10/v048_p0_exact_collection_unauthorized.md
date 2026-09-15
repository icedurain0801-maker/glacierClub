---
last_updated: 2026-09-10
status: failed_auth_preflight
scope: p0-exact-real-collection
---

# v048 P0 精确真实采集：授权预检失败

## 执行范围

- game：`896b6b25-39ea-4979-bb87-8c1d7334fde7`
- source：`5c21f78d-5f67-4467-963d-dcdeb5e26cab`
- community：`00000000-0000-0000-0000-000000000101`
- region/platform：`domestic / bigplayer_h5`
- business date：`2026-09-09`
- trigger：`manual`

未启动全局统一调度，未启动或执行 legacy Windows task。

## 目标游戏启用守卫

执行带精确 game/source/community/platform 条件的事务守卫时，目标 game 已处于 enabled：

- before enabled=true
- affectedRows=0
- after enabled=true
- 全库 gameCount 前后均为 45
- enabledGames 前后均为 45

因此本会话没有实际修改任何游戏或来源；目标 game 应是在 v047 核验后由其他已授权流程启用。

## 单次真实采集结果

调用支持 `sourceId + businessDate + triggerType=manual` 的现有 Q1 单次入口，隔离输出目录与锁均位于 `bigPlayer/.temp/p0-20260910/`。

阶段证据：

1. target：completed。
2. preflight：running 后 failed。
3. 稳定错误码：`UNAUTHORIZED`。
4. crawler/fetch/import/analysis：均未启动。
5. `daily-report.json`：status=failed，complete=false，posts=0，comments=0，replies=0，inserted=0，errorCode=UNAUTHORIZED。

按派单规则，认证预检失败后立即停止；未刷新、替换或输出任何真实凭据。

## 数据与任务证据

- 本机精确窗口 `po_contents`：posts=0，comments=0，总数=0。
- 验收域名精确 API：post total=0，comment total=0；stats post=0、comment=0。
- 数据库 credential 元数据：`account_password` 与 `api_token` 均为 active、未过期、secret exists，且 account/source 绑定均匹配；未读取或输出 secret 值。
- 与本次手动 Q1 preflight 并行观察到的常驻 Worker 最新 sync run 为 failed，discovered/stored/fetched/inserted/comments 均为 0，错误码 `CREDENTIAL_NOT_FOUND`。
- 修正后的进程核验确认当前项目有 2 个常驻 Worker 进程；本会话未启动或停止它们。

手动入口的 `UNAUTHORIZED` 与常驻 Worker 的 `CREDENTIAL_NOT_FOUND` 共同表明：数据库中的授权状态/凭据存在性与运行时实际可用性不一致。当前不能把 `authorized + active` 元数据视为真实授权成功。

## 稳定结论与最小修复建议

汇总原因码：`P0_REAL_COLLECTION_AUTH_PREFLIGHT_FAILED`。

最小修复范围仅限精确 default account `70c393cf-9600-11f1-b3d2-d85ed3ae61b0`：

1. 在当前 Worker/手动入口实际使用的环境中核对 credential 解密键与 account/source 绑定，不输出密文或明文。
2. 对该账号重新执行受控登录/Token 刷新，使真实 `accountHealth` 返回 authorized；不得仅修改数据库状态字段伪造成功。
3. 先停止该来源反复产生 `CREDENTIAL_NOT_FOUND` 的重试或将其隔离，避免继续制造失败 run；不得停止其他来源 Worker。
4. 授权真实通过后，重新运行同一 source、同一业务日期的单次 manual 采集，并再次核对 DB/API。

本轮没有业务代码修改、提交、push 或发版。
