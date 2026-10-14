# v069 P0 Last Night BigPlayer 真实采集最终验收报告

- 验收日期：2026-09-10
- 测试角色：测试负责人
- 验收范围：Last Night 境外 BigPlayer 社区，source `081a16d2-5545-4afd-9c65-e04777e4540b`，北京时间 `[2026-09-08 00:00:00, 2026-09-10 00:00:00)`。
- 验收方式：只读数据库、用户侧真实 API、用户页面。未启动采集/Worker、未改代码/数据/配置。

## 结论

**PASS（P0 内容恢复验收）**。此前 2026-09-08 与 2026-09-09 均为零的数据已恢复：两个自然日的帖子与评论均非零，数据库、真实 API 和用户页面的核心内容统计一致。

## 四层验收

| 层级 | 预期 | 独立实测 | 结论 |
|---|---|---|---|
| 真实任务 | 指定单来源 run 终态成功、无错误 | run `76437a7a-8f49-4abf-85e0-88d090e2ea99` 为 `completed_authorized_scope`；`discovered=107`、`stored=87`、`fetched=25`、`inserted=25`、`comments=46`；`error_code/error_message=null` | PASS |
| 分日 DB | 9/8：post 15、comment 16；9/9：post 10、comment 20 | 只读事务按 `published_at`、北京时间与 `is_deleted=0` 查询，结果完全一致；总计 post 25、comment 36、61 条 | PASS |
| 用户侧 API | contents total 61；stats post 25/comment 36 | 两个 HTTPS 请求均为 HTTP 200；`contents.meta.total=61`、首屏 1 条；`stats={post:25,comment:36,negative:0,attention:1}` | PASS |
| 用户页面 | 同筛选下可见非零内容 | 页面实际加载为境外 / Last Light / BigPlayer社区 / 2026-09-08 至 2026-09-09；显示帖子 25、评论 36、共 25 条帖子，列表非空 | PASS |

## 口径说明

- `run.comment_count=46` 是本次抓取及 run 关联的评论计数。
- 页面/API 的 `comment=36` 按评论自身 `published_at` 落在上述北京时间窗口过滤，因此两者不应直接比较，且不构成数据缺失。
- 开发返件快照中的 `attention=2` 与验收时用户侧 API、用户页面共同返回的 `attention=1` 不同。该字段由异步分析结果动态产生，不影响本次帖子/评论恢复的验收；已按实时页面/API 值记录，建议后续单列观察。

## 环境风险（不阻塞本次结论）

- 开发返件记录 15 条异步分析 active lease，可能持续改变情感/风险衍生统计。
- 环境存在 `NODE_TLS_REJECT_UNAUTHORIZED=0` 警告，需单独整改 TLS 校验；本次未修改环境。
- 本机发现既有 Node 进程监听 `3001`，非本测试会话启动或操作；本次未占用 `3000/3001`。

## 证据来源

- 受控采集记录：`.Codex/docs/2026-09/2026-09-10/v068_p0_last_night_controlled_collection.md`
- 代码回归报告：`.tests/2026-09/2026-09-10/v067_p0_last_night_bigplayer_credential_subject_regression.md`
