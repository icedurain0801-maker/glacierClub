# v131 采集频率统一变更记录

日期：2026-09-15

## 需求

- 所有采集源新增、编辑表单统一为 `1 小时（3600）`、`6 小时（21600）`、`1 天（86400）` 三档。
- 新增采集源默认选择 `6 小时（21600）`。
- 不区分境内、境外、社区类型或平台；保存、回显和周期调度按所选频率生效。

## 实现

- 前端合并 Facebook、TapTap 和其他平台的频率枚举；TapTap 仅恢复采集频率字段，仍隐藏账号标识与每日执行时刻。
- 历史非三档值进入编辑页时回退显示 6 小时，保存后写入所选新档位，不再追加旧值选项。
- 服务端创建、基础配置保存和普通 PATCH 统一执行三档白名单校验，创建默认值统一为 21600。
- Repository 三个创建入口默认值统一为 21600；迁移 `024_source_frequency_default.sql` 只修改数据库列默认值，不改写已有来源数据。
- Worker 继续从 `frequency_seconds` 计算调度。为避免未迁移的历史 `900/43200` 来源突然停采，运行时暂保留历史档位兼容；UI/API 不再允许新写入这些档位。

## 验证

- `node --check ../admin/PublicOpinion/assets/sources.js`
- `node --test ../admin/PublicOpinion/assets/source-status.test.js`：18/18 通过。
- `node --check server/src/app.js`
- `node --test server/test/app.routes.test.js`：57/57 通过。
- `node --test server/test/repository.test.js`：118/118 通过。
- `node --test server/test/repositorySchedulerFrequency.test.js`：2/2 通过。
- `node --check worker/src/scheduleSlots.js`
- `node --test worker/test/scheduleSlots.test.js`：8/8 通过。
- `node --test worker/test/sourceScheduler.test.js`：14/14 通过。
- `node --test worker/test/sourceSchedulerRuntime.test.js`：4/4 通过。
- `node --test worker/test/schedulerCandidateLoader.test.js`：5/5 通过。
- `cd server && npm test`：402/402 通过。
- `cd worker && npm test`：211/212 通过；既有基线用例 `worker/test/unifiedSourceSchedulerJob.test.js` 期望 `LEASE_FAILED`，当前实现返回 `ENQUEUE_FAILED`。该测试及对应实现均不在本次 diff，定向频率与调度测试全部通过。

## 范围

- 未修改详情抽屉加载优化、授权、抓取内容、翻译及其他无关表单。
- 未 push、未发版、未批量修改已有采集源数据。
