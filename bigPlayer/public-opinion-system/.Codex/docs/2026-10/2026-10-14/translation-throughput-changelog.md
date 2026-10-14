# 翻译调度与调用优化

Status: released

## 已确认方案

用户“按你的方案来”授权执行前述优化并直接发布。沿用现有模型和每日 5000 次调用上限，不新增表、不迁移、不删除业务数据。

## 原因

原消费者每批 5 条都调用 enqueueMissingTranslations；只读测量一次无漏项扫描耗时 15611ms，EXPLAIN 为约 64241 条内容全扫描和排序。3 个并发仍等待整个批次结束才领取下一批，拖慢吞吐。

## 改动与逻辑

- `worker/src/translationWorker.js`：正式入口改为 3 个持续消费通道，每通道只领取 1 条，完成即领取下一条；最坏超时与重试仍受租约约束。漏项补偿在独立异步循环每 5 分钟执行，首次延迟 5 分钟，使启动时立即处理现有队列。异常记录稳定错误码；SIGTERM/SIGINT 停止领取。保留历史 controlled/priority 入口。
- `worker/src/translationCache.js`：最多 1000 条 LRU 内存缓存，按社区、来源、目标语种、版本、模型、API 和完整标准化翻译 prompt 精确哈希。相同并发输入共用一个请求；失败不缓存；复用记录 tokens 为 0，防止用量重复。重启清空，未实现永久跨重启缓存。
- `server/src/db/repository.js`：领取增加可控新任务优先排序，消费者每 5 次留 1 次 oldest-first，避免历史饿死。旧 fingerprint 不领取；补偿与领取都排除 OVERSEAS_BOUNDED_VERIFICATION_HOLD。
- `server/src/integrations/aiTranslator.js`：媒体/标签剔除后，纯表情或符号直接完成为零用量；任何语种文字与数字保留翻译。API 按需翻译同样受此规则保护。
- `../admin/PublicOpinion/assets/alert-detail.js`：纯表情显示无可翻译文字；已有译文且原文字段未返回的兼容详情仍正常转义展示。

并发依旧 3，硬上限 5，每次真实 HTTP 调用仍原子 reserveTranslationCall。人工暂停不恢复，真实失败不盲目重试。

## 发布与验证

实际服务包复制后仅叠加本轮文件，切换前核对 XML。发现 API/前端运行包已被其他操作更新，停止旧包切换，再以最新包生成 r2，保留其变化。

- 翻译消费者：`C:/ProgramData/PublicOpinion/releases/translation-release-20261014-throughput-r1`
- API：`C:/ProgramData/PublicOpinion/releases/api-release-20261014-translation-throughput-r2`
- 前端：`C:/ProgramData/PublicOpinion/frontend3001/releases/release-20261014-translation-throughput-r2`

API/前端运行包校验通过，翻译入口依赖和文件哈希校验通过。旧包与原服务 XML 保留供回滚。没有重启采集与分析服务。

46 项自动测试通过：包括缓存并发合并、失败重试/LRU、纯表情、多语种文字、持续空位领取、独立补偿周期、最新/历史分配、暂停排除、fingerprint、租约与事务、每日预算、controlled 范围。

外网 Edge 回归：评论原帖与“早上好”译文正常；纯图片无文字提示；详情翻译 pending -> completed 浏览器模拟自动刷新；关闭后不再请求，跨社区真实请求 404，帖子详情不增加原帖。页面无 JS 错误。

## 实测

发布前 09:32:55–09:37:53 最近 5 分钟完成 85 条，约 17 条/分钟。发布后首次约 55 秒观察完成数从 31212 -> 31336（+124），约 135 条/分钟，本段积压样本约 8 倍。样本包含纯媒体、表情、重复内容，不代表长文本接口单条速度提升 8 倍。

09:39:38 完整性检查：发布后完成记录无缺失译文；运行日志已完成 283 次，累计真实调用 185、文字缓存命中 23、无文字 77，节省约 100 次调用（通道日志和 DB 快照时间不同，不作为同一时点精确任务总数）。待处理从 322 -> 51，running 3；5 条人工 hold 保持 retryable，60 条真实失败保持 failed。耗时最高观测 3388ms，正常任务数秒内完成。预算没有提高。

证据：`.tests/2026-10/2026-10-14/translation-throughput-tests.txt`、`translation-throughput-live.json`、`translation-throughput-integrity.json`、`comment-detail-refresh-browser.json`。

最终 09:40:28 快照：pending=0、running=0，completed=31534，剩余 60 failed 与 5 hold。发布时 322 条排队已处理完；最后完成时间 09:39:55。三个服务均 Running。

## 限制

永久缓存及数据库索引优化未做；漏项补偿仍有单次扫描成本，但不在每条消费热路径。实际接口慢、限流和每日预算仍可能造成等待；60 条历史失败需要依据具体错误修复后重试，不能视为排队。
