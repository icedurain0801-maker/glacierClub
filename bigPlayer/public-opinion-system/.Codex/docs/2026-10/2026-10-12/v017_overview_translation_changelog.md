# 概览境外详情自动中文翻译

Status: released
日期：2026-10-12

## 需求与结果

概览境外社区点击“查看”，原文下方显示独立“中文翻译”模块，自动翻译标题与正文。关注级、负面待处理、未生成事件的严重内容共用内容详情入口；评论及其所属原帖分别展示译文。真实事件详情的关联原文也接入相同展示和按需翻译。

已完成译文直接读取缓存；未完成时显示生成状态，提交当前内容翻译任务并刷新结果；失败、每日额度不足和等待超时明确提示并提供重试。保留原文、内容分析、来源信息和原帖关联。国内详情不生成翻译模块、不提交翻译。

## 实现与边界

- `server/src/services/contentTranslationService.js`：按需处理已存在翻译队列中的单条任务，复用 `AiTranslator`、中文目标语言、翻译版本、全局每日调用额度和现有翻译存储。按内容 ID 与指纹合并同进程请求，通过任务 lease 与后台翻译 Worker 互斥；完成提交校验原文指纹，失败状态不存储上游原始错误。
- `server/src/app.js`：新增 scoped `POST /contents/:id/translation`，使用详情查询保留地区和译文状态，拒绝不存在、国内、删除及空内容。评论原帖改用归属受限的详情查询，确保原帖地区、中文译文与任务状态完整返回。
- `../admin/PublicOpinion/assets/alert-detail.js`：增加可转义的翻译模块，原帖/事件关联原文复用；关联内容可继承事件地区。
- `../admin/PublicOpinion/assets/app.js`：概览原文下方插入翻译模块，自动请求和更新每条内容；单个抽屉最多同时处理两个模块。关闭或切换后不再更新已移除模块，不改写告警处置表单。
- `server/test/contentTranslationService.test.js`：缓存、并发去重、lease 互斥、失败与额度、接口归属边界、原帖译文契约、转义与事件地区继承测试。
- 发布包 `index.html`、`content.html`、`alerts.html` 更新脚本缓存版本。

未改变采集、情感/风险算法、历史重判与外部通知。按用户要求真实按需翻译会调用现有模型并保存译文、任务状态和额度用量；仅作用于打开详情中的内容及原帖，不全量重翻，不提高现有每日额度。

## 发布

持续以当前现役包为基础克隆并移植相关函数；期间检测到并行的隐藏零值和内容处置包，最终基于最新内容处置包继续，保留已开发能力。API 最终为 `release-20261012-content-handling-r1-r2-r3`；前端实际基线和最终路径见 `v018_overview_translation_release_manifest.json`。未切换 Worker 或翻译 Worker 服务。

## 验证

- `node --test server/test/contentTranslationService.test.js`：6/6 通过，全部使用隔离依赖。
- 修改 JavaScript 的语法检查、限定路径空白检查通过。
- 可见 Chromium 外网实测：截图英文紧急帖译文真实生成；重复打开直接复用缓存；关注级帖子、评论和原帖翻译通过；评论详情两个翻译模块均完成。
- 国内详情无翻译模块且未发起翻译请求。浏览器 pageerror=0。
- 浏览器首次自检发现地区字段缺失，已修复为详情查询；原帖地区和缓存译文也已修复并增加回归用例。
- 证据：`.tests/2026-10/2026-10-12/overview-translation-browser.json`、`overview-translation-urgent-live.png`、`overview-translation-comment-live.png`。

## 限制

现有翻译模型的长度与每日额度限制继续生效。上游模型不可用、额度耗尽或他处正在处理同一任务时，显示失败/等待状态，允许稍后重试；不使用虚构译文兜底。
