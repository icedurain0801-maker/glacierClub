# 境外优质内容钉钉推送字段

## 变更

境外社区选择推送“优质内容”时，钉钉 Markdown 消息现在明确包含：

- 原文
- 与当前内容 fingerprint 匹配的中文翻译
- 发布人昵称
- 发布人 ID
- 帖子或评论 ID
- AI 推荐理由

发布人字段统一使用“发布人昵称”和“发布人 ID”文案，避免与内容 ID 混淆。钉钉消息继续使用 Markdown 原生能力，不依赖网页 CSS。

## 验证

- `node --test worker/test/collectionDingTalk.test.js`：21 项通过
- `node --check worker/src/collectionDingTalk.js`：通过
- `git diff --check -- worker/src/collectionDingTalk.js worker/test/collectionDingTalk.test.js`：通过
- 未发送真实钉钉消息；仅使用隔离测试桩验证模板。

## 发布验收

- 独立钉钉计划任务已指向 `C:/ProgramData/PublicOpinion/releases/release-20261015-quality-dingtalk-r1/worker/src/baasDingTalkRunner.js`。
- 基于现役 push-types-sender-r1 增量发布，只有 worker/src/collectionDingTalk.js 运行代码改变；427 个文件 manifest 校验通过。
- 没有重启 API、采集 Worker 或数据库，没有手动运行发送任务；原每分钟计划继续工作。
- http://localhost:7793/ 刷新验收通过：优质内容包含中文翻译、发布人昵称和发布人 ID。
- 原平台不提供作者 ID 时显示“原平台未提供”；翻译尚未完成时明确提示，详情可稍后查看。
- 通用 Worker 构建曾因 scripts/refresh-overseas-shared-exclusion.js 超出构建白名单失败，未发布该构建，随后采用现役推送包增量方式完成。
