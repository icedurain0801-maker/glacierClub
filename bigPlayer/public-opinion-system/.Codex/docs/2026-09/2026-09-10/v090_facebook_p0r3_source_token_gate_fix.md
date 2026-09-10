---
date: 2026-09-10
status: ready_for_test
scope: Facebook P0-R3
---

# Facebook P0-R3 来源级 Token 门禁修复

## 一句话需求

Konga 管理页允许管理员仅填写有效 Facebook Page 地址创建停用来源，不填写 Token、Cookie、账号或密码；部署级凭据或能力不可用时，六项能力必须分别返回稳定错误码与可执行建议。

## 修改内容

## 串行提交记录

- `c5a3c8b` — `server/src/app.js` — 移除 Facebook 来源级凭据门禁并补齐六项检测合同。
- `0f37801` — `server/test/app.routes.test.js` — 覆盖停用落库、零凭据、稳定码及启用闭环。
- `67b8a65` — `../admin/PublicOpinion/assets/sources.js` — 六项能力逐项展示稳定码和操作建议。
- `09d608e` — `../admin/PublicOpinion/sources.html` — 优化分项错误布局并更新前端缓存版本。
- `8449b69` — `.tests/2026-09/2026-09-10/facebook-p0c-admin-form.test.js` — 覆盖管理员表单与逐项诊断。

- `server/src/app.js`
  - 删除 Facebook create/configuration 的来源级 Page Token 必填门禁。
  - Facebook 创建固定不写来源/账号凭据，source 默认停用，默认 account 为停用且未授权。
  - Facebook source/account 凭据写接口显式拒绝；Page ID、Page 名称和主页地址只允许官方能力检测更新。
  - `check-auth`、`check-capabilities` 返回 `systemCredentialStatus` 和 page、pageManagement、moderate、posts、comments、replies 六项对象结果。
  - 检测失败统一返回 `{ status: "unavailable", errorCode }`；不再返回 `tokenStatus`、`expireAt`。
  - 停用账号可用于能力检测；六项全部通过时自动启用默认账号，采集和来源启用在未通过时仍保持 fail-closed。
  - 保留 Page 不存在、限流和 API 不可用等细分稳定码，不压成通用能力缺失。
- `server/test/app.routes.test.js`
  - 新增无来源 Token 创建、来源/账号停用、凭据零写入、六项稳定码与 Page 管理/MODERATE 分项错误合同。
- `../admin/PublicOpinion/assets/sources.js`
  - 授权失败后仍继续读取能力检测结果。
  - 六项能力逐项展示状态、稳定错误码和中文可执行建议。
  - 系统凭据缺失、无效或过期时不再统一显示“未配置”。
- `../admin/PublicOpinion/sources.html`
  - 能力详情采用两列网格并让错误说明独占一行。
  - `sources.js` 缓存版本更新为 `v40`。
- `.tests/2026-09/2026-09-10/facebook-p0c-admin-form.test.js`
  - 更新失败检测合同，验证六项稳定错误与管理员建议。

## 验证结果

- 后端 Facebook 定向回归：87/87 PASS。
- 管理页定向回归：9/9 PASS。
- Server 全量回归：336/336 PASS。
- `node --check`：PASS。
- `git diff --check`：PASS。
- Server 在确认 running/queued 同步任务均为 0 后重载，当前 PID 21904，`/health` HTTP 200，DB `configured=true/status=ok`。
- 按项目经理门禁未重启 Worker；PID 46764、启动时间 2026-09-07 20:20:28 保持不变。

## Konga 真实页面验收

入口：

`https://lfy3001.dev.q1op.com/admin/PublicOpinion/sources.html?regionCode=overseas&communityId=00000000-0000-0000-0000-000000000102&platform=facebook`

点击“保存并检测授权”后：

- 来源成功创建，sourceId：`45214733-4f70-4780-b5eb-166e4fdd16ec`。
- source：`enabled=0`、`auth_status=unauthorized`。
- account：1 条，`enabled=0`、`auth_status=unauthorized`。
- credential：0 条。
- sync run：0 条。
- `collect_requested_at=null`、`next_scheduled_at=null`。
- “开始同步”按钮禁用，启用开关禁用。
- 六项均显示 `FACEBOOK_SYSTEM_CREDENTIAL_NOT_CONFIGURED` 和“请联系运维在服务端配置 Facebook 官方采集凭据后重新检测”。

## 外部阻塞与边界

- 当前 `FACEBOOK_GRAPH_SYSTEM_ACCESS_TOKEN` 未配置，Facebook connector 为 `installed=false/configured=false`，因此无法完成真实 Graph API 授权通过与采集 E2E；这不再阻止来源和账号停用落库。
- Worker 运行镜像陈旧，但项目经理已明确本轮不得重启 Worker。
- 当前数据库没有 `po_source_schedule_state` 表；本轮通过 source/account 停用、无 collect 请求、无 sync run、UI 同步按钮禁用证明不会进入现有采集链路。
- 未读取或输出任何真实 Facebook 凭据，未真实外呼 Facebook，未发版、未 push。
